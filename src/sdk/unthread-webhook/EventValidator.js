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
    console.log('🔍 EventValidator: Starting validation for event:', JSON.stringify(event, null, 2));
    
    // Check each condition individually for detailed logging
    const hasEvent = !!event;
    console.log('✅ Has event object:', hasEvent);
    
    if (!hasEvent) return false;
    
    const hasCorrectType = event.type === 'message_created';
    console.log('✅ Type is message_created:', hasCorrectType, 'actual:', event.type);
    
    const hasCorrectPlatform = event.sourcePlatform === 'dashboard';
    console.log('✅ Source is dashboard:', hasCorrectPlatform, 'actual:', event.sourcePlatform);
    
    const hasData = !!event.data;
    console.log('✅ Has data object:', hasData);
    
    if (!hasData) return false;
    
    // Log the actual data structure for debugging
    console.log('🔍 Event data structure:', JSON.stringify(event.data, null, 2));
    
    const hasConversationId = !!event.data.conversationId;
    console.log('✅ Has conversationId:', hasConversationId, 'actual:', event.data.conversationId);
    
    // Check for both 'content' and 'text' fields (webhook server sends 'text')
    const hasContent = !!(event.data.content || event.data.text);
    console.log('✅ Has content/text:', hasContent, 'content:', event.data.content, 'text:', event.data.text);
    
    // Additional checks for debugging
    if (!hasConversationId) {
      console.log('❌ Missing conversationId - data keys:', Object.keys(event.data || {}));
    }
    
    if (!hasContent) {
      console.log('❌ Missing content/text - data keys:', Object.keys(event.data || {}));
    }
    
    const isValid = hasEvent && hasCorrectType && hasCorrectPlatform && hasData && hasConversationId && hasContent;
    console.log('🎯 Final validation result:', isValid);
    
    return isValid;
  }
}
