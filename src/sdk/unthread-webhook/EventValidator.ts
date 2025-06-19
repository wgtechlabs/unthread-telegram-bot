import { LogEngine } from '@wgtechlabs/log-engine';
import type { WebhookEvent, MessageCreatedEvent, ConversationUpdatedEvent } from '../types.js';

/**
 * EventValidator - Simple validation for Unthread webhook events
 * 
 * Validates message_created and conversation_updated events from dashboard.
 */

export class EventValidator {
  /**
   * Validate webhook event structure for supported event types
   * @param event - The webhook event to validate
   * @returns True if valid
   */
  static validate(event: unknown): event is WebhookEvent {
    // Perform all basic validation checks
    const hasEvent = !!event && typeof event === 'object';
    if (!hasEvent) {
      // Only log validation failures to reduce noise
      LogEngine.warn('❌ Event validation failed: Invalid event object');
      return false;
    }
    
    const eventObj = event as Record<string, unknown>;
    const hasCorrectType = ['message_created', 'conversation_updated'].includes(eventObj.type as string);
    const hasCorrectPlatform = eventObj.sourcePlatform === 'dashboard';
    const hasData = !!eventObj.data && typeof eventObj.data === 'object';
    
    // Early validation failure logging
    if (!hasCorrectType || !hasCorrectPlatform || !hasData) {
      LogEngine.warn('❌ Event validation failed: Basic structure invalid', {
        type: eventObj.type,
        sourcePlatform: eventObj.sourcePlatform,
        hasData,
        hasCorrectType,
        hasCorrectPlatform
      });
      return false;
    }
    
    const data = eventObj.data as Record<string, unknown>;
    const hasConversationId = !!(data.conversationId || data.id);
    
    if (!hasConversationId) {
      LogEngine.warn('❌ Event validation failed: Missing conversation ID', {
        type: eventObj.type,
        availableKeys: Object.keys(data || {})
      });
      return false;
    }
    
    // Only log detailed validation info in verbose mode or for failures
    if (process.env.LOG_LEVEL === 'debug' || process.env.VERBOSE_LOGGING === 'true') {
      LogEngine.debug('🔍 Event validation checks passed', {
        type: eventObj.type,
        sourcePlatform: eventObj.sourcePlatform,
        conversationId: data.conversationId || data.id
      });
    }
    
    // Validate based on event type
    if (eventObj.type === 'message_created') {
      // Check for both 'content' and 'text' fields (webhook server sends 'text')
      const hasContent = !!(data.content || data.text);
      
      if (!hasContent) {
        LogEngine.warn('❌ Message validation failed: Missing content/text', { 
          conversationId: data.conversationId || data.id,
          availableKeys: Object.keys(data || {}) 
        });
        return false;
      }
      
      // Success - only log in verbose mode
      if (process.env.LOG_LEVEL === 'debug' || process.env.VERBOSE_LOGGING === 'true') {
        LogEngine.debug('✅ Message event validated successfully', {
          conversationId: data.conversationId || data.id,
          hasContent: true
        });
      }
      return true;
    }
    
    if (eventObj.type === 'conversation_updated') {
      // Check for status information
      const hasStatus = !!(data.status);
      const validStatus = hasStatus && typeof data.status === 'string' && ['open', 'closed'].includes((data.status as string).toLowerCase());
      
      if (!hasStatus) {
        LogEngine.warn('❌ Conversation validation failed: Missing status', { 
          conversationId: data.conversationId || data.id,
          availableKeys: Object.keys(data || {})
        });
        return false;
      }
      
      if (!validStatus) {
        LogEngine.warn('❌ Conversation validation failed: Invalid status value', { 
          conversationId: data.conversationId || data.id,
          status: data.status 
        });
        return false;
      }
      
      // Success - log conversation update with redaction enabled (info level for business events)
      LogEngine.info('✅ Conversation updated event validated', { 
        conversationId: data.conversationId || data.id,
        status: data.status,
        eventType: eventObj.type,
        sourcePlatform: eventObj.sourcePlatform,
        timestamp: eventObj.timestamp,
        // Use LogEngine's built-in redaction to safely log event data
        eventData: eventObj.data
      });
      
      return true;
    }
    
    LogEngine.warn('❌ Unsupported event type:', { type: eventObj.type });
    return false;
  }
}
