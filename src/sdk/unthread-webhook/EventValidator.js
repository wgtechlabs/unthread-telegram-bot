import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * EventValidator - Simple validation for Unthread webhook events
 * 
 * Validates message_created and conversation_updated events from dashboard.
 */

export class EventValidator {
  /**
   * Validate webhook event structure for supported event types
   * @param {Object} event - The webhook event to validate
   * @returns {boolean} - True if valid
   */
  static validate(event) {
    LogEngine.debug('🔍 EventValidator: Starting validation for event:', { event });
    
    // Check each condition individually for detailed logging
    const hasEvent = !!event;
    LogEngine.debug('✅ Has event object:', { hasEvent });
    
    if (!hasEvent) return false;
    
    const hasCorrectType = ['message_created', 'conversation_updated'].includes(event.type);
    LogEngine.debug('✅ Type is supported:', { hasCorrectType, actual: event.type });
    
    const hasCorrectPlatform = event.sourcePlatform === 'dashboard';
    LogEngine.debug('✅ Source is dashboard:', { hasCorrectPlatform, actual: event.sourcePlatform });
    
    const hasData = !!event.data;
    LogEngine.debug('✅ Has data object:', { hasData });
    
    if (!hasData) return false;
    
    // Log the actual data structure for debugging
    LogEngine.debug('🔍 Event data structure:', { data: event.data });
    
    const hasConversationId = !!(event.data.conversationId || event.data.id);
    LogEngine.debug('✅ Has conversationId:', { hasConversationId, conversationId: event.data.conversationId, id: event.data.id });
    
    // Validate based on event type
    if (event.type === 'message_created') {
      // Check for both 'content' and 'text' fields (webhook server sends 'text')
      const hasContent = !!(event.data.content || event.data.text);
      LogEngine.debug('✅ Has content/text:', { hasContent, content: event.data.content, text: event.data.text });
      
      if (!hasContent) {
        LogEngine.warn('❌ Missing content/text - data keys:', { keys: Object.keys(event.data || {}) });
      }
      
      const isValid = hasEvent && hasCorrectType && hasCorrectPlatform && hasData && hasConversationId && hasContent;
      LogEngine.info('🎯 Final validation result (message_created):', { isValid });
      return isValid;
    }
    
    if (event.type === 'conversation_updated') {
      // Log the complete event data structure for debugging
      LogEngine.info('🔍 Conversation updated event data:', { 
        fullEventData: JSON.stringify(event.data, null, 2),
        dataKeys: Object.keys(event.data || {}),
        conversationId: event.data.conversationId || event.data.id,
        status: event.data.status,
        statusType: typeof event.data.status
      });
      
      // Check for status information
      const hasStatus = !!(event.data.status);
      const validStatus = hasStatus && typeof event.data.status === 'string' && ['open', 'closed'].includes(event.data.status.toLowerCase());
      LogEngine.debug('✅ Has valid status:', { hasStatus, validStatus, status: event.data.status });
      
      if (!hasStatus) {
        LogEngine.warn('❌ Missing status - data keys:', { keys: Object.keys(event.data || {}) });
      }
      
      if (!validStatus) {
        LogEngine.warn('❌ Invalid status value:', { status: event.data.status });
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
        eventType: event.type,
        sourcePlatform: event.sourcePlatform
      });
      return isValid;
    }
    
    LogEngine.warn('❌ Unsupported event type:', { type: event.type });
    return false;
  }
}
