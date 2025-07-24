/**
 * Input Validation Utilities
 * 
 * Provides comprehensive validation functions for user inputs,
 * ensuring data integrity and security across the bot.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

export interface ValidationResult {
    isValid: boolean;
    sanitizedValue?: string;
    error?: string;
    details?: string;
}

/**
 * Shared UUID validation pattern (used by multiple functions)
 * Ensures consistency across the application
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks whether a string is a valid UUID.
 *
 * @param value - The string to validate as a UUID
 * @returns True if the input matches the UUID format; otherwise, false
 */
export function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}

/**
 * Validates a customer name input for presence, length, and reserved words.
 *
 * Ensures the input is a non-empty string between 2 and 100 characters and is not a reserved word. Returns a validation result with a sanitized (trimmed) name or an error message.
 *
 * @param input - The customer name to validate
 * @returns A ValidationResult indicating validity, sanitized value, or error details
 */
export function validateCustomerName(input: string): ValidationResult {
    // Step 1: Basic null/undefined checks
    if (!input || typeof input !== 'string') {
        return {
            isValid: false,
            error: 'Customer name is required',
            details: 'Please provide a valid customer name'
        };
    }

    // Step 2: Trim whitespace (this is our "sanitization")
    const trimmedInput = input.trim();

    // Step 3: Check if empty after trimming
    if (trimmedInput.length === 0) {
        return {
            isValid: false,
            error: 'Customer name cannot be empty',
            details: 'Please provide a valid customer name'
        };
    }

    // Step 4: Length validation
    if (trimmedInput.length < 2) {
        return {
            isValid: false,
            error: 'Customer name too short',
            details: 'Customer name must be at least 2 characters long'
        };
    }

    if (trimmedInput.length > 100) {
        return {
            isValid: false,
            error: 'Customer name too long',
            details: 'Customer name must be 100 characters or less'
        };
    }

    // Step 5: Reserved words check
    const reservedWords = ['admin', 'administrator', 'root', 'system', 'bot', 'null', 'undefined'];
    const lowerCaseName = trimmedInput.toLowerCase();
    
    if (reservedWords.includes(lowerCaseName)) {
        return {
            isValid: false,
            error: 'Reserved name',
            details: `'${trimmedInput}' is a reserved name. Please choose a different name.`
        };
    }

    // Step 6: Success case
    return {
        isValid: true,
        sanitizedValue: trimmedInput
    };
}

/**
 * Validates an email address for presence, format, and length.
 *
 * Trims whitespace, converts to lowercase, checks for non-empty input, validates against a basic email pattern, and ensures the address does not exceed 254 characters.
 *
 * @param email - The email address to validate
 * @returns A ValidationResult indicating validity, with a sanitized email or error details
 */
export function validateEmail(email: string): ValidationResult {
    if (!email || typeof email !== 'string') {
        return {
            isValid: false,
            error: 'Email is required',
            details: 'Please provide a valid email address'
        };
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedEmail.length === 0) {
        return {
            isValid: false,
            error: 'Email cannot be empty',
            details: 'Please provide a valid email address'
        };
    }

    // Basic email regex pattern
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(trimmedEmail)) {
        return {
            isValid: false,
            error: 'Invalid email format',
            details: 'Please provide a valid email address (e.g., user@example.com)'
        };
    }

    // Length check
    if (trimmedEmail.length > 254) {
        return {
            isValid: false,
            error: 'Email too long',
            details: 'Email address must be 254 characters or less'
        };
    }

    return {
        isValid: true,
        sanitizedValue: trimmedEmail
    };
}

/**
 * Validates a customer ID to ensure it is a non-empty string in UUID format.
 *
 * Returns a ValidationResult indicating validity, with a sanitized lowercase UUID if valid, or an error message if invalid.
 */
export function validateCustomerId(customerId: string): ValidationResult {
    if (!customerId || typeof customerId !== 'string') {
        return {
            isValid: false,
            error: 'Customer ID is required',
            details: 'Please provide a valid customer ID'
        };
    }

    const trimmedId = customerId.trim();

    if (trimmedId.length === 0) {
        return {
            isValid: false,
            error: 'Customer ID cannot be empty',
            details: 'Please provide a valid customer ID'
        };
    }

    // UUID format validation (must match ConversationProcessors.ts pattern)
    if (!isValidUUID(trimmedId)) {
        return {
            isValid: false,
            error: 'Invalid customer ID format',
            details: 'Customer ID must be in UUID format (e.g., ee19d165-a170-4261-8a4b-569c6a1bbcb7)'
        };
    }

    return {
        isValid: true,
        sanitizedValue: trimmedId.toLowerCase() // Normalize to lowercase
    };
}

/**
 * Validates a support ticket summary for presence and appropriate length.
 *
 * Ensures the summary is a non-empty string between 5 and 500 characters after trimming whitespace.
 *
 * @param summary - The support ticket summary to validate
 * @returns A ValidationResult indicating validity, with a sanitized summary or error details
 */
export function validateSupportSummary(summary: string): ValidationResult {
    if (!summary || typeof summary !== 'string') {
        return {
            isValid: false,
            error: 'Summary is required',
            details: 'Please provide a brief summary of your issue'
        };
    }

    const trimmedSummary = summary.trim();

    if (trimmedSummary.length === 0) {
        return {
            isValid: false,
            error: 'Summary cannot be empty',
            details: 'Please provide a brief summary of your issue'
        };
    }

    if (trimmedSummary.length < 5) {
        return {
            isValid: false,
            error: 'Summary too short',
            details: 'Please provide at least 5 characters for the summary'
        };
    }

    if (trimmedSummary.length > 500) {
        return {
            isValid: false,
            error: 'Summary too long',
            details: 'Summary must be 500 characters or less'
        };
    }

    return {
        isValid: true,
        sanitizedValue: trimmedSummary
    };
}
