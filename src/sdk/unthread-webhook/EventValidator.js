/**
 * EventValidator - Simple validation for Unthread webhook events
 * 
 * Validates message_created events from dashboard for agent responses.
 */

export class EventValidator {
  /**
   * Validate message_created event structure
   * @param {Object} event - The webhook event to validate
   * @returns {boolean} - True if valid
   */
  static validate(event) {
    return event && 
           event.type === 'message_created' &&
           event.sourcePlatform === 'dashboard' &&
           event.data &&
           event.data.conversationId &&
           event.data.content;
  }
}
