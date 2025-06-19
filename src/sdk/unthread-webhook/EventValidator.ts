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
    LogEngine.debug('🔍 EventValidator: Starting validation for event:', { event });
    
    // Check each condition individually for detailed logging
    const hasEvent = !!event && typeof event === 'object';
    LogEngine.debug('✅ Has event object:', { hasEvent });
    
    if (!hasEvent) return false;
    
    const eventObj = event as Record<string, unknown>;
    
    const hasCorrectType = ['message_created', 'conversation_updated'].includes(eventObj.type as string);
    LogEngine.debug('✅ Type is supported:', { hasCorrectType, actual: eventObj.type });
    
    const hasCorrectPlatform = eventObj.sourcePlatform === 'dashboard';
    LogEngine.debug('✅ Source is dashboard:', { hasCorrectPlatform, actual: eventObj.sourcePlatform });
    
    const hasData = !!eventObj.data && typeof eventObj.data === 'object';
    LogEngine.debug('✅ Has data object:', { hasData });
    
    if (!hasData) return false;
    
    const data = eventObj.data as Record<string, unknown>;
    
    // Log the actual data structure for debugging
    LogEngine.debug('🔍 Event data structure:', { data: eventObj.data });
    
    const hasConversationId = !!(data.conversationId || data.id);
    LogEngine.debug('✅ Has conversationId:', { hasConversationId, conversationId: data.conversationId, id: data.id });
    
    // Validate based on event type
    if (eventObj.type === 'message_created') {
      // Check for both 'content' and 'text' fields (webhook server sends 'text')
      const hasContent = !!(data.content || data.text);
      LogEngine.debug('✅ Has content/text:', { hasContent, content: data.content, text: data.text });
      
      if (!hasContent) {
        LogEngine.warn('❌ Missing content/text - data keys:', { keys: Object.keys(data || {}) });
      }
      
      const isValid = hasEvent && hasCorrectType && hasCorrectPlatform && hasData && hasConversationId && hasContent;
      LogEngine.info('🎯 Final validation result (message_created):', { isValid });
      return isValid;
    }
    
    if (eventObj.type === 'conversation_updated') {
      // Log the event data structure with redaction by default
      LogEngine.info('🔍 Conversation updated event data:', { 
        dataKeys: Object.keys(data || {}),
        conversationId: data.conversationId || data.id,
        status: data.status,
        statusType: typeof data.status
      });

      // Optionally log the full, unredacted payload if debug flag is set
      if (process.env.DEBUG_FULL_PAYLOADS === 'true' || process.env.LOG_REDACTION_DISABLED === 'true') {
        LogEngine.withoutRedaction().info('🔍 [DEBUG] Full conversation_updated event data (unredacted):', {
          fullEventData: eventObj.data
        });
      }
      
      // Check for status information
      const hasStatus = !!(data.status);
      const validStatus = hasStatus && typeof data.status === 'string' && ['open', 'closed'].includes((data.status as string).toLowerCase());
      LogEngine.debug('✅ Has valid status:', { hasStatus, validStatus, status: data.status });
      
      if (!hasStatus) {
        LogEngine.warn('❌ Missing status - data keys:', { keys: Object.keys(data || {}) });
      }
      
      if (!validStatus) {
        LogEngine.warn('❌ Invalid status value:', { status: data.status });
      }
      
      const isValid = hasEvent && hasCorrectType && hasCorrectPlatform && hasData && hasConversationId && hasStatus && validStatus;
      LogEngine.info('🎯 Final validation result (conversation_updated):', { 
        isValid,
        hasEvent,
        hasCorrectType,
        hasCorrectPlatform, 
        hasData,
        hasConversationId,
        hasStatus,
        validStatus,
        eventType: eventObj.type,
        sourcePlatform: eventObj.sourcePlatform
      });
      return isValid;
    }
    
    LogEngine.warn('❌ Unsupported event type:', { type: eventObj.type });
    return false;
  }
}
