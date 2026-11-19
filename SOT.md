# credex — Source of Truth (SOT)

Last updated: 2026-11-19 · App version: 0.1.0 · DB schema: 6

## 0. How to use this file
- Attached to every prompt. It is authoritative: if code and SOT disagree, or a request conflicts with it, STOP and say so before changing anything.
- **Any change that affects this file must update it in the same change:** schema/migrations, IPC operations, business rules, folder/config behavior, project structure or conventions, dependencies/scripts, release pipeline. Add new migrations to §6, new rules to §7, new operations to §8. Bump "Last updated" (and version/schema when they change).
- Document decisions and contracts, not implementation detail the code already shows. Keep this file under ~250 lines.
- End every task with: "SOT updated: yes/no (what)".

## 1. Product
Offline Windows desktop ledger for a garments/DTF printing shop: clients, sales invoices (many design lines each, with images), payments against invoices, per-client balance. One install = one business, one user, no login/roles/PIN. Works fully offline.
Not built (do not add unless asked): cloud backup/sync, registration/licensing, other reports beyond client ledger PDF, Excel export, Urdu/RTL, discounts, taxes, advances/credit, backup creation/restore (the backup folder setting exists, backups do not).

## 2. Stack and commands
- Electron + electron-vite, React, TypeScript, better-sqlite3 (raw SQL, no ORM), zod (IPC validation), vitest (`src/core` and pure helpers), electron-updater, electron-builder (NSIS).
- Windows only. Dev machine needs Node LTS and VS Build Tools (C++) for the native module.
- Main scripts: `npm run dev`, `npm run typecheck`, `npm test`, `npm run build:win` (also `format`, `lint`, `build`, `build:unpack`). Dev seed (outside app modules): `npm run seed:ledger` → client `Papa Garments (Seed)`, 120 issued invoices × 16 lines + images/payments via real services; refuse if that client already exists.
- Identity (frozen forever): productName `credex`, appId `com.credex.app`.
- Before finishing any task: run typecheck, test, build:win and report problems.

## 3. Release pipeline (do not touch appId, electron-builder.yml publish block, workflow, or updater logic unless the task is about them)
- Private source repo `credex`; public releases-only repo `mustafa2922/credex-releases`.
- Tag `vX.Y.Z` → GitHub Actions (windows-latest, secret `RELEASES_TOKEN`) → create/ensure GitHub release on credex-releases → `electron-builder --win --publish always` → assets include `credex-setup.exe`, `latest.yml`, blockmap. `releaseType: release` (never draft).
- Installer: NSIS, per-user (`perMachine: false`), oneClick, desktop shortcut, `deleteAppDataOnUninstall: false`, artifactName `credex-setup.exe`. Unsigned (SmartScreen warning is expected).
- Landing page on Netlify; its Download button links to `releases/latest/download/credex-setup.exe`.
- Updater: checks on launch (packaged builds only), downloads in background, installs on quit or via Settings "Restart and update". Status shown on Settings (not Home).
- Version is bumped only when releasing: `npm version X.Y.Z --no-git-tag-version`, commit, tag, push. Feature work does not bump the version.

## 4. Folders and config
- `config.json` in Electron `userData`: `{ dataDir, exportsDir, backupDir }`, absolute paths, atomic writes (temp + rename), zod-validated. Existing config is authoritative. Exception: legacy configs with missing/null `backupDir` are rewritten once to the default backup path.
- `src/main/paths.ts` is the ONLY place that resolves app folder paths (`dataDir` / `exportsDir` / `backupDir`, derived dirs, and OS temp). No other code calls `app.getPath` for folders or hardcodes them.
- **dataDir** (default `userData`): `ledger.db` (+ `-wal`, `-shm`), `files/` (images and attachments), `logs/`, `premigration/` (safety copies). Self-contained: the DB stores filenames only, never absolute paths.
- **exportsDir** (default `<Downloads>\credex`): PDFs auto-save here, named by invoice number (`INV-0007.pdf`, then `INV-0007 (2).pdf`; never overwrite; ` - no rates` suffix when rates hidden) or client ledger (`{Client} ledger.pdf`). Toast with Open file / Open folder. Write failures show an error toast with path, reason and "Change exports folder".
- **backupDir** (default `<Downloads>\credex\backups`): must not be inside dataDir; warn/confirm if on the same drive as dataDir. No backup logic yet.
- Startup safety: if config exists but dataDir or `ledger.db` is missing/unreadable, show a blocking screen (Retry / Choose folder / Quit). NEVER create an empty DB in that case. Fresh install (no config): use defaults and write absolute paths to config.
- Change data folder: reject UNC paths, nesting inside/around current dataDir; confirm on OneDrive/Dropbox/Google Drive/iCloud paths; target must be empty (copy) or a valid existing data folder (schema ≤ app's). Copy flow: WAL checkpoint → close DB → copy folder → open copy, `integrity_check`, compare row counts (clients, units, invoices, payments) → write config → relaunch. Any failure: remove partial copy, keep old config, relaunch. Never delete the old folder.
- Settings page shows all three folders (path, status chip OK/Missing/Not writable/Not set, free space, Open/Change), app info (version, schema, DB file/size, config file, logs), Open config/logs, Copy diagnostics, update check, and theme toggle (dark/light; theme is localStorage + `window:theme`, not settings IPC).

## 5. Architecture and code conventions
Flow: Renderer → preload (typed `window.api`) → main IPC (zod-validated) → service → SQLite.
```
src/core/        pure TS (money, due/paid/status, folder helpers) + vitest; no Electron imports
src/shared/      shared types/helpers used by main + preload + renderer
src/main/        index.ts, db.ts, migrations.ts, paths.ts, logger.ts, updater.ts, files/
  modules/       clients/ units/ invoices/ payments/ settings/
                 (each: service.ts + ipc.ts; clients/units/invoices/payments also schemas.ts)
src/preload/     index.ts (typed API), index.d.ts
src/renderer/    pages + shared components
```
- Service holds SQL and rules; schemas live in `schemas.ts` (settings: zod inline in `ipc.ts`). New feature = new module folder + migration + preload API + page.
- Multi-table writes run in ONE transaction. Totals/due are recomputed in main; never trust renderer-supplied numbers.
- IDs: UUID text. Timestamps: ISO `created_at`/`updated_at`. Dates: `YYYY-MM-DD` local. Status columns use CHECK constraints.
- No hard deletes except never-issued draft invoices (`number IS NULL`). Errors returned to the UI are readable messages.
- Never: edit an applied migration, store absolute paths in the DB, use floats for money, change appId.

## 6. Database (SQLite, WAL, foreign_keys ON)
Migrations: forward-only, numbered, appended in `migrations.ts`, applied at startup in a transaction. A safety copy goes to `premigration/` before upgrading an existing DB. The app refuses a DB with a newer schema than it knows.

| v | Adds |
|---|---|
| 1 | `app_meta(key, value)` (+ `created_at` meta row) |
| 2 | `clients(id, name NOT NULL, phone, status active\|inactive, created_at, updated_at)`, index on name |
| 3 | `units(id, name NOT NULL, status active\|inactive, …)`, unique index on name NOCASE |
| 4 | `invoices(id, number nullable unique, client_id FK, invoice_date, status draft\|issued\|void, total, void_reason, issued_at, …)`; `invoice_lines(…)`; seeds `invoice_counter` in `app_meta` |
| 5 | `payments(id, invoice_id FK, amount > 0, method cash\|cheque\|online, payment_date, reference, note, attachment_path, status active\|void, void_reason, voided_at, …)` |
| 6 | Drop `payments.reference` |

Money: integer paisa (rates, totals, payments). Quantity: integer thousandths (max 3 decimals). Line total = round-half-up(rate × quantity / 1000) using integer/BigInt math. Invoice total = sum of line totals.

## 7. Business rules
**Clients:** name required (1–100), phone optional (≤20; digits, spaces, + - ( )), duplicates allowed. No delete: active/inactive only. Inactive clients are hidden from pickers for new invoices; their history stays. Balance = sum of dues of the client's issued invoices. Ledger PDF (per client): issued unpaid/partial only; line rows with images + active payment rows; running balance; per-invoice subtotals; footer totals (balance/received/due); same A4 HTML/`printToPDF` style as invoice PDF.

**Units:** name 1–30, unique case-insensitive. No delete. Inactive units can't be picked for new lines; existing lines keep their `unit_name` snapshot.

**Invoices:** draft → issued → void.
- Draft: editable, may have zero lines; save replaces all lines in one transaction. Client must be active; line: name 1–100, active unit, quantity > 0, rate ≥ 0.
- Issue: needs ≥1 line and total > 0. Assigns `INV-0001`-style number (gapless; counter in `app_meta`, incremented inside the issue transaction); numbers are never reused. Reopened drafts keep their existing number. Issued is read-only.
- Reopen: issued → draft, keeps its number; blocked if the invoice has active payments.
- Void: reason 1–200; blocked if active payments; read-only forever; number kept.
- Delete: only never-issued drafts (`number IS NULL`; removes lines and image files).
- Images: png/jpg/jpeg/webp, resized via nativeImage (longest side ≤ 1600px, JPEG q85), stored as `files/<uuid>.jpg`; DB stores filename only; served to the renderer by a custom protocol restricted to `files/`; replaced/removed images are deleted from disk. Renderer may also send bytes via `invoices:saveImage`.

**Payments:** each row belongs to one ISSUED invoice. Create is client-scoped (`client_id` required; inactive OK if receivable > 0) with optional `invoice_id`. Selected invoice: must belong to client + be issued; amount ≤ that due else `Invoice due is X` (no spill). Blank invoice: oldest-first across issued dues (`invoice_date`, then number) via `allocateOldestFirst` in `src/core`; none → `Nothing due`; over total → `Client owes X`; one payments row per allocated invoice (shared method/date/note/attachment). One transaction; create returns created rows (invoice number, amount); failed create deletes a newly picked attachment. Method cash/cheque/online, date, optional note (≤200), attachment (same image pipeline). No `reference` field. Never deleted: void with reason (1–200); voided restore due. No advances/credit. Void/reopen/invoice-void guards unchanged.
- paid = sum of active payments; due = total − paid (never negative); payment status Unpaid / Partial / Paid is derived, never stored. Draft/void invoices report paid/due 0.
- Client balance = sum of dues over issued invoices (= issued totals − active payments).

**Invoice PDF:** A4 via hidden window `printToPDF`; shows number, date, client name and phone, lines (image, name, unit, qty, rate, total), total, active payments, paid, due. "Hide rates" omits the rate column.

## 8. IPC / preload API (`window.api`; exact channel names live in `src/preload/index.ts`)
- **app:** `info` → `{ version, schema }`; `startup` / `retryStartup` / `chooseDataDir` / `quit`
- **updates:** `checkUpdates`, `installUpdate`; event `update-status`
- **window:** theme, minimize, toggle-maximize, close, is-maximized, maximized event (custom title bar)
- **clients:** list({ search, status }), create, update, setStatus, exportLedgerPdf({ client_id })
- **units:** list({ search, status }), create, update, setStatus
- **invoices:** save, get, list({ search, status, client_id, payment_status }), issue, reopen, void, deleteDraft, pickImage, saveImage, exportPdf({ hideRates })
- **payments:** create({ client_id, invoice_id?, amount, method, payment_date, note?, attachment_path? } → { created: [{ invoice_id, invoice_number, amount }] }), preview({ client_id, invoice_id?, amount } → split or error; no writes), list({ invoice_id, client_id, status, search }), void, pickAttachment
- **settings:** get, copyDiagnostics, pickDirectory, inspectDataDir, changeDataDir, changeExportsDir, changeBackupDir, openPath, showInFolder, openConfig, openLogs
All inputs are zod-validated in main. The renderer never touches Node directly (contextIsolation on, nodeIntegration off, restricted CSP).

## 9. Frontend practices
- Reuse existing components, tables, selects, modals, badges and styling. Do not add UI libraries or a second styling/routing system.
- Sidebar: Home, Clients, Units, Invoices, Payments, Settings.
- List pages: search, status filter, primary "Add" button, table with row actions, empty and no-results states, refresh after every mutation.
- Forms: modal or page with inline validation messages; money shown as rupees with thousands separators and 2 decimals, entered in rupees.
- Destructive or irreversible actions (issue, reopen, void, delete draft) ask for confirmation; void asks for a reason. Warn on leaving a dirty draft.
- Renderer totals are previews only; the saved numbers come from main.

## 10. Quality
Unit tests (vitest) for everything in `src/core` and pure helpers (path validation, unique filenames). Cover: line totals/rounding, due and status, void restoring due, client balance = issued totals − active payments.
