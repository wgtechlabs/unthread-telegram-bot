import { createClient } from 'redis';
import { EventValidator } from './EventValidator.js';
import { LogEngine } from '../../utils/logengine.js';

/**
 * WebhookConsumer - Polls Redis queue for Unthread webhook events
 * Filters events by platform and type, then routes to registered handlers
 */
export class WebhookConsumer {
  constructor(config) {
    this.redisUrl = config.redisUrl;
    this.queueName = config.queueName || 'unthread-events';
    this.pollInterval = config.pollInterval || 1000; // 1 second default
    this.batchSize = config.batchSize || 10; // Process 10 events at a time
    
    // Event handlers map: "eventType:sourcePlatform" -> handler function
    this.eventHandlers = new Map();
    
    // Redis client
    this.redisClient = null;
    this.isRunning = false;
    this.pollTimer = null;
  }
  
  /**
   * Initialize Redis connection
   */
  async connect() {
    try {
      if (!this.redisUrl) {
        throw new Error('Redis URL is required for webhook consumer');
      }
      
      this.redisClient = createClient({ url: this.redisUrl });
      await this.redisClient.connect();
      LogEngine.info('✅ Webhook consumer connected to Redis');
      return true;
    } catch (error) {
      LogEngine.error('❌ Webhook consumer Redis connection failed:', error);
      throw error;
    }
  }
  
  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    
    this.isRunning = false;
    
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }
    
    LogEngine.info('🔌 Webhook consumer disconnected');
  }
  
  /**
   * Subscribe to specific event types and platforms
   * @param {string} eventType - The type of event (e.g., 'message_created')
   * @param {string} sourcePlatform - The platform (e.g., 'telegram')
   * @param {function} handler - The handler function to call
   */
  subscribe(eventType, sourcePlatform, handler) {
    const key = `${eventType}:${sourcePlatform}`;
    this.eventHandlers.set(key, handler);
    LogEngine.info(`📋 Subscribed to ${eventType} events from ${sourcePlatform}`);
  }
  
  /**
   * Unsubscribe from event type and platform
   */
  unsubscribe(eventType, sourcePlatform) {
    const key = `${eventType}:${sourcePlatform}`;
    const removed = this.eventHandlers.delete(key);
    if (removed) {
      LogEngine.info(`🗑️ Unsubscribed from ${eventType} events from ${sourcePlatform}`);
    }
    return removed;
  }
  
  /**
   * Start polling for events
   */
  async start() {
    if (!this.redisClient) {
      await this.connect();
    }
    
    if (this.isRunning) {
      LogEngine.warn('⚠️ Webhook consumer is already running');
      return;
    }
    
    this.isRunning = true;
    LogEngine.log(`🚀 Webhook consumer started (polling every ${this.pollInterval}ms)`);
    LogEngine.info(`📋 Subscribed handlers: ${Array.from(this.eventHandlers.keys()).join(', ')}`);
    
    // Start polling loop
    this.pollTimer = setInterval(() => {
      this.pollEvents().catch(error => {
        LogEngine.error('❌ Error during event polling:', error);
      });
    }, this.pollInterval);
  }
  
  /**
   * Stop polling for events
   */
  async stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    
    this.isRunning = false;
    LogEngine.info('⏹️ Webhook consumer stopped');
  }
  
  /**
   * Poll Redis queue for new events
   */
  async pollEvents() {
    if (!this.redisClient || !this.isRunning) {
      return;
    }
    
    try {
      // Use BLPOP to get events from the queue (blocking pop with timeout)
      const result = await this.redisClient.blPop(
        this.queueName, // queue name
        1 // 1 second timeout
      );
      
      if (!result) {
        // No events in queue
        return;
      }
      
      // Parse the event
      let event;
      try {
        event = JSON.parse(result.element);
      } catch (parseError) {
        LogEngine.error('❌ Failed to parse webhook event:', parseError, result.element);
        return;
      }
      
      // Process the event
      await this.processEvent(event);
      
    } catch (error) {
      // Log error but don't stop polling
      LogEngine.error('❌ Error polling events:', error);
    }
  }
  
  /**
   * Process a single webhook event
   */
  async processEvent(event) {
    try {
      // Validate the event structure
      if (!EventValidator.validate(event)) {
        LogEngine.warn('⚠️ Invalid event structure, skipping:', JSON.stringify(event, null, 2));
        return;
      }
      
      // Check if we have a handler for this event
      const handlerKey = `${event.type}:${event.sourcePlatform}`;
      const handler = this.eventHandlers.get(handlerKey);
      
      if (!handler) {
        // No handler registered for this event type/platform
        LogEngine.debug(`📋 No handler for ${handlerKey}, skipping event`);
        return;
      }
      
      LogEngine.info(`🔄 Processing ${event.type} event from ${event.sourcePlatform}`);
      
      // Call the handler
      await handler(event);
      
      LogEngine.info(`✅ Event processed successfully: ${event.type} from ${event.sourcePlatform}`);
      
    } catch (error) {
      LogEngine.error('❌ Error processing event:', error);
      LogEngine.error('Event data:', JSON.stringify(event, null, 2));
    }
  }
  
  /**
   * Manually add an event to the queue (useful for testing)
   */
  async addEvent(event) {
    if (!this.redisClient) {
      throw new Error('Redis client not connected');
    }
    
    await this.redisClient.rPush(this.queueName, JSON.stringify(event));
    LogEngine.info(`📨 Event added to queue: ${event.type} from ${event.sourcePlatform}`);
  }
  
  /**
   * Get queue statistics
   */
  async getQueueStats() {
    if (!this.redisClient) {
      return { connected: false };
    }
    
    try {
      const queueLength = await this.redisClient.lLen(this.queueName);
      
      return {
        connected: true,
        queueLength,
        queueName: this.queueName,
        isRunning: this.isRunning,
        subscribedHandlers: Array.from(this.eventHandlers.keys()),
        pollInterval: this.pollInterval
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
  
  /**
   * Clear all events from the queue (useful for testing/debugging)
   */
  async clearQueue() {
    if (!this.redisClient) {
      throw new Error('Redis client not connected');
    }
    
    const cleared = await this.redisClient.del(this.queueName);
    LogEngine.info(`🗑️ Queue cleared, removed ${cleared} items`);
    return cleared;
  }
}
