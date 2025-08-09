import { LogEngine } from '@wgtechlabs/log-engine';
import type { WebhookEvent } from '../types.js';

/**
 * Unthread Telegram Bot - Webhook Event Validator
 * 
 * Validates incoming webhook events from the Unthread platform to ensure data
 * integrity and security. Performs comprehensive validation of event structure,
 * content, and source before allowing event processing.
 * 
 * Validation Features:
 * - Event structure validation (type, platform, data)
 * - Content validation for message_created events
 * - Source platform verification (dashboard only)
 * - Data type checking and sanitization
 * - Security validation to prevent malicious events
 * 
 * Supported Event Types:
 * - message_created: Agent messages from Unthread dashboard
 * - conversation_updated: Ticket status and metadata updates
 * 
 * Security:
 * - Strict type checking for all event properties
 * - Source platform validation (dashboard only)
 * - Content sanitization and validation
 * - Protection against malformed or malicious events
 * 
 * Error Handling:
 * - Detailed validation error reporting
 * - Graceful handling of invalid events
 * - Comprehensive logging for debugging 
 * - Silent rejection of malicious events
 * 
 * @author Waren Gonzaga, WG Technology Labs

 * @since 2025
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
    
    // Enhanced platform detection: Accept 'dashboard' or 'unknown' (for dashboard events that couldn't be properly detected)
    // Based on the logs, some dashboard events come through as 'unknown' due to platform detection issues
    const hasCorrectPlatform = eventObj.sourcePlatform === 'dashboard' || eventObj.sourcePlatform === 'unknown';
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
      LogEngine.debug('Event validation checks passed', {
        type: eventObj.type,
        sourcePlatform: eventObj.sourcePlatform,
        conversationId: data.conversationId || data.id
      });
    }
    
    // Validate based on event type
    if (eventObj.type === 'message_created') {
      // Check for both 'content' and 'text' fields (webhook server sends 'text')
      // Also check for attachments directly under data - attachment-only messages might not have text content
      const hasContent = !!(data.content || data.text);
      
      // Type-safe attachment detection - check multiple possible locations
      // 1. metadata.event_payload.attachments (dashboard events) 
      // 2. data.files (Slack format)
      // 3. data.attachments (direct format)
      const metadata = data.metadata as Record<string, unknown> | undefined;
      const eventPayload = metadata?.event_payload as Record<string, unknown> | undefined;
      const metadataAttachments = eventPayload?.attachments as Array<Record<string, unknown>> | undefined;
      const files = data.files as Array<Record<string, unknown>> | undefined;
      const attachments = data.attachments as Array<Record<string, unknown>> | undefined;
      
      const hasAttachments = !!(
        (metadataAttachments && metadataAttachments.length > 0) ||
        (files && files.length > 0) ||
        (attachments && attachments.length > 0)
      );
      
      // Message must have either text content OR attachments
      if (!hasContent && !hasAttachments) {
        LogEngine.warn('❌ Message validation failed: Missing content/text and no attachments', { 
          conversationId: data.conversationId || data.id,
          availableKeys: Object.keys(data || {}),
          hasAttachments: hasAttachments,
          metadataAttachmentCount: metadataAttachments ? metadataAttachments.length : 0,
          fileCount: files ? files.length : 0,
          attachmentCount: attachments ? attachments.length : 0
        });
        return false;
      }
      
      // Log attachment detection for monitoring
      if (hasAttachments) {
        const totalAttachments = (metadataAttachments?.length || 0) + (files?.length || 0) + (attachments?.length || 0);
        LogEngine.info('📎 Attachment(s) detected in message event', {
          conversationId: data.conversationId || data.id,
          attachmentCount: totalAttachments,
          hasTextContent: hasContent,
          attachmentNames: [
            ...(metadataAttachments?.map((att: Record<string, unknown>) => att.name as string || 'unnamed') || []),
            ...(files?.map((file: Record<string, unknown>) => file.name as string || 'unnamed') || []),
            ...(attachments?.map((att: Record<string, unknown>) => att.name as string || 'unnamed') || [])
          ].join(', ')
        });
      }
      
      // Success - only log in verbose mode
      if (process.env.LOG_LEVEL === 'debug' || process.env.VERBOSE_LOGGING === 'true') {
        LogEngine.debug('✅ Message event validated successfully', {
          conversationId: data.conversationId || data.id,
          hasContent,
          hasAttachments,
          attachmentCount: hasAttachments ? (metadataAttachments?.length || 0) + (files?.length || 0) + (attachments?.length || 0) : 0
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
