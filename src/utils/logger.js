/**
 * Logger Utility Module
 * 
 * This module provides logging functionality for the application.
 * It formats log messages with timestamps and severity levels.
 * 
 * Potential Improvements:
 * - Add log rotation
 * - Add structured logging
 * - Integrate with external logging services
 */
import dotenv from 'dotenv';

// Load environment variables at the beginning of the logger module
dotenv.config();

// Define log levels and their priorities
const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

// Get the configured log level from environment variable (default to 'info')
const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const configuredLevelValue = LOG_LEVELS[configuredLevel] !== undefined ? LOG_LEVELS[configuredLevel] : LOG_LEVELS.info;

/**
 * Checks if a log level should be displayed based on configured level
 * 
 * @param {string} level - The log level to check
 * @returns {boolean} True if the log should be displayed
 */
function shouldLog(level) {
    return LOG_LEVELS[level] <= configuredLevelValue;
}

/**
 * Get a formatted timestamp for log messages
 * 
 * @returns {string} Formatted timestamp string (e.g., "Apr 10, 2025, 10:30:45 AM")
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
 */
export function info(message) {
    if (shouldLog('info')) {
        console.log(`[INFO] ${getFormattedTimestamp()}: ${message}`);
    }
}

/**
 * Log error messages
 * 
 * @param {string} message - The error message to log
 */
export function error(message) {
    if (shouldLog('error')) {
        console.error(`[ERROR] ${getFormattedTimestamp()}: ${message}`);
    }
}

/**
 * Log warning messages
 * 
 * @param {string} message - The warning message to log
 */
export function warn(message) {
    if (shouldLog('warn')) {
        console.warn(`[WARN] ${getFormattedTimestamp()}: ${message}`);
    }
}

/**
 * Log debug messages
 * 
 * @param {string} message - The debug message to log
 */
export function debug(message) {
    if (shouldLog('debug')) {
        console.debug(`[DEBUG] ${getFormattedTimestamp()}: ${message}`);
    }
}

// Log the currently active log level on module load
console.log(`Logger initialized with log level: ${configuredLevel.toUpperCase()}`);