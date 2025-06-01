/**
 * Logger Utility Module
 * 
 * This module provides logging functionality for the application using @wgtechlabs/log-engine.
 * It provides structured logging with enhanced formatting and beautiful color-coded output.
 */
import { LogEngine, LogMode } from '@wgtechlabs/log-engine';
import dotenv from 'dotenv';

// Load environment variables at the beginning of the logger module
dotenv.config();

// Configure LogEngine based on environment and LOG_LEVEL
const configureLogEngine = () => {
    const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    // Map LOG_LEVEL to LogMode
    const logModeMap = {
        'debug': LogMode.DEBUG,
        'info': LogMode.INFO,
        'warn': LogMode.WARN,
        'error': LogMode.ERROR,
        'silent': LogMode.SILENT,
        'off': LogMode.OFF
    };
    
    // Use LOG_LEVEL if provided, otherwise auto-configure based on NODE_ENV
    const mode = logModeMap[logLevel] || (
        nodeEnv === 'production' ? LogMode.INFO :
        nodeEnv === 'staging' ? LogMode.WARN :
        nodeEnv === 'test' ? LogMode.ERROR :
        LogMode.DEBUG // development default
    );
    
    LogEngine.configure({ mode });
    return mode;
};

// Initialize the logger
const currentMode = configureLogEngine();

/**
 * Get a formatted timestamp for log messages (kept for backward compatibility)
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
 * @param {object} [meta] - Optional metadata object (will be stringified and appended)
 */
export function info(message, meta = {}) {
    const fullMessage = Object.keys(meta).length > 0 ? `${message} ${JSON.stringify(meta)}` : message;
    LogEngine.info(fullMessage);
}

/**
 * Log error messages
 * 
 * @param {string} message - The error message to log
 * @param {object} [meta] - Optional metadata object (can include error stack)
 */
export function error(message, meta = {}) {
    const fullMessage = Object.keys(meta).length > 0 ? `${message} ${JSON.stringify(meta)}` : message;
    LogEngine.error(fullMessage);
}

/**
 * Log warning messages
 * 
 * @param {string} message - The warning message to log
 * @param {object} [meta] - Optional metadata object
 */
export function warn(message, meta = {}) {
    const fullMessage = Object.keys(meta).length > 0 ? `${message} ${JSON.stringify(meta)}` : message;
    LogEngine.warn(fullMessage);
}

/**
 * Log debug messages
 * 
 * @param {string} message - The debug message to log
 * @param {object} [meta] - Optional metadata object
 */
export function debug(message, meta = {}) {
    const fullMessage = Object.keys(meta).length > 0 ? `${message} ${JSON.stringify(meta)}` : message;
    LogEngine.debug(fullMessage);
}

/**
 * Log critical messages (always visible unless OFF mode)
 * 
 * @param {string} message - The critical message to log
 * @param {object} [meta] - Optional metadata object
 */
export function success(message, meta = {}) {
    const fullMessage = Object.keys(meta).length > 0 ? `${message} ${JSON.stringify(meta)}` : message;
    LogEngine.log(fullMessage); // Using .log() for critical messages that always show
}

// Export the LogEngine instance and LogMode for advanced usage
export { LogEngine, LogMode };

// Log the logger initialization
LogEngine.log(`Logger initialized with @wgtechlabs/log-engine (Mode: ${currentMode})`);