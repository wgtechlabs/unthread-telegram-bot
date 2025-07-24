/**
 * Enhanced Log Configuration Utility
 * 
 * Provides intelligent logging controls for development vs production environments.
 * Offers log level filtering, startup summary, and debugging context controls.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0-rc1
 * @since 2025
 */
import { LogEngine } from '@wgtechlabs/log-engine';

export interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  startup: {
    verbose: boolean;
    summary: boolean;
  };
  runtime: {
    commands: boolean;
    middleware: boolean;
    database: boolean;
  };
}

interface PackageInfo {
  name: string;
  version: string;
}

interface AttachmentConfig {
  implementation: string;
  maxFileSize: string;
  maxFiles: number;
}

interface DatabaseConfig {
  originalUrl?: string;
  modifiedUrl?: string;
  maxConnections?: number;
  sslEnabled?: boolean;
}

type LogContext = Record<string, unknown>;

/**
 * Default log configurations for different environments
 */
const LOG_CONFIGS = {
  development: {
    level: 'info' as const,
    startup: {
      verbose: false,
      summary: true,
    },
    runtime: {
      commands: false,
      middleware: false,
      database: false,
    }
  },
  production: {
    level: 'warn' as const,
    startup: {
      verbose: false,
      summary: true,
    },
    runtime: {
      commands: false,
      middleware: false,
      database: false,
    }
  },
  debug: {
    level: 'debug' as const,
    startup: {
      verbose: true,
      summary: true,
    },
    runtime: {
      commands: true,
      middleware: true,
      database: true,
    }
  }
} as const;

let currentConfig: LogConfig = LOG_CONFIGS.development;

/**
 * Initialize logging configuration based on environment
 */
export function initializeLogConfig(): LogConfig {
  const env = process.env.NODE_ENV || 'development';
  const logLevel = process.env.LOG_LEVEL;
  
  // Determine configuration safely
  if (logLevel) {
    // Handle standard log levels
    if (logLevel === 'info') {
      currentConfig = LOG_CONFIGS.development;
    } else if (logLevel === 'warn' || logLevel === 'error') {
      currentConfig = LOG_CONFIGS.production;
    } else if (logLevel === 'debug') {
      currentConfig = LOG_CONFIGS.debug;
    }
    // Handle direct config names
    else if (logLevel === 'development') {
      currentConfig = LOG_CONFIGS.development;
    } else if (logLevel === 'production') {
      currentConfig = LOG_CONFIGS.production;
    }
    // Fall back to environment
    else if (env === 'development') {
      currentConfig = LOG_CONFIGS.development;
    } else if (env === 'production') {
      currentConfig = LOG_CONFIGS.production;
    } else if (env === 'debug') {
      currentConfig = LOG_CONFIGS.debug;
    } else {
      currentConfig = LOG_CONFIGS.development;
    }
  } else if (env === 'development') {
    currentConfig = LOG_CONFIGS.development;
  } else if (env === 'production') {
    currentConfig = LOG_CONFIGS.production;
  } else if (env === 'debug') {
    currentConfig = LOG_CONFIGS.debug;
  } else {
    currentConfig = LOG_CONFIGS.development;
  }
  
  LogEngine.info('🔧 Log configuration initialized', {
    environment: env,
    level: currentConfig.level,
    startupVerbose: currentConfig.startup.verbose,
    customLevel: !!logLevel
  });
  
  return currentConfig;
}

/**
 * Get current log configuration
 */
export function getLogConfig(): LogConfig {
  return currentConfig;
}

/**
 * Enhanced startup logger with summary mode
 */
export class StartupLogger {
  private static summaryData: {
    packageInfo?: PackageInfo;
    features: string[];
    commands: Array<{ name: string; config: LogContext }>;
    processors: number;
    admins: number;
    database: boolean;
  } = {
    features: [],
    commands: [],
    processors: 0,
    admins: 0,
    database: false
  };

  /**
   * Log package information (verbose or summary)
   */
  static logPackageInfo(packageInfo: PackageInfo): void {
    const config = getLogConfig();
    
    if (config.startup.verbose) {
      LogEngine.debug('Package.json loaded successfully', {
        name: packageInfo.name,
        version: packageInfo.version
      });
    }
    
    this.summaryData.packageInfo = packageInfo;
  }

  /**
   * Log feature initialization (verbose or summary)
   */
  static logFeatureInit(features: Record<string, boolean>): void {
    const config = getLogConfig();
    const activeFeatures = Object.entries(features)
      .filter(([_, enabled]) => enabled)
      .map(([feature, _]) => feature);
    
    if (config.startup.verbose) {
      LogEngine.debug('Basic features initialized', features);
    }
    
    this.summaryData.features.push(...activeFeatures);
  }

  /**
   * Log attachment handler (always shown as it's important)
   */
  static logAttachmentHandler(config: AttachmentConfig): void {
    LogEngine.info('AttachmentHandler initialized', {
      mode: config.implementation,
      maxSize: config.maxFileSize,
      maxFiles: config.maxFiles
    });
  }

  /**
   * Log architecture success (verbose or summary)
   */
  static logArchitectureSuccess(stats: LogContext): void {
    const config = getLogConfig();
    
    if (config.startup.verbose) {
      LogEngine.info('🎉 Clean Command Architecture Successfully Loaded!', stats);
    }
    // Summary mode will show this in final summary
  }

  /**
   * Log database connection (verbose or summary)
   */
  static logDatabaseConnection(dbConfig: DatabaseConfig): void {
    const config = getLogConfig();
    
    if (config.startup.verbose) {
      LogEngine.debug('SSL disabled - added sslmode=disable to connection string', dbConfig);
      LogEngine.info('Database connection pool initialized', dbConfig);
    }
    
    this.summaryData.database = true;
  }

  /**
   * Log command registration (verbose or summary)
   */
  static logCommandRegistration(commandName: string, commandConfig: LogContext): void {
    const config = getLogConfig();
    
    if (config.startup.verbose) {
      LogEngine.info(`Registered command: ${commandName}`, commandConfig);
    }
    
    // Store command for single-line summary
    this.summaryData.commands.push({ name: commandName, config: commandConfig });
  }

  /**
   * Show all registered commands in a single line
   */
  static showCommandRegistrationSummary(): void {
    if (this.summaryData.commands.length === 0) {
      return;
    }
    
    const config = getLogConfig();
    if (config.startup.verbose) {
      return; // Already shown individually
    }
    
    const commandNames = this.summaryData.commands.map(cmd => cmd.name);
    const adminCommands = this.summaryData.commands.filter(cmd => cmd.config.adminOnly).length;
    const privateCommands = this.summaryData.commands.filter(cmd => cmd.config.privateOnly).length;
    const groupCommands = this.summaryData.commands.filter(cmd => cmd.config.groupOnly).length;
    
    LogEngine.info(`📋 Registered ${this.summaryData.commands.length} commands: ${commandNames.join(', ')}`, {
      total: this.summaryData.commands.length,
      adminOnly: adminCommands,
      privateOnly: privateCommands,
      groupOnly: groupCommands
    });
  }

  /**
   * Log processor registration (verbose or summary)
   */
  static logProcessorRegistration(type: 'conversation' | 'callback'): void {
    const config = getLogConfig();
    
    // Only show individual processor logs in verbose mode
    if (config.startup.verbose) {
      LogEngine.info(`Registered ${type} processor`);
    }
    
    this.summaryData.processors++;
  }

  /**
   * Show processor registration summary
   */
  static showProcessorRegistrationSummary(): void {
    const config = getLogConfig();
    if (config.startup.verbose || this.summaryData.processors === 0) {
      return; // Already shown individually or no processors
    }
    
    // This will be included in the final startup summary instead of individual logs
  }

  /**
   * Log admin configuration
   */
  static logAdminConfig(adminCount: number): void {
    LogEngine.info(`✅ Configured ${adminCount} bot administrator(s)`, {
      adminCount,
      hasAdmins: adminCount > 0
    });
    
    this.summaryData.admins = adminCount;
  }

  /**
   * Show final startup summary
   */
  static showStartupSummary(): void {
    const config = getLogConfig();
    
    if (config.startup.summary) {
      const { packageInfo, features, commands, processors, admins, database } = this.summaryData;
      
      LogEngine.info('🚀 Bot startup complete', {
        version: packageInfo?.version || 'unknown',
        features: features.length,
        commands: commands.length,
        processors,
        admins,
        database: database ? 'connected' : 'disconnected',
        logLevel: config.level,
        verbose: config.startup.verbose
      });
    }
  }
}

/**
 * Conditional logging helpers
 */
export class ConditionalLogger {
  /**
   * Log command execution (if enabled)
   */
  static logCommand(commandName: string, context: LogContext): void {
    const config = getLogConfig();
    if (config.runtime.commands) {
      LogEngine.debug(`Executing command: ${commandName}`, context);
    }
  }

  /**
   * Log middleware activity (if enabled)
   */
  static logMiddleware(action: string, context: LogContext): void {
    const config = getLogConfig();
    if (config.runtime.middleware) {
      LogEngine.debug(`Middleware: ${action}`, context);
    }
  }

  /**
   * Log database operations (if enabled)
   */
  static logDatabase(operation: string, context: LogContext): void {
    const config = getLogConfig();
    if (config.runtime.database) {
      LogEngine.debug(`Database: ${operation}`, context);
    }
  }
}
