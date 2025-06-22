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
 * - UNTHREAD_WEBHOOK_SECRET: Secret for webhook signature verification
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

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
    'TELEGRAM_BOT_TOKEN',
    'UNTHREAD_API_KEY',
    'UNTHREAD_SLACK_CHANNEL_ID',
    'UNTHREAD_WEBHOOK_SECRET',
    'PLATFORM_REDIS_URL',
    'WEBHOOK_REDIS_URL',
    'POSTGRES_URL'
] as const;

/**
 * Validates that all required environment variables are present
 */
export function validateEnvironment(): void {
    const missingVars: string[] = [];
    
    for (const varName of REQUIRED_ENV_VARS) {
        if (!process.env[varName]) {
            missingVars.push(varName);
        }
    }
    
    if (missingVars.length > 0) {
        console.error('❌ Missing required environment variables:');
        missingVars.forEach(varName => {
            console.error(`   - ${varName}`);
        });
        console.error('\n📝 Please copy .env.example to .env and fill in the required values.');
        console.error('   This works for both local development and Docker deployment.\n');
        process.exit(1);
    }
    
    console.log('✅ Environment configuration validated successfully');
    console.log(`🚀 Running in ${process.env.NODE_ENV || 'development'} mode`);
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
 * Check if running in development
 */
export function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
}
