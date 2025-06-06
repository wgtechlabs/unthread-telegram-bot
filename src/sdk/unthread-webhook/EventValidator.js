import { LogEngine } from '@wgtechlabs/log-engine';

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
    LogEngine.debug('🔍 EventValidator: Starting validation for event:', { event });
    
    // Check each condition individually for detailed logging
    const hasEvent = !!event;
    LogEngine.debug('✅ Has event object:', { hasEvent });
    
    if (!hasEvent) return false;
    
    const hasCorrectType = event.type === 'message_created';
    LogEngine.debug('✅ Type is message_created:', { hasCorrectType, actual: event.type });
    
    const hasCorrectPlatform = event.sourcePlatform === 'dashboard';
    LogEngine.debug('✅ Source is dashboard:', { hasCorrectPlatform, actual: event.sourcePlatform });
    
    const hasData = !!event.data;
    LogEngine.debug('✅ Has data object:', { hasData });
    
    if (!hasData) return false;
    
    // Log the actual data structure for debugging
    LogEngine.debug('🔍 Event data structure:', { data: event.data });
    
    const hasConversationId = !!event.data.conversationId;
    LogEngine.debug('✅ Has conversationId:', { hasConversationId, actual: event.data.conversationId });
    
    // Check for both 'content' and 'text' fields (webhook server sends 'text')
    const hasContent = !!(event.data.content || event.data.text);
    LogEngine.debug('✅ Has content/text:', { hasContent, content: event.data.content, text: event.data.text });
    
    // Additional checks for debugging
    if (!hasConversationId) {
      LogEngine.warn('❌ Missing conversationId - data keys:', { keys: Object.keys(event.data || {}) });
    }
    
    if (!hasContent) {
      LogEngine.warn('❌ Missing content/text - data keys:', { keys: Object.keys(event.data || {}) });
    }
    
    const isValid = hasEvent && hasCorrectType && hasCorrectPlatform && hasData && hasConversationId && hasContent;
    LogEngine.info('🎯 Final validation result:', { isValid });
    
    return isValid;
  }
}
