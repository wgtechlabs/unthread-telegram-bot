/**
 * Logger Utility Module
 * 
 * This module provides logging functionality for the application.
 * It formats log messages with timestamps and severity levels.
 * 
 * Potential Improvements:
 * - Add log levels configuration (enable/disable specific levels)
 * - Implement log file output
 * - Add log rotation
 * - Add structured logging
 * - Integrate with external logging services
 */

/**
 * Get a formatted timestamp for log messages
 * 
 * @returns {string} Formatted timestamp string (e.g., "Apr 10, 2025, 10:30:45 AM")
 * 
 * Possible Bugs:
 * - Locale-specific formatting may cause inconsistencies in logs across different environments
 * 
 * Enhancement Opportunities:
 * - Add ISO 8601 format option for machine-readable logs
 * - Add configurable timestamp format
 * - Add timezone support
 */
export function getFormattedTimestamp() {
    const now = new Date();
    return now.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

/**
 * Log information messages
 * 
 * @param {string} message - The message to log
 * 
 * Possible Bugs:
 * - No handling for objects or complex data structures
 * 
 * Enhancement Opportunities:
 * - Add support for structured logging (objects, metadata)
 * - Add log filtering capabilities
 * - Add log context (module, function, line number)
 */
export function info(message) {
    console.log(`[INFO] ${getFormattedTimestamp()}: ${message}`);
}

/**
 * Log error messages
 * 
 * @param {string} message - The error message to log
 * 
 * Possible Bugs:
 * - No stack trace for Error objects
 * - No error categorization
 * 
 * Enhancement Opportunities:
 * - Add stack trace support for Error objects
 * - Add error codes and categorization
 * - Add error reporting to external services
 * - Add error metrics collection
 */
export function error(message) {
    console.error(`[ERROR] ${getFormattedTimestamp()}: ${message}`);
}

/**
 * Log warning messages
 * 
 * @param {string} message - The warning message to log
 * 
 * Possible Bugs:
 * - No warning categorization
 * 
 * Enhancement Opportunities:
 * - Add warning codes and categorization
 * - Add warning aggregation to avoid log spam
 * - Add contextual warning information
 */
export function warn(message) {
    console.warn(`[WARN] ${getFormattedTimestamp()}: ${message}`);
}

/**
 * Log debug messages
 * 
 * @param {string} message - The debug message to log
 * 
 * Possible Bugs:
 * - Debug logs always enabled (no environment-based filtering)
 * - Can lead to excessive logging in production
 * 
 * Enhancement Opportunities:
 * - Add debug level configuration (enabled only in development)
 * - Add debug categories for selective enabling
 * - Add performance impact tracking for debugging
 */
export function debug(message) {
    console.debug(`[DEBUG] ${getFormattedTimestamp()}: ${message}`);
}