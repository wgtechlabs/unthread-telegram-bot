/**
 * UUID Validation Utilities
 * 
 * Provides secure UUID validation to prevent processing of malformed IDs
 * that could cause security vulnerabilities or system instability.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

/**
 * Validates if a string is a properly formatted UUID (v4)
 * 
 * This function performs strict validation to ensure only properly
 * formatted UUIDs are processed, preventing potential security issues
 * from malformed input.
 */
export function isValidUUID(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') {
        return false;
    }

    // UUID v4 format: 8-4-4-4-12 hex characters
    // Example: 550e8400-e29b-41d4-a716-446655440000
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    return uuidRegex.test(uuid);
}

/**
 * Validates and sanitizes a UUID string
 * 
 * Returns the UUID if valid, or throws an error if invalid.
 * This provides a secure way to validate UUIDs before processing.
 */
export function validateAndSanitizeUUID(uuid: string, context: string = 'UUID'): string {
    if (!isValidUUID(uuid)) {
        throw new Error(`Invalid ${context} format: Expected valid UUID v4 format`);
    }
    
    // Return lowercase normalized UUID
    return uuid.toLowerCase();
}

/**
 * Type guard for UUID validation
 */
export function isUUID(value: unknown): value is string {
    return typeof value === 'string' && isValidUUID(value);
}
