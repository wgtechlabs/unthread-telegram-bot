/**
 * Unthread Telegram Bot - Environment Configuration and Validation
 * 
 * Validates and manages environment variables required for the Unthread Telegram Bot
 * to function properly. This module ensures all necessary API keys, database connections,
 * and service endpoints are configured before the bot starts.
 * 
 * Required Environment Variables:
 * - TELEGRAM_BOT_TOKEN: Telegram Bot API authentication token (from @BotFather)
 * - UNTHREAD_API_KEY: Unthread platform API key for ticket creation (from Unthread dashboard)
 * - UNTHREAD_SLACK_CHANNEL_ID: Target Slack channel for ticket routing (from Unthread dashboard)
 * - UNTHREAD_WEBHOOK_SECRET: Secret for webhook signature verification (from Unthread dashboard)
 * - ADMIN_USERS: Comma-separated list of Telegram user IDs authorized to manage the bot (from @userinfobot)
 * - PLATFORM_REDIS_URL: Redis connection for bot state management
 * - WEBHOOK_REDIS_URL: Redis connection for webhook event processing (required for agent responses)
 * - POSTGRES_URL: PostgreSQL database connection for persistent storage
 * 
 * Optional Environment Variables:
 * - DATABASE_SSL_VALIDATE: SSL validation mode for database connections (true/false)
 * - NODE_ENV: Runtime environment (development/production)
 * - WEBHOOK_POLL_INTERVAL: Webhook polling interval in milliseconds
 * - COMPANY_NAME: Company name for ticket attribution
 * - UNTHREAD_DEFAULT_PRIORITY: Default priority for new tickets (3, 5, 7, or 9)
 * 
 * Security:
 * - Validates all critical environment variables at startup
 * - Provides clear error messages for missing configuration 
 * - Prevents bot startup with incomplete configuration
 * - Detects placeholder values and prevents accidental deployment
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
    'ADMIN_USERS',
    'PLATFORM_REDIS_URL',
    'WEBHOOK_REDIS_URL',
    'POSTGRES_URL'
] as const;

/**
 * Environment variable help information
 */
const ENV_VAR_HELP: Record<string, string> = {
    'TELEGRAM_BOT_TOKEN': 'Message @BotFather on Telegram, create a new bot with /newbot',
    'UNTHREAD_API_KEY': 'Login to Unthread dashboard → Settings → API Keys → Generate new key',
    'UNTHREAD_SLACK_CHANNEL_ID': 'Unthread dashboard → Settings → Integrations → Slack → Channel ID',
    'UNTHREAD_WEBHOOK_SECRET': 'Unthread dashboard → Settings → Webhooks → Create webhook → Copy secret',
    'ADMIN_USERS': 'Message @userinfobot on Telegram to get your user ID (comma-separated list)',
    'PLATFORM_REDIS_URL': 'Redis connection string for bot state management',
    'WEBHOOK_REDIS_URL': 'Redis connection string for webhook event processing (agent responses)',
    'POSTGRES_URL': 'PostgreSQL connection string for persistent storage'
};

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
        
        LogEngine.error('\n📋 Required environment variables:');
        missingVars.forEach(varName => {
            const help = ENV_VAR_HELP[varName] || 'See documentation for setup instructions';
            LogEngine.error(`   ❌ ${varName}`);
            LogEngine.error(`      How to get: ${help}`);
        });
        
        LogEngine.error('\n📝 Setup Instructions:');
        LogEngine.error('   1. Copy .env.example to .env: cp .env.example .env');
        LogEngine.error('   2. Edit .env and replace placeholder values with actual credentials');
        LogEngine.error('   3. Restart the bot');
        LogEngine.error('\n💡 This works for both local development and Docker deployment.\n');
        process.exit(1);
    }

    // Additional validation for specific environment variables to catch placeholder values
    try {
        getAdminUsers(); // This will throw if placeholder values are detected
        validateRedisUrls(); // Validate Redis URL configurations
        validateRequiredTokens(); // Validate API tokens and secrets
    } catch (error) {
        LogEngine.error('❌ Environment configuration error:', {
            error: (error as Error).message
        });
        process.exit(1);
    }
    
    LogEngine.info('✅ Environment configuration validated successfully');
    LogEngine.info(`🚀 Running in ${process.env.NODE_ENV || 'development'} mode`);
}

/**
 * Validates Redis URL configurations to catch placeholder values
 * @throws Error if placeholder values are detected in Redis URLs
 */
function validateRedisUrls(): void {
    const redisUrls = [
        { name: 'PLATFORM_REDIS_URL', value: process.env.PLATFORM_REDIS_URL },
        { name: 'WEBHOOK_REDIS_URL', value: process.env.WEBHOOK_REDIS_URL }
    ];

    const placeholderValues = [
        'your_redis_url_here',
        'redis://your-redis-host:6379',
        'redis://localhost:6379', // Common placeholder that won't work in production
        'redis://redis:6379', // Docker compose placeholder
        'your_redis_connection_string',
        'redis_url_here'
    ];

    for (const redis of redisUrls) {
        if (!redis.value) continue; // Already caught by required variable check

        if (placeholderValues.some(placeholder => 
            redis.value!.toLowerCase().includes(placeholder.toLowerCase())
        )) {
            throw new Error(
                `${redis.name} contains placeholder values. Please replace with actual Redis connection string.\n` +
                'For Railway deployments: Use ${{Redis.REDIS_URL}} template variable.\n' +
                'For local development: Use redis://localhost:6379 with Redis running locally.'
            );
        }
    }
}

/**
 * Validates required API tokens and secrets to catch placeholder values
 * @throws Error if placeholder values are detected in API tokens
 */
function validateRequiredTokens(): void {
    const tokens = [
        { name: 'TELEGRAM_BOT_TOKEN', value: process.env.TELEGRAM_BOT_TOKEN },
        { name: 'UNTHREAD_API_KEY', value: process.env.UNTHREAD_API_KEY },
        { name: 'UNTHREAD_WEBHOOK_SECRET', value: process.env.UNTHREAD_WEBHOOK_SECRET }
    ];

    const placeholderValues = [
        'your_token_here',
        'your_api_key_here',
        'your_secret_here',
        'replace_with_your_token',
        'bot_token_from_botfather',
        'api_key_from_unthread',
        'webhook_secret_from_unthread',
        'your_telegram_bot_token',
        'your_unthread_api_key',
        'your_webhook_secret'
    ];

    for (const token of tokens) {
        if (!token.value) continue; // Already caught by required variable check

        if (placeholderValues.some(placeholder => 
            token.value!.toLowerCase().includes(placeholder.toLowerCase())
        )) {
            throw new Error(
                `${token.name} contains placeholder values. Please replace with actual credentials.\n` +
                'Get TELEGRAM_BOT_TOKEN from @BotFather on Telegram.\n' +
                'Get UNTHREAD_API_KEY and UNTHREAD_WEBHOOK_SECRET from your Unthread dashboard.'
            );
        }

        // Additional validation for token format
        if (token.name === 'TELEGRAM_BOT_TOKEN') {
            // Telegram bot tokens follow the pattern: numeric_bot_id:alphanumeric_string
            // Example: 123456:ABCdefGHIjklMNOpqrsTUVwxyz-1234567890_more_chars
            const telegramTokenPattern = /^\d{6,10}:[A-Za-z0-9_-]{35,}$/;
            
            if (!telegramTokenPattern.test(token.value)) {
                throw new Error(
                    'TELEGRAM_BOT_TOKEN format is invalid. Expected format: NNNNNN:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n' +
                    'Where N is the bot ID (6-10 digits) and X is a token suffix (35+ characters containing letters, digits, hyphens, or underscores).\n' +
                    'Get a valid token from @BotFather on Telegram.'
                );
            }
        }
    }
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

/**
 * Retrieves the list of authorized bot administrator user IDs from the environment variable.
 *
 * Parses the ADMIN_USERS environment variable (comma-separated Telegram user IDs) and validates
 * that all values are valid numbers. Invalid IDs are filtered out with warnings.
 * Since this is now a required variable, it will throw an error if not properly configured.
 *
 * @returns An array of Telegram user IDs that are authorized to manage the bot
 * @throws Error if ADMIN_USERS contains only placeholder values or invalid configuration
 */
export function getAdminUsers(): number[] {
    const adminUsers = process.env.ADMIN_USERS;
    
    // This should not happen since ADMIN_USERS is now required, but handle gracefully
    if (!adminUsers || adminUsers.trim() === '') {
        throw new Error('ADMIN_USERS environment variable is required but not set');
    }
    
    // Check for placeholder values that indicate incomplete configuration
    const placeholderValues = [
        'your_telegram_user_id_here',
        'your_user_id',
        'replace_with_your_id',
        'example_user_id'
    ];
    
    if (placeholderValues.some(placeholder => adminUsers.toLowerCase().includes(placeholder.toLowerCase()))) {
        throw new Error(
            'ADMIN_USERS contains placeholder values. Please replace with actual Telegram user IDs.\n' +
            'To get your Telegram user ID, message @userinfobot on Telegram.\n' +
            'Example: ADMIN_USERS=123456789,987654321'
        );
    }
    
    const userIds = adminUsers.split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0)
        .map(id => {
            const numId = parseInt(id, 10);
            if (isNaN(numId) || numId <= 0) {
                LogEngine.warn(`⚠️  Invalid admin user ID: ${id}. Skipping.`);
                return null;
            }
            return numId;
        })
        .filter((id): id is number => id !== null);
    
    if (userIds.length === 0) {
        throw new Error(
            'No valid admin user IDs found in ADMIN_USERS.\n' +
            'Please provide valid Telegram user IDs (numeric values only).\n' +
            'To get your Telegram user ID, message @userinfobot on Telegram.'
        );
    }
    
    LogEngine.info(`✅ Configured ${userIds.length} bot administrator(s)`, {
        adminCount: userIds.length,
        // Don't log actual user IDs for security
        hasAdmins: userIds.length > 0
    });
    
    return userIds;
}

/**
 * Checks if a given Telegram user ID is authorized to perform bot administration tasks.
 *
 * @param telegramUserId - The Telegram user ID to check
 * @returns True if the user is an authorized bot administrator, false otherwise
 */
export function isAdminUser(telegramUserId: number): boolean {
    const adminUsers = getAdminUsers();
    return adminUsers.includes(telegramUserId);
}

/**
 * Retrieves the company name from the environment variable.
 * 
 * Used for automatic partner name extraction from group titles.
 * If not set, defaults to 'Unthread'.
 * 
 * @returns The company name string
 */
export function getCompanyName(): string {
    return process.env.COMPANY_NAME?.trim() || 'Unthread';
}
