/**
 * UUID Validation Utilities
 *
 * Provides secure UUID validation to prevent processing of malformed IDs
 * that could cause security vulnerabilities or system instability.
 *
 * @author Waren Gonzaga, WG Technology Labs
 */

/**
 * Checks whether the input string is a valid UUID version 4.
 *
 * Returns `true` if the string matches the strict UUID v4 format; otherwise, returns `false`.
 */
export function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') {
    return false
  }

  // UUID v4 format: 8-4-4-4-12 hex characters
  // Example: 550e8400-e29b-41d4-a716-446655440000
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  return uuidRegex.test(uuid)
}

/**
 * Validates that a string is a valid UUID v4 and returns it in lowercase.
 *
 * Throws an error with the provided context if the input is not a valid UUID v4.
 *
 * @param uuid - The string to validate as a UUID v4
 * @param context - A label used in the error message to indicate the context of validation
 * @returns The validated UUID string, normalized to lowercase
 * @throws Error if the input is not a valid UUID v4
 */
export function validateAndSanitizeUUID(
  uuid: string,
  context: string = 'UUID'
): string {
  if (!isValidUUID(uuid)) {
    throw new Error(`Invalid ${context} format: Expected valid UUID v4 format`)
  }

  // Return lowercase normalized UUID
  return uuid.toLowerCase()
}

/**
 * Determines whether a value is a string that matches the UUID v4 format.
 *
 * Acts as a type guard to narrow the type to `string` if the value is a valid UUID.
 *
 * @returns `true` if the value is a valid UUID v4 string; otherwise, `false`.
 */
export function isUUID(value: unknown): value is string {
  return typeof value === 'string' && isValidUUID(value)
}
