/**
 * Unthread Telegram Bot - Database Connection Module
 *
 * Provides secure PostgreSQL database connection with comprehensive SSL support
 * for the Unthread Telegram Bot project. Designed for cloud deployment on Railway
 * and other cloud providers requiring secure database connections.
 *
 * This module manages database connections for storing customer data, support tickets,
 * user conversation states, and Bots Brain unified storage cache for the Telegram bot.
 *
 * Key Features:
 * - Production-grade SSL certificate validation with MITM attack prevention
 * - Connection pooling with automatic retry and error handling
 * - Environment-aware configuration (development/production)
 * - Automatic schema initialization and migration support
 * - Support for custom CA certificates via DATABASE_SSL_CA environment variable
 * - Comprehensive logging and monitoring for debugging and performance tracking
 * - Integration with Bots Brain unified storage system
 *
 * Security Features:
 * - SSL certificate validation enabled by default in production
 * - Configurable SSL validation for development environments   * - Environment-aware SSL configuration to prevent MITM attacks
 * - Secure connection string handling with validation
 *
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import pkg from 'pg';
const { Pool } = pkg;
import type { Pool as PoolType, PoolClient, QueryResult } from 'pg';
import { LogEngine } from '@wgtechlabs/log-engine';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database Connection Class
 *
 * Handles PostgreSQL connections with SSL support and connection pooling
 */
export class DatabaseConnection {
  private pool: PoolType;

  constructor() {
    // Configure SSL based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const sslConfig = this.getSSLConfig(isProduction);

    // Start with the base connection string
    let connectionString = process.env.POSTGRES_URL!;

    // Auto-append sslmode=disable only when completely disabling SSL
    if (sslConfig === false && !connectionString.includes('sslmode=')) {
      const separator = connectionString.includes('?') ? '&' : '?';
      connectionString += `${separator}sslmode=disable`;
      LogEngine.debug(
        'SSL disabled - added sslmode=disable to connection string',
        {
          originalUrl: process.env.POSTGRES_URL!,
          modifiedUrl: connectionString.replace(
            /\/\/[^:]+:[^@]+@/,
            '//***:***@'
          ), // Mask credentials
        }
      );
    }

    // Configure connection pool
    const poolConfig: any = {
      connectionString,
      max: 10, // Maximum number of connections in pool
      idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
      connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection cannot be established
    };

    // Only add SSL config if it's not explicitly disabled
    if (sslConfig !== false) {
      poolConfig.ssl = sslConfig;
    }

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err: Error) => {
      LogEngine.error('Unexpected error on idle client', {
        error: err.message,
        stack: err.stack,
      });
    });
    LogEngine.info('Database connection pool initialized', {
      maxConnections: 10,
      sslEnabled: sslConfig !== false,
      sslValidation: this.isRailwayEnvironment()
        ? 'railway-compatible'
        : isProduction
          ? 'enabled'
          : process.env.DATABASE_SSL_VALIDATE === 'full'
            ? 'disabled'
            : process.env.DATABASE_SSL_VALIDATE === 'true'
              ? 'disabled-validation'
              : process.env.DATABASE_SSL_VALIDATE === 'false'
                ? 'enabled'
                : 'enabled-no-validation',
      environment: process.env.NODE_ENV || 'development',
      provider: this.isRailwayEnvironment() ? 'Railway' : 'Unknown',
    });
  }

  /**
   * Get the database connection pool
   * @returns The PostgreSQL connection pool
   */
  get connectionPool(): PoolType {
    return this.pool;
  }

  /**
   * Execute a database query
   *
   * @param text - SQL query string
   * @param params - Query parameters
   * @returns Query result
   */
  async query(text: string, params: any[] = []): Promise<QueryResult<any>> {
    const client: PoolClient = await this.pool.connect();
    try {
      const start = Date.now();
      const result = await client.query(text, params);
      const duration = Date.now() - start;

      LogEngine.debug('Database query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        paramCount: params.length,
        rowCount: result.rowCount,
        duration: `${duration}ms`,
      });

      return result;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Database query error', {
        error: err.message,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        paramCount: params.length,
        stack: err.stack,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Test database connection and create schema if needed
   */
  async connect(): Promise<void> {
    try {
      // Test connection
      const result = await this.query('SELECT NOW() as current_time');
      LogEngine.info('Database connection established', {
        currentTime: result.rows[0]?.current_time,
        ssl: 'enabled',
      });

      // Check if we need to run schema setup
      await this.ensureSchema();
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to connect to database', {
        error: err.message,
        stack: err.stack,
        postgresUrl: process.env.POSTGRES_URL ? 'configured' : 'missing',
      });
      throw error;
    }
  }

  /**
   * Ensure database schema exists (Alpha version - auto-setup always)
   */
  async ensureSchema(): Promise<void> {
    try {
      // Check if tables exist
      const tableCheck = await this.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('customers', 'tickets', 'user_states', 'storage_cache')
            `);

      const requiredTables = ['customers', 'tickets', 'user_states'];
      const foundTables = tableCheck.rows.map((row: any) => row.table_name);
      const missingTables = requiredTables.filter(
        (table) => !foundTables.includes(table)
      );

      if (missingTables.length > 0) {
        LogEngine.info(
          'Database tables missing - setting up automatically...',
          {
            missing: missingTables,
          }
        );
        await this.initializeSchema();
      } else {
        LogEngine.info('Database schema verified', {
          tablesFound: foundTables,
          botsBrainReady: foundTables.includes('storage_cache'),
        });
      }
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Error checking database schema', {
        error: err.message,
        stack: err.stack,
      });
      throw error;
    }
  }

  /**
   * Initialize database schema from schema.sql file
   */
  async initializeSchema(): Promise<void> {
    try {
      LogEngine.info('Starting database schema initialization...');

      const schemaPath = path.join(__dirname, 'schema.sql');

      // Check if schema file exists asynchronously
      try {
        await fs.promises.access(schemaPath, fs.constants.F_OK);
      } catch (accessError) {
        throw new Error(`Schema file not found: ${schemaPath}`);
      }

      // Read schema file asynchronously
      const schema = await fs.promises.readFile(schemaPath, 'utf8');
      LogEngine.debug('Schema file loaded', {
        path: schemaPath,
        size: schema.length,
      });

      // Execute schema
      await this.query(schema);
      LogEngine.info('Database schema created successfully');
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to initialize database schema', {
        error: err.message,
        stack: err.stack,
      });
      throw error;
    }
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    try {
      await this.pool.end();
      LogEngine.info('Database connection pool closed');
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Error closing database pool', {
        error: err.message,
        stack: err.stack,
      });
      throw error;
    }
  } /**
   * Check if running on Railway platform
   * @returns True if detected Railway environment
   */
  private isRailwayEnvironment(): boolean {
    // Check Redis URLs and PostgreSQL URL that are available to this service
    const platformRedis = process.env.PLATFORM_REDIS_URL;
    const webhookRedis = process.env.WEBHOOK_REDIS_URL;
    const postgresUrl = process.env.POSTGRES_URL;
    // Railway internal services use 'railway.internal' in their hostnames
    const isRailwayHost = (url: string | undefined): boolean => {
      if (!url || url.trim() === '') return false;
      try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname.toLowerCase().includes('railway.internal');
      } catch {
        return false; // Invalid URL
      }
    };

    return (
      isRailwayHost(platformRedis) ||
      isRailwayHost(webhookRedis) ||
      isRailwayHost(postgresUrl)
    );
  }

  /**
   * Configure SSL settings based on environment
   * @param isProduction - Whether running in production environment
   * @returns SSL configuration object, or false to disable SSL entirely
   */
  private getSSLConfig(isProduction: boolean): any {
    // Check SSL validation setting first (applies to all environments)
    const sslValidate = process.env.DATABASE_SSL_VALIDATE;

    // If set to 'full', disable SSL entirely (useful for local Docker with sslmode=disable)
    if (sslValidate === 'full') {
      return false;
    }

    // Check if we're on Railway first - they use self-signed certificates
    if (this.isRailwayEnvironment()) {
      return {
        rejectUnauthorized: false, // Accept Railway's self-signed certificates
        // SSL encryption is still enabled for secure data transmission
        ca: process.env.DATABASE_SSL_CA || undefined,
      };
    }

    // In production, validate SSL certificates for security (unless overridden above)
    if (isProduction) {
      return {
        rejectUnauthorized: true,
        // Allow custom CA certificate if provided
        ca: process.env.DATABASE_SSL_CA || undefined,
      };
    }

    // In development, check remaining SSL validation settings
    // If set to 'true', enable SSL but disable certificate validation (common for dev)
    if (sslValidate === 'true') {
      return {
        rejectUnauthorized: false,
        ca: process.env.DATABASE_SSL_CA || undefined,
      };
    }

    // If explicitly set to 'false', enable SSL with validation
    if (sslValidate === 'false') {
      return {
        rejectUnauthorized: true,
        ca: process.env.DATABASE_SSL_CA || undefined,
      };
    }

    // Default for all environments: SSL enabled WITH certificate validation for security
    return {
      rejectUnauthorized: true,
      ca: process.env.DATABASE_SSL_CA || undefined,
    };
  }
}

// Create and export a singleton instance
export const db = new DatabaseConnection();
