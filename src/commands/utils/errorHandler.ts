/**
 * Enhanced Error Handling Utilities
 * 
 * Provides comprehensive error handling capabilities that preserve
 * error type hierarchy and provide detailed logging information.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { LogEngine } from '@wgtechlabs/log-engine';

export interface ErrorDetails {
    message: string;
    name: string;
    stack?: string;
    code?: string | number;
    statusCode?: number;
    cause?: unknown;
    isOperational?: boolean;
    timestamp: string;
    errorCategory?: ErrorCategory;
    severity?: ErrorSeverity;
}

/**
 * Explicit error categories for reliable classification
 */
export enum ErrorCategory {
    SYSTEM = 'SYSTEM',           // Internal system errors
    OPERATIONAL = 'OPERATIONAL', // Expected business logic errors
    VALIDATION = 'VALIDATION',   // Input validation errors
    NETWORK = 'NETWORK',         // Network/API related errors
    AUTHENTICATION = 'AUTH',     // Authentication/authorization errors
    BUSINESS = 'BUSINESS',       // Business rule violations
    UNKNOWN = 'UNKNOWN'          // Unclassified errors
}

/**
 * Error severity levels for appropriate logging
 */
export enum ErrorSeverity {
    CRITICAL = 'CRITICAL',   // System-breaking errors
    HIGH = 'HIGH',          // Important errors requiring attention
    MEDIUM = 'MEDIUM',      // Standard errors
    LOW = 'LOW',           // Minor issues or warnings
    INFO = 'INFO'          // Informational errors
}

/**
 * Well-known error codes for reliable classification
 */
export const ERROR_CODES = {
    // System errors
    SYSTEM_ERROR: 'SYS_001',
    DATABASE_ERROR: 'SYS_002',
    FILE_SYSTEM_ERROR: 'SYS_003',
    MEMORY_ERROR: 'SYS_004',
    
    // Operational errors
    VALIDATION_FAILED: 'OP_001',
    BUSINESS_RULE_VIOLATION: 'OP_002',
    RESOURCE_NOT_FOUND: 'OP_003',
    OPERATION_TIMEOUT: 'OP_004',
    
    // Network errors
    NETWORK_TIMEOUT: 'NET_001',
    CONNECTION_REFUSED: 'NET_002',
    API_ERROR: 'NET_003',
    RATE_LIMITED: 'NET_004',
    
    // Authentication errors
    UNAUTHORIZED: 'AUTH_001',
    FORBIDDEN: 'AUTH_002',
    TOKEN_EXPIRED: 'AUTH_003',
    INVALID_CREDENTIALS: 'AUTH_004'
} as const;

/**
 * Type guard to check if an error has error category property
 */
function hasErrorCategory(error: unknown): error is { errorCategory: ErrorCategory } {
    return typeof error === 'object' && error !== null && 'errorCategory' in error &&
           Object.values(ErrorCategory).includes((error as any).errorCategory);
}

/**
 * Type guard to check if an error has severity property
 */
function hasErrorSeverity(error: unknown): error is { severity: ErrorSeverity } {
    return typeof error === 'object' && error !== null && 'severity' in error &&
           Object.values(ErrorSeverity).includes((error as any).severity);
}

/**
 * Type guard to check if an error has a 'code' property
 */
function hasErrorCode(error: unknown): error is { code: string | number } {
    return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Type guard to check if an error has a 'statusCode' property
 */
function hasStatusCode(error: unknown): error is { statusCode: number } {
    return typeof error === 'object' && error !== null && 'statusCode' in error &&
           typeof (error as any).statusCode === 'number';
}

/**
 * Type guard to check if an error has a 'cause' property
 */
function hasCause(error: unknown): error is { cause: unknown } {
    return typeof error === 'object' && error !== null && 'cause' in error;
}

/**
 * Type guard to check if an error has an 'isOperational' property
 */
function hasIsOperational(error: unknown): error is { isOperational: boolean } {
    return typeof error === 'object' && error !== null && 'isOperational' in error &&
           typeof (error as any).isOperational === 'boolean';
}

/**
 * Type guard to check if an object has a 'message' property
 */
function hasMessage(obj: unknown): obj is { message: unknown } {
    return typeof obj === 'object' && obj !== null && 'message' in obj;
}

/**
 * Type guard to check if an object has a 'name' property
 */
function hasName(obj: unknown): obj is { name: unknown } {
    return typeof obj === 'object' && obj !== null && 'name' in obj;
}

/**
 * Sanitize error values to prevent sensitive information exposure
 */
function sanitizeErrorValue(error: unknown): string {
    // Don't expose the actual error value - use generic placeholders
    const errorType = typeof error;
    
    // For objects, we don't want to expose their contents
    if (error && typeof error === 'object') {
        if (Array.isArray(error)) {
            return `[Array with ${error.length} items]`;
        }
        return '[Object]';
    }
    
    // For primitive types, still be cautious about exposing values
    if (typeof error === 'string') {
        // Only show first few characters and length for strings
        const str = String(error);
        if (str.length <= 10) {
            return `"${str}"`;
        }
        return `"${str.substring(0, 8)}..." (${str.length} chars)`;
    }
    
    if (typeof error === 'number') {
        return '[Number]';
    }
    
    if (typeof error === 'boolean') {
        return '[Boolean]';
    }
    
    // For other types, just show the type
    return `[${errorType}]`;
}

/**
 * Classify error into appropriate category and severity
 */
function classifyError(error: unknown, errorDetails: ErrorDetails): {
    category: ErrorCategory;
    severity: ErrorSeverity;
} {
    // First check if error already has explicit category
    if (hasErrorCategory(error)) {
        const severity = hasErrorSeverity(error) ? error.severity : ErrorSeverity.MEDIUM;
        return { category: error.errorCategory, severity };
    }
    
    // Classify based on explicit error codes
    if (errorDetails.code) {
        const code = String(errorDetails.code);
        
        // System error codes
        if (code.startsWith('SYS_') || 
            Object.values(ERROR_CODES).slice(0, 4).includes(code as any)) {
            return { category: ErrorCategory.SYSTEM, severity: ErrorSeverity.CRITICAL };
        }
        
        // Operational error codes
        if (code.startsWith('OP_') || 
            Object.values(ERROR_CODES).slice(4, 8).includes(code as any)) {
            return { category: ErrorCategory.OPERATIONAL, severity: ErrorSeverity.MEDIUM };
        }
        
        // Network error codes
        if (code.startsWith('NET_') || 
            Object.values(ERROR_CODES).slice(8, 12).includes(code as any)) {
            return { category: ErrorCategory.NETWORK, severity: ErrorSeverity.HIGH };
        }
        
        // Authentication error codes
        if (code.startsWith('AUTH_') || 
            Object.values(ERROR_CODES).slice(12, 16).includes(code as any)) {
            return { category: ErrorCategory.AUTHENTICATION, severity: ErrorSeverity.HIGH };
        }
    }
    
    // Classify based on HTTP status codes
    if (errorDetails.statusCode) {
        if (errorDetails.statusCode >= 500) {
            return { category: ErrorCategory.SYSTEM, severity: ErrorSeverity.CRITICAL };
        }
        if (errorDetails.statusCode === 401 || errorDetails.statusCode === 403) {
            return { category: ErrorCategory.AUTHENTICATION, severity: ErrorSeverity.HIGH };
        }
        if (errorDetails.statusCode === 404) {
            return { category: ErrorCategory.OPERATIONAL, severity: ErrorSeverity.LOW };
        }
        if (errorDetails.statusCode === 429) {
            return { category: ErrorCategory.NETWORK, severity: ErrorSeverity.MEDIUM };
        }
        if (errorDetails.statusCode >= 400) {
            return { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.MEDIUM };
        }
    }
    
    // Classify based on isOperational flag
    if (errorDetails.isOperational === false) {
        return { category: ErrorCategory.SYSTEM, severity: ErrorSeverity.CRITICAL };
    }
    if (errorDetails.isOperational === true) {
        return { category: ErrorCategory.OPERATIONAL, severity: ErrorSeverity.MEDIUM };
    }
    
    // Classify based on error name patterns (as last resort)
    const errorName = errorDetails.name.toLowerCase();
    if (errorName.includes('validation') || errorName.includes('invalid')) {
        return { category: ErrorCategory.VALIDATION, severity: ErrorSeverity.MEDIUM };
    }
    if (errorName.includes('network') || errorName.includes('timeout') || errorName.includes('connection')) {
        return { category: ErrorCategory.NETWORK, severity: ErrorSeverity.HIGH };
    }
    if (errorName.includes('auth') || errorName.includes('unauthorized') || errorName.includes('forbidden')) {
        return { category: ErrorCategory.AUTHENTICATION, severity: ErrorSeverity.HIGH };
    }
    
    // Default classification
    return { category: ErrorCategory.UNKNOWN, severity: ErrorSeverity.MEDIUM };
}

/**
 * Extract detailed error information while preserving original error types
 */
export function getErrorDetails(error: unknown, context?: string): ErrorDetails {
    const timestamp = new Date().toISOString();
    
    // Handle Error instances (most common case)
    if (error instanceof Error) {
        const details: ErrorDetails = {
            message: error.message,
            name: error.name,
            timestamp
        };
        
        if (error.stack) {
            details.stack = error.stack;
        }
        
        // Handle specific error types with additional properties using type guards
        if (hasErrorCode(error)) {
            details.code = error.code;
        }
        
        if (hasStatusCode(error)) {
            details.statusCode = error.statusCode;
        }
        
        if (hasCause(error)) {
            details.cause = error.cause;
        }
        
        // Check for operational errors (user-facing vs system errors)
        if (hasIsOperational(error)) {
            details.isOperational = error.isOperational;
        }
        
        // Classify the error using our robust classification system
        const classification = classifyError(error, details);
        details.errorCategory = classification.category;
        details.severity = classification.severity;
        
        return details;
    }
    
    // Handle string errors
    if (typeof error === 'string') {
        const details: ErrorDetails = {
            message: error,
            name: 'StringError',
            timestamp
        };
        
        const classification = classifyError(error, details);
        details.errorCategory = classification.category;
        details.severity = classification.severity;
        
        return details;
    }
    
    // Handle object errors with message property
    if (error && typeof error === 'object' && hasMessage(error)) {
        const details: ErrorDetails = {
            message: String(error.message),
            name: hasName(error) ? String(error.name) : 'UnknownObjectError',
            timestamp
        };
        
        const classification = classifyError(error, details);
        details.errorCategory = classification.category;
        details.severity = classification.severity;
        
        return details;
    }
    
    // Handle null, undefined, or other primitive types
    if (error === null) {
        return {
            message: 'Null error occurred',
            name: 'NullError',
            timestamp,
            errorCategory: ErrorCategory.SYSTEM,
            severity: ErrorSeverity.MEDIUM
        };
    }
    
    if (error === undefined) {
        return {
            message: 'Undefined error occurred',
            name: 'UndefinedError',
            timestamp,
            errorCategory: ErrorCategory.SYSTEM,
            severity: ErrorSeverity.MEDIUM
        };
    }
    
    // Fallback for any other type - use sanitized output
    return {
        message: `Unknown error type: ${typeof error}. Sanitized value: ${sanitizeErrorValue(error)}`,
        name: 'UnknownError',
        timestamp,
        errorCategory: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW
    };
}

/**
 * Sanitize log data to prevent sensitive information leakage
 */
function sanitizeLogData(logData: any): any {
    const sanitized = { ...logData };
    
    // Sanitize stack traces in production to remove file paths
    if (sanitized.stack && process.env.NODE_ENV === 'production') {
        // Remove absolute file paths, keep only relative paths and line numbers
        sanitized.stack = sanitized.stack
            .replace(/at\s+.*[\\\/]([^\\\/]+:\d+:\d+)/g, 'at $1')
            .replace(/\([^)]*[\\\/]([^\\\/\)]+:\d+:\d+)\)/g, '($1)');
    }
    
    // Remove or mask potentially sensitive additional data
    if (sanitized.password) sanitized.password = '[REDACTED]';
    if (sanitized.token) sanitized.token = '[REDACTED]';
    if (sanitized.apiKey) sanitized.apiKey = '[REDACTED]';
    if (sanitized.secret) sanitized.secret = '[REDACTED]';
    if (sanitized.authorization) sanitized.authorization = '[REDACTED]';
    
    // Sanitize any nested objects
    for (const key in sanitized) {
        if (sanitized[key] && typeof sanitized[key] === 'object') {
            // Recursively sanitize nested objects
            if (typeof sanitized[key] === 'object' && !Array.isArray(sanitized[key])) {
                sanitized[key] = sanitizeLogData(sanitized[key]);
            }
        }
    }
    
    return sanitized;
}

/**
 * Log error with enhanced details and optional context
 */
export function logError(error: unknown, context: string, additionalData?: Record<string, any>): ErrorDetails {
    const errorDetails = getErrorDetails(error, context);
    
    const logData = sanitizeLogData({
        ...errorDetails,
        context,
        ...additionalData
    });
    
    // Use robust error classification instead of fragile string matching
    const category = errorDetails.errorCategory || ErrorCategory.UNKNOWN;
    const severity = errorDetails.severity || ErrorSeverity.MEDIUM;
    
    // Log at appropriate level based on error category and severity
    if (category === ErrorCategory.SYSTEM || severity === ErrorSeverity.CRITICAL) {
        LogEngine.error(`System error in ${context}`, logData);
    } else if (severity === ErrorSeverity.HIGH || category === ErrorCategory.NETWORK || category === ErrorCategory.AUTHENTICATION) {
        LogEngine.error(`High severity error in ${context}`, logData);
    } else if (category === ErrorCategory.VALIDATION || errorDetails.statusCode && errorDetails.statusCode >= 400 && errorDetails.statusCode < 500) {
        LogEngine.warn(`Client error in ${context}`, logData);
    } else if (severity === ErrorSeverity.LOW || category === ErrorCategory.OPERATIONAL) {
        LogEngine.warn(`Operational issue in ${context}`, logData);
    } else {
        LogEngine.error(`Error in ${context}`, logData);
    }
    
    return errorDetails;
}

/**
 * Create a user-friendly error message based on error type
 */
export function createUserErrorMessage(error: unknown): string {
    const details = getErrorDetails(error);
    
    // Handle known error types with user-friendly messages
    if (details.statusCode === 429) {
        return "⏳ Please wait a moment before trying again.";
    }
    
    if (details.statusCode === 404) {
        return "❌ The requested resource was not found.";
    }
    
    if (details.statusCode && details.statusCode >= 500) {
        return "🔧 We're experiencing technical difficulties. Please try again later.";
    }
    
    if (details.name === 'ValidationError') {
        return `❌ Invalid input: ${details.message}`;
    }
    
    if (details.isOperational) {
        return `❌ ${details.message}`;
    }
    
    // Generic fallback
    return "❌ An unexpected error occurred. Please try again.";
}
