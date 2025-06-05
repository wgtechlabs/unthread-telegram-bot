/**
 * Database Connection Module
 * 
 * Provides PostgreSQL database connection with SSL support for Railway
 * and other cloud providers that require secure connections.
 */

import pkg from 'pg';
const { Pool } = pkg;
import * as logger from '../utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Database Connection Class
 * 
 * Handles PostgreSQL connections with SSL support and connection pooling
 */
export class DatabaseConnection {
    constructor() {
        // Validate required environment variable
        if (!process.env.POSTGRES_URL) {
            const error = 'POSTGRES_URL environment variable is required but not defined';
            logger.error(error);
            throw new Error(error);
        }

        // Configure connection pool with SSL for Railway
        this.pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: {
                rejectUnauthorized: false // Required for Railway and most cloud providers
            },
            max: 10, // Maximum number of connections in pool
            idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
            connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection cannot be established
        });

        // Handle pool errors
        this.pool.on('error', (err) => {
            logger.error('Unexpected error on idle client', {
                error: err.message,
                stack: err.stack
            });
        });

        logger.info('Database connection pool initialized', {
            maxConnections: 10,
            sslEnabled: true,
            provider: 'Railway'
        });
    }

    /**
     * Execute a database query
     * 
     * @param {string} text - SQL query string
     * @param {Array} params - Query parameters
     * @returns {Promise<object>} Query result
     */
    async query(text, params = []) {
        const client = await this.pool.connect();
        try {
            const start = Date.now();
            const result = await client.query(text, params);
            const duration = Date.now() - start;
            
            logger.debug('Database query executed', {
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                paramCount: params.length,
                rowCount: result.rowCount,
                duration: `${duration}ms`
            });
            
            return result;
        } catch (error) {
            logger.error('Database query error', {
                error: error.message,
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                paramCount: params.length,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Test database connection and create schema if needed
     * 
     * @returns {Promise<void>}
     */
    async connect() {
        try {
            // Test connection
            const result = await this.query('SELECT NOW() as current_time');
            logger.success('Database connection established', {
                currentTime: result.rows[0].current_time,
                ssl: 'enabled'
            });

            // Check if we need to run schema setup
            await this.ensureSchema();
            
        } catch (error) {
            logger.error('Failed to connect to database', {
                error: error.message,
                stack: error.stack,
                postgresUrl: process.env.POSTGRES_URL ? 'configured' : 'missing'
            });
            throw error;
        }
    }

    /**
     * Ensure database schema exists
     * 
     * @returns {Promise<void>}
     */
    async ensureSchema() {
        try {
            // Check if tables exist
            const tableCheck = await this.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('customers', 'tickets', 'user_states')
            `);

            if (tableCheck.rows.length === 0) {
                logger.info('Database tables not found. Schema setup may be needed.');
                logger.info('Run the schema.sql file to create the required tables.');
            } else {
                logger.success('Database schema verified', {
                    tablesFound: tableCheck.rows.map(row => row.table_name)
                });
            }
        } catch (error) {
            logger.error('Error checking database schema', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Execute a transaction
     * 
     * @param {Function} callback - Function that receives client and executes queries
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Transaction failed and rolled back', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Close all connections in the pool
     * 
     * @returns {Promise<void>}
     */
    async close() {
        try {
            await this.pool.end();
            logger.info('Database connection pool closed');
        } catch (error) {
            logger.error('Error closing database pool', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

// Create and export a singleton instance
export const db = new DatabaseConnection();
