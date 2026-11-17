import { z } from 'zod'

const phoneChars = /^[\d\s+\-()]*$/

export const clientNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be at most 100 characters')

export const clientPhoneSchema = z
  .string()
  .trim()
  .max(20, 'Phone must be at most 20 characters')
  .regex(phoneChars, 'Phone may only contain digits, spaces, and + - ( )')
  .transform((value) => (value === '' ? null : value))

export const listClientsSchema = z.object({
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  status: z.enum(['active', 'inactive', 'all']).optional().default('active')
})

export const clientIdSchema = z.string().uuid('Invalid client id')

export const createClientSchema = z.object({
  name: clientNameSchema,
  phone: z.preprocess(
    (value) => (value === undefined || value === null ? '' : value),
    clientPhoneSchema
  )
})

export const updateClientSchema = z.object({
  id: clientIdSchema,
  name: clientNameSchema,
  phone: z.preprocess(
    (value) => (value === undefined || value === null ? '' : value),
    clientPhoneSchema
  )
})

export const setClientStatusSchema = z.object({
  id: clientIdSchema,
  status: z.enum(['active', 'inactive'])
})

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(' ')
}