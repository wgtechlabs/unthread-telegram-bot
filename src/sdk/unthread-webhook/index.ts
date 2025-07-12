/**
 * Unthread Telegram Bot - Unthread Webhook SDK
 *
 * Lightweight SDK for consuming webhook events from the Unthread platform and
 * delivering agent responses to Telegram users. Provides reliable message
 * delivery with Redis-based queue processing and event validation.
 *
 * Core Components:
 * - WebhookConsumer: Redis queue consumer for processing webhook events
 * - EventValidator: Validates incoming webhook event structure and content
 *
 * Features:
 * - Real-time webhook event processing
 * - Redis-based queue management for reliability
 * - Event validation and filtering
 * - Automatic retry mechanisms for failed deliveries
 * - Support for multiple event types (message_created, conversation_updated)
 *
 * Integration:
 * - Seamless integration with Unthread dashboard
 * - Event routing based on source platform (dashboard)
 * - Message delivery to Telegram with context preservation
 * - Error handling and dead letter queue support
 *
 * Usage Example:
 * ```typescript
 * import { WebhookConsumer } from './unthread-webhook';
 *
 * const consumer = new WebhookConsumer({
 *   redisUrl: process.env.WEBHOOK_REDIS_URL,
 *   queueName: 'unthread-events'
 * });
 *
 * consumer.subscribe('message_created', 'dashboard', async (event) => {
 *   // Deliver agent message to Telegram
 *   await telegramHandler.deliverMessage(event.data);
 * });
 * * await consumer.start();
 * ```
 *
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

export { WebhookConsumer } from './WebhookConsumer.js';
export { EventValidator } from './EventValidator.js';
