export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function requiredString(v: unknown, max: number, field: string): string {
  if (typeof v !== 'string') throw new ValidationError(`${field} must be a string`)
  const trimmed = v.trim()
  if (!trimmed) throw new ValidationError(`${field} is required`)
  if (trimmed.length > max) throw new ValidationError(`${field} is too long (max ${max})`)
  return trimmed
}

export function optionalString(v: unknown, max: number, field: string): string | null {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new ValidationError(`${field} must be a string`)
  const trimmed = v.trim()
  if (!trimmed) return null
  if (trimmed.length > max) throw new ValidationError(`${field} is too long (max ${max})`)
  return trimmed
}

export function optionalStringArray(v: unknown, maxItems: number, maxItemLength: number, field: string): string[] {
  if (v == null) return []
  if (!Array.isArray(v)) throw new ValidationError(`${field} must be an array`)
  if (v.length > maxItems) throw new ValidationError(`${field} has too many items (max ${maxItems})`)
  return v.map((item, i) => {
    if (typeof item !== 'string') throw new ValidationError(`${field}[${i}] must be a string`)
    const trimmed = item.trim()
    if (trimmed.length > maxItemLength) throw new ValidationError(`${field}[${i}] is too long (max ${maxItemLength})`)
    return trimmed
  }).filter(Boolean)
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}
