import { createClient } from 'redis';
import pkg from 'pg';
const { Pool } = pkg;
import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * UnifiedStorage - Multi-layer storage architecture
 * Layer 1: Memory cache (24hr TTL) - fastest access
 * Layer 2: Redis cache (3-day TTL) - fast distributed cache
 * Layer 3: PostgreSQL (permanent) - persistent storage
 */
export class UnifiedStorage {
  constructor(config) {
    // Layer 1: Memory cache with TTL
    this.memoryCache = new Map();
    this.memoryCacheTTL = new Map(); // Store expiration times
    this.memoryTTL = config.memoryTTL || 24 * 60 * 60 * 1000; // 24 hours default
    
    // Layer 2: Redis configuration
    this.redisConfig = {
      url: config.redisUrl,
      ttl: config.redisTTL || 3 * 24 * 60 * 60 // 3 days default
    };
    this.redisClient = null;
    
    // Layer 3: PostgreSQL configuration
    this.dbConfig = config.postgres;
    this.db = null;
    
    // Connection status
    this.connected = false;
    
    // Start memory cleanup interval
    this.startMemoryCleanup();
  }
  
  async connect() {
    try {
      // Connect to Redis (optional)
      if (this.redisConfig.url) {
        try {
          this.redisClient = createClient({ url: this.redisConfig.url });
          await this.redisClient.connect();
          LogEngine.info('Redis connected for bots-brain');
        } catch (error) {
          LogEngine.warn('Redis not available, using Memory + PostgreSQL only');
          this.redisClient = null;
        }
      } else {
        LogEngine.info('Redis URL not provided, using Memory + PostgreSQL only');
      }
      
      // Connect to PostgreSQL
      if (this.dbConfig) {
        // If dbConfig is already a Pool instance, use it directly
        if (this.dbConfig.query && typeof this.dbConfig.query === 'function') {
          this.db = this.dbConfig;
        } else {
          // Otherwise create a new Pool with the config
          this.db = new Pool(this.dbConfig);
        }
        await this.db.query('SELECT 1'); // Test connection
        LogEngine.info('PostgreSQL connected for bots-brain');
      }
      
      this.connected = true;
      LogEngine.info('UnifiedStorage initialized with multi-layer architecture');
    } catch (error) {
      LogEngine.error('UnifiedStorage connection failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  async disconnect() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    // Only close the database pool if we created it ourselves
    // If it was passed in as an existing pool, let the caller manage it
    if (this.db && this.dbConfig && !this.dbConfig.query) {
      await this.db.end();
    }
    this.connected = false;
    LogEngine.info('UnifiedStorage disconnected');
  }
  
  /**
   * Get value from storage (Memory → Redis → PostgreSQL)
   */
  async get(key) {
    try {
      // Layer 1: Check memory cache first
      const memoryCached = this.getFromMemory(key);
      if (memoryCached !== null) {
        return memoryCached;
      }
      
      // Layer 2: Check Redis cache
      if (this.redisClient) {
        const redisCached = await this.redisClient.get(key);
        if (redisCached) {
          const value = JSON.parse(redisCached);
          // Store back in memory for next time
          this.setInMemory(key, value);
          return value;
        }
      }
      
      // Layer 3: Check PostgreSQL
      if (this.db) {
        const pgValue = await this.getFromPostgres(key);
        if (pgValue !== null) {
          // Store back in Redis and memory for next time
          if (this.redisClient) {
            await this.redisClient.setEx(key, this.redisConfig.ttl, JSON.stringify(pgValue));
          }
          this.setInMemory(key, pgValue);
          return pgValue;
        }
      }
      
      return null;
    } catch (error) {
      LogEngine.error(`Error getting ${key}`, {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }
  
  /**
   * Set value in all storage layers
   */
  async set(key, value) {
    try {
      // Store in all layers
      this.setInMemory(key, value);
      
      if (this.redisClient) {
        await this.redisClient.setEx(key, this.redisConfig.ttl, JSON.stringify(value));
      }
      
      if (this.db) {
        await this.setInPostgres(key, value);
      }
      
      return true;
    } catch (error) {
      LogEngine.error(`Error setting ${key}`, {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }
  
  /**
   * Delete from all storage layers
   */
  async delete(key) {
    try {
      // Delete from all layers
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
      
      if (this.redisClient) {
        await this.redisClient.del(key);
      }
      
      if (this.db) {
        await this.deleteFromPostgres(key);
      }
      
      return true;
    } catch (error) {
      LogEngine.error(`Error deleting ${key}`, {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }
  
  // Memory cache operations
  getFromMemory(key) {
    const expiration = this.memoryCacheTTL.get(key);
    if (expiration && Date.now() > expiration) {
      // Expired, clean up
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
      return null;
    }
    return this.memoryCache.get(key) || null;
  }
  
  setInMemory(key, value) {
    this.memoryCache.set(key, value);
    this.memoryCacheTTL.set(key, Date.now() + this.memoryTTL);
  }
  
  // PostgreSQL operations using key-value table
  async getFromPostgres(key) {
    try {
      const result = await this.db.query(
        'SELECT value FROM storage_cache WHERE key = $1 AND expires_at > NOW()',
        [key]
      );
      return result.rows.length > 0 ? JSON.parse(result.rows[0].value) : null;
    } catch (error) {
      // Table might not exist, that's okay for now
      return null;
    }
  }
  
  async setInPostgres(key, value) {
    try {
      const expiresAt = new Date(Date.now() + (this.redisConfig.ttl * 1000));
      await this.db.query(`
        INSERT INTO storage_cache (key, value, expires_at) 
        VALUES ($1, $2, $3)
        ON CONFLICT (key) 
        DO UPDATE SET value = $2, expires_at = $3, updated_at = NOW()
      `, [key, JSON.stringify(value), expiresAt]);
    } catch (error) {
      // Table might not exist, that's okay for now
      LogEngine.debug('storage_cache table not found, using Redis + Memory only');
    }
  }
  
  async deleteFromPostgres(key) {
    try {
      await this.db.query('DELETE FROM storage_cache WHERE key = $1', [key]);
    } catch (error) {
      // Table might not exist, that's okay
    }
  }
  
  // Memory cleanup
  startMemoryCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, expiration] of this.memoryCacheTTL.entries()) {
        if (now > expiration) {
          this.memoryCache.delete(key);
          this.memoryCacheTTL.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }
  
  // Utility methods
  getStats() {
    return {
      memoryKeys: this.memoryCache.size,
      connected: this.connected,
      layers: {
        memory: true,
        redis: !!this.redisClient,
        postgres: !!this.db
      }
    };
  }
}
