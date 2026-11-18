import { z } from 'zod'
import { INVOICE_IMAGE_NAME } from '../../../shared/invoices'
import { isPaymentDate } from '../../../shared/payments'

export const paymentIdSchema = z.string().uuid('Invalid payment id')

const amountSchema = z
  .number()
  .refine((value) => Number.isSafeInteger(value) && value > 0, 'Amount must be greater than zero')

const attachmentSchema = z.string().regex(INVOICE_IMAGE_NAME, 'Invalid attachment')

export const createPaymentSchema = z.object({
  invoice_id: z.string().uuid('Invalid invoice id'),
  amount: amountSchema,
  method: z.enum(['cash', 'cheque', 'online']),
  payment_date: z.string().trim().refine(isPaymentDate, 'Date must be a valid YYYY-MM-DD date'),
  note: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value == null) return null
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    })
    .refine((value) => value == null || value.length <= 200, {
      message: 'Note must be at most 200 characters'
    }),
  attachment_path: z.union([attachmentSchema, z.null()]).optional().default(null)
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
