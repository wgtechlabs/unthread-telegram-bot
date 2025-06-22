/**
 * Environment Configuration and Validation
 * 
 * This module validates that all required environment variables are present.
 * Import this module after dotenv.config() has been called.
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
