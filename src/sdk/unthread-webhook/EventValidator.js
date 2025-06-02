/**
 * EventValidator - Validates webhook events from Unthread
 * Ensures events have the required structure and filters by platform
 */
export class EventValidator {
  /**
   * Validate webhook event structure
   * @param {Object} event - The event to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  static validate(event) {
    // Check basic structure
    if (!event || typeof event !== 'object') {
      return false;
    }
    
    // Required fields - make targetPlatform optional since some events might not have it
    const requiredFields = ['type', 'sourcePlatform', 'data'];
    for (const field of requiredFields) {
      if (!(field in event)) {
        console.log(`⚠️ Missing required field: ${field}`);
        return false;
      }
    }
    
    // Validate event type (only message_created for now)
    if (event.type !== 'message_created') {
      console.log(`⚠️ Unsupported event type: ${event.type}`);
      return false;
    }
    
    // For this Telegram bot, we want messages from dashboard/agents that should go to Telegram
    // We only process messages that originate from the dashboard (agent responses)
    if (event.type === 'message_created' && event.sourcePlatform !== 'dashboard') {
      console.log(`📋 Message not from dashboard (agent): ${event.sourcePlatform}`);
      return false;
    }
    
    // Optional: Check if targetPlatform is telegram (if this field exists)
    // Some webhook events might not have targetPlatform, so we make it optional
    if (event.targetPlatform && event.targetPlatform !== 'telegram') {
      console.log(`📋 Event not targeted for telegram platform: ${event.targetPlatform}`);
      return false;
    }
    
    // Validate data object
    if (!event.data || typeof event.data !== 'object') {
      console.log('⚠️ Invalid or missing data object');
      return false;
    }
    
    // Required data fields for message_created events
    const requiredDataFields = ['conversationId', 'text'];
    for (const field of requiredDataFields) {
      if (!(field in event.data)) {
        console.log(`⚠️ Missing required data field: ${field}`);
        return false;
      }
    }
    
    // Validate conversationId is not empty
    if (!event.data.conversationId || event.data.conversationId.trim() === '') {
      console.log('⚠️ conversationId cannot be empty');
      return false;
    }
    
    // Validate text is not empty
    if (!event.data.text || event.data.text.trim() === '') {
      console.log('⚠️ Message text cannot be empty');
      return false;
    }
    
    return true;
  }
  
  /**
   * Validate and sanitize event data
   * @param {Object} event - The event to validate and sanitize
   * @returns {Object|null} - Sanitized event or null if invalid
   */
  static validateAndSanitize(event) {
    if (!this.validate(event)) {
      return null;
    }
    
    // Create sanitized copy
    const sanitized = {
      type: event.type,
      sourcePlatform: event.sourcePlatform,
      targetPlatform: event.targetPlatform || 'telegram', // Default to telegram if not specified
      timestamp: event.timestamp || new Date().toISOString(),
      data: {
        conversationId: event.data.conversationId.trim(),
        text: event.data.text.trim(),
        // Optional fields
        author: event.data.author || null,
        messageId: event.data.messageId || null,
        threadId: event.data.threadId || null,
        customerId: event.data.customerId || null,
        sentByUserId: event.data.sentByUserId || null
      }
    };
    
    // Remove null values from optional fields
    Object.keys(sanitized.data).forEach(key => {
      if (sanitized.data[key] === null) {
        delete sanitized.data[key];
      }
    });
    
    return sanitized;
  }
  
  /**
   * Check if event is for a specific platform
   * @param {Object} event - The event to check
   * @param {string} platform - The platform to check for
   * @returns {boolean} - True if event is for the platform
   */
  static isForPlatform(event, platform) {
    return event && event.sourcePlatform === platform;
  }
  
  /**
   * Check if event is of a specific type
   * @param {Object} event - The event to check  
   * @param {string} type - The event type to check for
   * @returns {boolean} - True if event is of the type
   */
  static isEventType(event, type) {
    return event && event.type === type;
  }
  
  /**
   * Get event summary for logging
   * @param {Object} event - The event to summarize
   * @returns {string} - Event summary
   */
  static getEventSummary(event) {
    if (!event) return 'null event';
    
    const conversationId = event.data?.conversationId || 'unknown';
    const textPreview = event.data?.text?.substring(0, 50) || 'no text';
    
    return `${event.type} from ${event.sourcePlatform} to ${event.targetPlatform} (${conversationId}): "${textPreview}${event.data?.text?.length > 50 ? '...' : ''}"`;
  }
}
