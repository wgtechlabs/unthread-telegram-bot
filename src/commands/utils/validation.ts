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
 * Validate UUID format (helper function)
 * Centralized UUID validation to ensure consistency across the codebase
 */
export function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}

/**
 * Validate customer name input
 * 
 * Performs basic validation (length, reserved words) but leaves
 * character validation to the Unthread API.
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
 * Validate email format
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
 * Validate customer ID (UUID format)
 * Updated to match ConversationProcessors.ts expectations
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
 * Validate support ticket summary
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
