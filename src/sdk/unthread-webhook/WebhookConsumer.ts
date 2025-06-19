import { createClient, RedisClientType } from 'redis';
import { EventValidator } from './EventValidator.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import type { WebhookEvent } from '../types.js';

/**
 * WebhookConsumer configuration
 */
export interface WebhookConsumerConfig {
  redisUrl: string;
  queueName?: string;
  pollInterval?: number;
}

/**
 * Event handler function type
 */
export type EventHandler = (event: WebhookEvent) => Promise<void>;

/**
 * WebhookConsumer - Simple Redis queue consumer for Unthread webhook events
 * 
 * Focused on reliably delivering agent messages from Unthread to Telegram.
 * Polls Redis queue, validates events, and routes message_created events to handlers.
 */
export class WebhookConsumer {
  private redisUrl: string;
  private queueName: string;
  private pollInterval: number;
  
  // Event handlers map: "eventType:sourcePlatform" -> handler function
  private eventHandlers: Map<string, EventHandler> = new Map();
  
  // Redis clients - separate clients for blocking and non-blocking operations
  private redisClient: RedisClientType | null = null;
  private blockingRedisClient: RedisClientType | null = null; // Dedicated client for blPop operations
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(config: WebhookConsumerConfig) {
    this.redisUrl = config.redisUrl;
    this.queueName = config.queueName || 'unthread-events';
    this.pollInterval = config.pollInterval || 1000; // 1 second default
  }
  
  /**
   * Initialize Redis connection
   */
  async connect(): Promise<boolean> {
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
  async disconnect(): Promise<void> {
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
   * @param eventType - Type of event to listen for (e.g., 'message_created')
   * @param sourcePlatform - Source platform to filter by (e.g., 'dashboard')
   * @param handler - Handler function to call for matching events
   */
  subscribe(eventType: string, sourcePlatform: string, handler: EventHandler): void {
    const key = `${eventType}:${sourcePlatform}`;
    this.eventHandlers.set(key, handler);
    LogEngine.info(`Subscribed to ${eventType} events from ${sourcePlatform}`);
  }
  
  /**
   * Start polling for events
   */
  async start(): Promise<void> {
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
  async stop(): Promise<void> {
    this.isRunning = false;
    await this.disconnect();
    LogEngine.info('Webhook consumer stopped');
  }
  
  /**
   * Schedule the next poll
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) return;
    
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollForEvents();
      } catch (error) {
        LogEngine.error('Error during event polling:', error);
      } finally {
        // Schedule next poll only once per cycle, regardless of success or failure
        this.scheduleNextPoll();
      }
    }, this.pollInterval);
  }

  /**
   * Poll Redis queue for new events
   */
  private async pollForEvents(): Promise<void> {
    if (!this.blockingRedisClient || !this.blockingRedisClient.isOpen) {
      LogEngine.warn('Blocking Redis client not connected, skipping poll');
      return;
    }

    try {
      LogEngine.debug(`Polling Redis queue: ${this.queueName}`);
      
      // Check queue length first for debugging
      if (this.redisClient && this.redisClient.isOpen) {
        const queueLength = await this.redisClient.lLen(this.queueName);
        if (queueLength > 0) {
          LogEngine.info(`Found ${queueLength} events in queue ${this.queueName}`);
        }
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
   * @param eventData - JSON string of the event
   */
  private async processEvent(eventData: string): Promise<void> {
    try {
      LogEngine.info('🔄 Starting event processing', { 
        eventDataLength: eventData.length,
        eventPreview: eventData.substring(0, 200) + '...'
      });
      
      // Parse the event
      let event: unknown;
      try {
        event = JSON.parse(eventData);
        const eventObj = event as Record<string, unknown>;
        LogEngine.info('✅ Event parsed successfully', {
          type: eventObj.type,
          sourcePlatform: eventObj.sourcePlatform,
          conversationId: (eventObj.data as any)?.conversationId || (eventObj.data as any)?.id
        });
      } catch (parseError) {
        LogEngine.error('❌ Failed to parse event JSON', {
          error: (parseError as Error).message,
          eventData: eventData.substring(0, 500)
        });
        return;
      }
      
      const eventObj = event as Record<string, unknown>;
      const data = eventObj.data as Record<string, unknown>;
      
      LogEngine.info('🔍 Processing webhook event', {
        type: eventObj.type,
        sourcePlatform: eventObj.sourcePlatform,
        conversationId: data?.conversationId || data?.id,
        timestamp: eventObj.timestamp,
        dataKeys: data ? Object.keys(data) : []
      });

      // Log full event payload at debug level to avoid log bloat
      LogEngine.debug('🔍 Complete webhook event payload', {
        completeEvent: JSON.stringify(event, null, 2)
      });

      // Validate the event
      LogEngine.info('🔍 Validating event...', {
        eventType: eventObj.type,
        sourcePlatform: eventObj.sourcePlatform,
        hasData: !!eventObj.data,
        conversationId: data?.conversationId || data?.id,
        hasContent: !!data?.content,
        hasText: !!data?.text,
        eventDataKeys: data ? Object.keys(data) : []
      });

      if (!EventValidator.validate(event)) {
        LogEngine.warn('❌ Invalid event, skipping', { 
          event: JSON.stringify(event, null, 2).substring(0, 1000) + '...'
        });
        return;
      }
      LogEngine.info('✅ Event validation passed');

      // Find handler for this event
      const validatedEvent = event as WebhookEvent;
      const handlerKey = `${validatedEvent.type}:${validatedEvent.sourcePlatform}`;
      LogEngine.info('🔍 Looking for handler', { handlerKey });
      const handler = this.eventHandlers.get(handlerKey);

      if (!handler) {
        LogEngine.warn(`❌ No handler registered for ${handlerKey}`, {
          availableHandlers: Array.from(this.eventHandlers.keys())
        });
        return;
      }

      // Execute the handler
      LogEngine.info(`🚀 Executing handler for ${validatedEvent.type} event from ${validatedEvent.sourcePlatform}`);
      try {
        await handler(validatedEvent);
        LogEngine.info(`✅ Event processed successfully: ${validatedEvent.type} from ${validatedEvent.sourcePlatform}`);
      } catch (handlerError) {
        LogEngine.error(`❌ Handler execution failed for ${validatedEvent.type}:${validatedEvent.sourcePlatform}`, {
          error: (handlerError as Error).message,
          stack: (handlerError as Error).stack,
          conversationId: data?.conversationId || data?.id
        });
        throw handlerError;
      }

    } catch (error) {
      LogEngine.error('❌ Error processing event:', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        eventDataPreview: eventData ? eventData.substring(0, 500) : 'null'
      });
    }
  }
  
  /**
   * Get connection status
   * @returns Status information
   */
  getStatus(): {
    isRunning: boolean;
    isConnected: boolean;
    isBlockingClientConnected: boolean;
    subscribedEvents: string[];
    queueName: string;
  } {
    return {
      isRunning: this.isRunning,
      isConnected: this.redisClient !== null && this.redisClient.isOpen,
      isBlockingClientConnected: this.blockingRedisClient !== null && this.blockingRedisClient.isOpen,
      subscribedEvents: Array.from(this.eventHandlers.keys()),
      queueName: this.queueName
    };
  }
}
