import { createClient } from 'redis';
import { EventValidator } from './EventValidator.js';
import { LogEngine } from '@wgtechlabs/log-engine';

// Helper function for command options (Redis v4 compatibility)
const commandOptions = (options) => options;

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
      LogEngine.info('Webhook consumer connected to Redis');
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
      
      if (this.redisClient && this.redisClient.isOpen) {
        await this.redisClient.disconnect();
        LogEngine.info('Webhook consumer disconnected from Redis');
      }
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
    if (!this.redisClient || !this.redisClient.isOpen) {
      LogEngine.warn('Redis client not connected, skipping poll');
      return;
    }
    
    try {
      // Get the next event from the queue (blocking pop with 1 second timeout)
      const result = await this.redisClient.blPop(commandOptions({ isolated: true }), this.queueName, 1);
      
      if (result) {
        const eventData = result.element;
        await this.processEvent(eventData);
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
      // Parse the event
      const event = JSON.parse(eventData);
      
      LogEngine.debug('Processing webhook event', {
        type: event.type,
        sourcePlatform: event.sourcePlatform,
        conversationId: event.data?.conversationId
      });
      
      // Validate the event
      if (!EventValidator.validate(event)) {
        LogEngine.debug('Invalid event, skipping');
        return;
      }
      
      // Find handler for this event
      const handlerKey = `${event.type}:${event.sourcePlatform}`;
      const handler = this.eventHandlers.get(handlerKey);
      
      if (!handler) {
        LogEngine.debug(`No handler registered for ${handlerKey}`);
        return;
      }
      
      // Execute the handler
      LogEngine.info(`Processing ${event.type} event from ${event.sourcePlatform}`);
      await handler(event);
      LogEngine.info(`Event processed successfully: ${event.type} from ${event.sourcePlatform}`);
      
    } catch (error) {
      LogEngine.error('Error processing event:', error.message);
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
      subscribedEvents: Array.from(this.eventHandlers.keys()),
      queueName: this.queueName
    };
  }
}
