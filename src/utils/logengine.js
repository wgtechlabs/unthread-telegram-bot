/**
 * Logger Configuration Module
 * 
 * Configures @wgtechlabs/log-engine based on environment variables and exports it directly.
 * This eliminates the redundant wrapper and allows direct usage of log-engine throughout the project.
 */
import { LogEngine, LogMode } from '@wgtechlabs/log-engine';
import dotenv from 'dotenv';

// Load environment variables
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

// Initialize the logger configuration
const currentMode = configureLogEngine();

// Export LogEngine and LogMode directly - no wrapper needed
export { LogEngine, LogMode };

// Log the initialization
LogEngine.log(`Logger configured with @wgtechlabs/log-engine (Mode: ${currentMode})`);