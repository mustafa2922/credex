import { z } from 'zod'

export const unitNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(30, 'Name must be at most 30 characters')

export const listUnitsSchema = z.object({
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  status: z.enum(['active', 'inactive', 'all']).optional().default('active')
})

export const unitIdSchema = z.string().uuid('Invalid unit id')

export const createUnitSchema = z.object({
  name: unitNameSchema
})

export const updateUnitSchema = z.object({
  id: unitIdSchema,
  name: unitNameSchema
})

export const setUnitStatusSchema = z.object({
  id: unitIdSchema,
  status: z.enum(['active', 'inactive'])
})

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(' ')
}
