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
        
        // Handle specific error types with additional properties
        if ('code' in error) {
            details.code = (error as any).code;
        }
        
        if ('statusCode' in error) {
            details.statusCode = (error as any).statusCode;
        }
        
        if ('cause' in error) {
            details.cause = (error as any).cause;
        }
        
        // Check for operational errors (user-facing vs system errors)
        if ('isOperational' in error) {
            details.isOperational = (error as any).isOperational;
        }
        
        return details;
    }
    
    // Handle string errors
    if (typeof error === 'string') {
        return {
            message: error,
            name: 'StringError',
            timestamp
        };
    }
    
    // Handle object errors with message property
    if (error && typeof error === 'object' && 'message' in error) {
        return {
            message: String((error as any).message),
            name: (error as any).name || 'UnknownObjectError',
            timestamp
        };
    }
    
    // Handle null, undefined, or other primitive types
    if (error === null) {
        return {
            message: 'Null error occurred',
            name: 'NullError',
            timestamp
        };
    }
    
    if (error === undefined) {
        return {
            message: 'Undefined error occurred',
            name: 'UndefinedError',
            timestamp
        };
    }
    
    // Fallback for any other type
    return {
        message: `Unknown error type: ${typeof error}. Value: ${String(error)}`,
        name: 'UnknownError',
        timestamp
    };
}

/**
 * Log error with enhanced details and optional context
 */
export function logError(error: unknown, context: string, additionalData?: Record<string, any>): ErrorDetails {
    const errorDetails = getErrorDetails(error, context);
    
    const logData = {
        ...errorDetails,
        context,
        ...additionalData
    };
    
    // Use appropriate log level based on error type
    if (errorDetails.isOperational === false || errorDetails.name.includes('System')) {
        LogEngine.error(`System error in ${context}`, logData);
    } else if (errorDetails.statusCode && errorDetails.statusCode >= 500) {
        LogEngine.error(`Server error in ${context}`, logData);
    } else if (errorDetails.statusCode && errorDetails.statusCode >= 400) {
        LogEngine.warn(`Client error in ${context}`, logData);
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
