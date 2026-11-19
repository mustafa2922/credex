import { z } from 'zod'
import { INVOICE_IMAGE_NAME } from '../../../shared/invoices'
import { isPaymentDate } from '../../../shared/payments'

export const paymentIdSchema = z.string().uuid('Invalid payment id')

const amountSchema = z
  .number()
  .refine((value) => Number.isSafeInteger(value) && value > 0, 'Amount must be greater than zero')

const attachmentSchema = z.string().regex(INVOICE_IMAGE_NAME, 'Invalid attachment')

const optionalInvoiceIdSchema = z
  .union([z.string().uuid('Invalid invoice id'), z.null(), z.undefined(), z.literal('')])
  .transform((value) => {
    if (value == null || value === '') return null
    return value
  })

const noteSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null
    const trimmed = value.trim()
    return trimmed.length === 0 ? null : trimmed
  })
  .refine((value) => value == null || value.length <= 200, {
    message: 'Note must be at most 200 characters'
  })

export const createPaymentSchema = z.object({
  client_id: z.string().uuid('Invalid client id'),
  invoice_id: optionalInvoiceIdSchema.optional().default(null),
  amount: amountSchema,
  method: z.enum(['cash', 'cheque', 'online']),
  payment_date: z.string().trim().refine(isPaymentDate, 'Date must be a valid YYYY-MM-DD date'),
  note: noteSchema.optional().default(null),
  attachment_path: z.union([attachmentSchema, z.null()]).optional().default(null)
})

export const previewPaymentSchema = z.object({
  client_id: z.string().uuid('Invalid client id'),
  invoice_id: optionalInvoiceIdSchema.optional().default(null),
  amount: amountSchema
})

export const listPaymentsSchema = z.object({
  invoice_id: z.string().uuid('Invalid invoice id').optional(),
  client_id: z.string().uuid('Invalid client id').optional(),
  status: z.enum(['active', 'void', 'all']).optional().default('all'),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
})

export const voidPaymentSchema = z.object({
  id: paymentIdSchema,
  reason: z
    .string()
    .trim()
    .min(1, 'A reason is required')
    .max(200, 'Reason must be at most 200 characters')
})

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(' ')
}
