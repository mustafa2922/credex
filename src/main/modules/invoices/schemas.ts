import { z } from 'zod'
import { INVOICE_IMAGE_NAME, isInvoiceDate } from '../../../shared/invoices'

export const invoiceIdSchema = z.string().uuid('Invalid invoice id')

const imageNameSchema = z.string().regex(INVOICE_IMAGE_NAME, 'Invalid image')

// z.number().int() crashes the Electron 44 main process on Windows.
const quantitySchema = z
  .number()
  .refine((value) => Number.isSafeInteger(value) && value > 0, 'Quantity must be greater than zero')

const rateSchema = z
  .number()
  .refine((value) => Number.isSafeInteger(value) && value >= 0, 'Rate must be zero or greater')

export const saveInvoiceLineSchema = z.object({
  id: z.string().uuid('Invalid line id').optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  image_path: z.union([imageNameSchema, z.null()]).optional().default(null),
  unit_id: z.string().uuid('Invalid unit id'),
  quantity: quantitySchema,
  rate: rateSchema
})

export const saveInvoiceSchema = z.object({
  id: invoiceIdSchema.optional(),
  client_id: z.string().uuid('Invalid client id'),
  invoice_date: z.string().trim().refine(isInvoiceDate, 'Date must be a valid YYYY-MM-DD date'),
  lines: z.array(saveInvoiceLineSchema).optional().default([]),
  removed_images: z.array(imageNameSchema).optional().default([])
})

export const listInvoicesSchema = z.object({
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  status: z.enum(['draft', 'issued', 'void', 'all']).optional().default('all'),
  client_id: z.string().uuid('Invalid client id').optional()
})

export const voidInvoiceSchema = z.object({
  id: invoiceIdSchema,
  reason: z
    .string()
    .trim()
    .min(1, 'A reason is required')
    .max(200, 'Reason must be at most 200 characters')
})

export const exportInvoiceSchema = z.object({
  id: invoiceIdSchema,
  hideRates: z.boolean().optional().default(false)
})

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(' ')
}
