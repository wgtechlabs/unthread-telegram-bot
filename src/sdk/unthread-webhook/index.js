/**
 * Unthread Webhook SDK - Simple message delivery for Telegram bots
 * 
 * Consumes agent responses from Unthread dashboard and delivers them to Telegram.
 * 
 * Usage:
 * ```javascript
 * import { WebhookConsumer } from './unthread-webhook';
 * 
 * const consumer = new WebhookConsumer({
 *   redisUrl: 'redis://localhost:6379',
 *   queueName: 'unthread-events'
 * });
 *
 * consumer.subscribe('message_created', 'dashboard', async (event) => {
 *   // Send agent message to Telegram
 *   await sendToTelegram(event.data);
 * });
 *
 * await consumer.start();
 * ```
 */

export { WebhookConsumer } from './WebhookConsumer.js';
export { EventValidator } from './EventValidator.js';
