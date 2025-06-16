import { createClient } from 'redis';
import { EventValidator } from './EventValidator.js';
import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * WebhookConsumer - Simple Redis queue consumer for Unthread webhook events
 * 
 * Focused on reliably delivering agent messages from Unthread to Telegram.
 * Polls Redis queue, validates events, and routes message_created events to handlers.
 */
export class WebhookConsumer {
  constructor(config) {
    this.redisUrl = config.redisUrl;
    this.queueName = config.queueName || 'unthread-events';
    this.pollInterval = config.pollInterval || 1000; // 1 second default
    
    // Event handlers map: "eventType:sourcePlatform" -> handler function
    this.eventHandlers = new Map();
    
    // Redis clients - separate clients for blocking and non-blocking operations
    this.redisClient = null;
    this.blockingRedisClient = null; // Dedicated client for blPop operations
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
      
      // Create main Redis client for general operations
      this.redisClient = createClient({ url: this.redisUrl });
      await this.redisClient.connect();
      
      // Create dedicated Redis client for blocking operations (blPop)
      this.blockingRedisClient = createClient({ url: this.redisUrl });
      await this.blockingRedisClient.connect();
      
      LogEngine.info('Webhook consumer connected to Redis with isolated blocking client');
      return true;
    } catch (error) {
      LogEngine.error('Webhook consumer Redis connection failed:', error);
      throw error;
    }
  }
  
  /**
   * Disconnect from Redis
   */
  async disconnect() {
    try {
      this.isRunning = false;
      
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      
      // Disconnect both Redis clients
      if (this.redisClient && this.redisClient.isOpen) {
        await this.redisClient.disconnect();
      }
      
      if (this.blockingRedisClient && this.blockingRedisClient.isOpen) {
        await this.blockingRedisClient.disconnect();
      }
      
      LogEngine.info('Webhook consumer disconnected from Redis');
    } catch (error) {
      LogEngine.error('Error disconnecting webhook consumer:', error);
    }
  }
  
  /**
   * Subscribe to a specific event type and platform
   * @param {string} eventType - Type of event to listen for (e.g., 'message_created')
   * @param {string} sourcePlatform - Source platform to filter by (e.g., 'dashboard')
   * @param {Function} handler - Handler function to call for matching events
   */
  subscribe(eventType, sourcePlatform, handler) {
    const key = `${eventType}:${sourcePlatform}`;
    this.eventHandlers.set(key, handler);
    LogEngine.info(`Subscribed to ${eventType} events from ${sourcePlatform}`);
  }
  
  /**
   * Start polling for events
   */
  async start() {
    if (this.isRunning) {
      LogEngine.warn('Webhook consumer is already running');
      return;
    }
    
    await this.connect();
    this.isRunning = true;
    LogEngine.info('Webhook consumer started - polling for events');
    
    // Start the polling loop
    this.scheduleNextPoll();
  }
  
  /**
   * Stop polling for events
   */
  async stop() {
    this.isRunning = false;
    await this.disconnect();
    LogEngine.info('Webhook consumer stopped');
  }
  
  /**
   * Schedule the next poll
   */
  scheduleNextPoll() {
    if (!this.isRunning) return;
    
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollForEvents();
      } catch (error) {
        LogEngine.error('Error during event polling:', error);
      }
      
      // Schedule next poll
      this.scheduleNextPoll();
    }, this.pollInterval);
  }
   /**
   * Poll Redis queue for new events
   */
  async pollForEvents() {
    if (!this.blockingRedisClient || !this.blockingRedisClient.isOpen) {
      LogEngine.warn('Blocking Redis client not connected, skipping poll');
      return;
    }

    try {
      LogEngine.debug(`Polling Redis queue: ${this.queueName}`);
      
      // Check queue length first for debugging
      const queueLength = await this.redisClient.lLen(this.queueName);
      if (queueLength > 0) {
        LogEngine.info(`Found ${queueLength} events in queue ${this.queueName}`);
      }
      
      // Get the next event from the queue using dedicated blocking client (1 second timeout)
      const result = await this.blockingRedisClient.blPop(this.queueName, 1);
      
      if (result) {
        LogEngine.info(`Received event from queue: ${this.queueName}`);
        const eventData = result.element;
        await this.processEvent(eventData);
      } else {
        LogEngine.debug(`No events in queue: ${this.queueName}`);
      }
    } catch (error) {
      LogEngine.error('Error polling for events:', error);
    }
  }
   /**
   * Process a single event
   * @param {string} eventData - JSON string of the event
   */
  async processEvent(eventData) {
    try {
      LogEngine.info('🔄 Starting event processing', { 
        eventDataLength: eventData.length,
        eventPreview: eventData.substring(0, 200) + '...'
      });
      
      // Parse the event
      let event;
      try {
        event = JSON.parse(eventData);
        LogEngine.info('✅ Event parsed successfully', {
          type: event.type,
          sourcePlatform: event.sourcePlatform,
          conversationId: event.data?.conversationId || event.data?.id
        });
      } catch (parseError) {
        LogEngine.error('❌ Failed to parse event JSON', {
          error: parseError.message,
          eventData: eventData.substring(0, 500)
        });
        return;
      }
      
      LogEngine.info('🔍 Processing webhook event', {
        type: event.type,
        sourcePlatform: event.sourcePlatform,
        conversationId: event.data?.conversationId || event.data?.id,
        timestamp: event.timestamp,
        dataKeys: event.data ? Object.keys(event.data) : []
      });

      // Log full event payload at debug level to avoid log bloat
      LogEngine.debug('🔍 Complete webhook event payload', {
        completeEvent: JSON.stringify(event, null, 2)
      });

      // Validate the event
      LogEngine.info('🔍 Validating event...', {
        eventType: event.type,
        sourcePlatform: event.sourcePlatform,
        hasData: !!event.data,
        conversationId: event.data?.conversationId || event.data?.id,
        hasContent: !!event.data?.content,
        hasText: !!event.data?.text,
        eventDataKeys: event.data ? Object.keys(event.data) : []
      });
      if (!EventValidator.validate(event)) {
        LogEngine.warn('❌ Invalid event, skipping', { 
          event: JSON.stringify(event, null, 2).substring(0, 1000) + '...'
        });
        return;
      }
      LogEngine.info('✅ Event validation passed');

      // Find handler for this event
      const handlerKey = `${event.type}:${event.sourcePlatform}`;
      LogEngine.info('🔍 Looking for handler', { handlerKey });
      const handler = this.eventHandlers.get(handlerKey);

      if (!handler) {
        LogEngine.warn(`❌ No handler registered for ${handlerKey}`, {
          availableHandlers: Array.from(this.eventHandlers.keys())
        });
        return;
      }

      // Execute the handler
      LogEngine.info(`🚀 Executing handler for ${event.type} event from ${event.sourcePlatform}`);
      try {
        await handler(event);
        LogEngine.info(`✅ Event processed successfully: ${event.type} from ${event.sourcePlatform}`);
      } catch (handlerError) {
        LogEngine.error(`❌ Handler execution failed for ${event.type}:${event.sourcePlatform}`, {
          error: handlerError.message,
          stack: handlerError.stack,
          conversationId: event.data?.conversationId || event.data?.id
        });
        throw handlerError;
      }

    } catch (error) {
      LogEngine.error('❌ Error processing event:', {
        error: error.message,
        stack: error.stack,
        eventDataPreview: eventData ? eventData.substring(0, 500) : 'null'
      });
    }
  }
  
  /**
   * Get connection status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isConnected: this.redisClient && this.redisClient.isOpen,
      isBlockingClientConnected: this.blockingRedisClient && this.blockingRedisClient.isOpen,
      subscribedEvents: Array.from(this.eventHandlers.keys()),
      queueName: this.queueName
    };
  }
}
