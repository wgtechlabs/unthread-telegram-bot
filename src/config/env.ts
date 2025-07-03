/**
 * Unthread Telegram Bot - Environment Configuration and Validation
 * 
 * Validates and manages environment variables required for the Unthread Telegram Bot
 * to function properly. This module ensures all necessary API keys, database connections,
 * and service endpoints are configured before the bot starts.
 * Required Environment Variables:
 * - TELEGRAM_BOT_TOKEN: Telegram Bot API authentication token
 * - UNTHREAD_API_KEY: Unthread platform API key for ticket creation
 * - UNTHREAD_SLACK_CHANNEL_ID: Target Slack channel for ticket routing
 * - UNTHREAD_WEBHOOK_SECRET: Secret for webhook signature verification (required for full integration)
 * - PLATFORM_REDIS_URL: Redis connection for bot state management
 * - WEBHOOK_REDIS_URL: Redis connection for webhook event processing
 * - POSTGRES_URL: PostgreSQL database connection for persistent storage
 * 
 * Optional Environment Variables:
 * - DATABASE_SSL_VALIDATE: SSL validation mode for database connections (true/false)
 * - NODE_ENV: Runtime environment (development/production)
 * - WEBHOOK_POLL_INTERVAL: Webhook polling interval in milliseconds
 * - COMPANY_NAME: Company name for ticket attribution
 * 
 * Security:
 * - Validates all critical environment variables at startup
 * - Provides clear error messages for missing configuration * - Prevents bot startup with incomplete configuration
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
    'TELEGRAM_BOT_TOKEN',
    'UNTHREAD_API_KEY',
    'UNTHREAD_SLACK_CHANNEL_ID',
    'UNTHREAD_WEBHOOK_SECRET',
    'PLATFORM_REDIS_URL',
    'POSTGRES_URL'
] as const;

/**
 * Ensures all required environment variables are set before application startup.
 *
 * Logs detailed error messages and terminates the process if any required variables are missing; otherwise, logs successful validation and the current runtime environment.
 */
export function validateEnvironment(): void {
    const missingVars: string[] = [];
    
    for (const varName of REQUIRED_ENV_VARS) {
        if (!process.env[varName]) {
            missingVars.push(varName);
        }
    }
    
    if (missingVars.length > 0) {
        LogEngine.error('❌ Missing required environment variables:', {
            missingVariables: missingVars,
            totalMissing: missingVars.length
        });
        missingVars.forEach(varName => {
            LogEngine.error(`   - ${varName}`);
        });
        LogEngine.error('\n📝 Please copy .env.example to .env and fill in the required values.');
        LogEngine.error('   This works for both local development and Docker deployment.\n');
        process.exit(1);
    }
    
    LogEngine.info('✅ Environment configuration validated successfully');
    LogEngine.info(`🚀 Running in ${process.env.NODE_ENV || 'development'} mode`);
}

/**
 * Get environment variable with fallback
 */
export function getEnvVar(key: string, defaultValue: string = ''): string {
    return process.env[key] || defaultValue;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
}

/**
 * Determines whether the application is running in development mode.
 *
 * @returns `true` if the `NODE_ENV` environment variable is set to 'development'; otherwise, `false`.
 */
export function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
}

/**
 * Retrieves the default ticket priority from the `UNTHREAD_DEFAULT_PRIORITY` environment variable.
 *
 * Parses and validates the value against allowed priorities (3, 5, 7, 9). Returns the valid priority or `undefined` if the variable is unset or invalid.
 *
 * @returns The ticket priority (3, 5, 7, or 9), or `undefined` if not set or invalid.
 */
export function getDefaultTicketPriority(): 3 | 5 | 7 | 9 | undefined {
    const priority = process.env.UNTHREAD_DEFAULT_PRIORITY;
    
    if (!priority) {
        return undefined;
    }
    
    const numPriority = parseInt(priority, 10);
    
    // Validate against allowed priority values from Unthread API
    if (numPriority === 3 || numPriority === 5 || numPriority === 7 || numPriority === 9) {
        return numPriority;
    }
    
    LogEngine.warn(`⚠️  Invalid UNTHREAD_DEFAULT_PRIORITY value: ${priority}. Must be 3, 5, 7, or 9. Ignoring priority setting.`);
    return undefined;
}
