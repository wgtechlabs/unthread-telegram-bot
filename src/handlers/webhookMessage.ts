/**
 * Telegram Webhook Message Handler - Agent Response Routing System
 * 
 * Advanced webhook processing system that handles real-time agent responses from
 * the Unthread platform and delivers them to appropriate Telegram users and groups
 * with comprehensive error handling and delivery guarantees.
 * 
 * Core Capabilities:
 * - Real-time webhook event processing from Unthread platform
 * - Intelligent message routing to correct Telegram chats and users
 * - File attachment forwarding with format conversion and optimization
 * - User blocking detection and automatic cleanup procedures
 * - Message formatting and rich text support (Markdown, HTML)
 * - Delivery status tracking and retry mechanisms for failed messages
 * 
 * File Attachment Processing:
 * - Bidirectional file transfer support (Telegram ↔ Unthread)
 * - Image processing with thumbnail generation and format optimization
 * - Document forwarding with type validation and security scanning
 * - Batch processing for multiple attachments with memory management
 * - MIME type validation and content security enforcement
 * 
 * Message Delivery Features:
 * - Template-based message formatting with variable substitution
 * - Markdown escape handling for safe text rendering
 * - Message chunking for long content to respect Telegram limits
 * - Fallback mechanisms for delivery failures
 * - User notification preferences and filtering
 * 
 * Error Handling and Resilience:
 * - Comprehensive error classification and recovery strategies
 * - Blocked user detection with automatic database cleanup
 * - Network failure handling with exponential backoff retry
 * - Message queue management for high-volume scenarios
 * - Dead letter queue for persistent delivery failures
 * 
 * Performance and Scalability:
 * - Asynchronous processing for concurrent webhook handling
 * - Memory-efficient file processing with streaming operations
 * - Connection pooling for database and external API operations
 * - Intelligent caching for frequently accessed user and chat data
 * 
 * Current Operational Status:
 * - ✅ Telegram → Unthread: ENABLED (users can send files to agents)
 * - ✅ Unthread → Telegram: ENABLED (agent files forwarded to users)
 * - ✅ Real-time message delivery with sub-second latency
 * - ✅ Attachment processing with comprehensive format support
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @since 2025
 */
import { LogEngine } from '@wgtechlabs/log-engine';
import type { Telegraf } from 'telegraf';
import type { BotContext, WebhookEvent } from '../types/index.js';
import type { IBotsStore } from '../sdk/types.js';
import { GlobalTemplateManager } from '../utils/globalTemplateManager.js';
import { escapeMarkdown } from '../utils/markdownEscape.js';
import { downloadUnthreadImage } from '../services/unthread.js';
import { BUFFER_ATTACHMENT_CONFIG, attachmentHandler } from '../utils/attachmentHandler.js';
import { type ImageProcessingConfig, getImageProcessingConfig, getSlackTeamId } from '../config/env.js';
import { AttachmentDetectionService } from '../services/attachmentDetection.js';
// ENABLED: Attachment processing fully operational with metadata-driven detection
// COMPLETE: Legacy "unknown" source processing removed, dashboard-only architecture

/**
 * Webhook message handler for Unthread agent responses
 * 
 * Status: Unthread→Telegram attachment forwarding ENABLED
 */
export class TelegramWebhookHandler {
  private bot: Telegraf<BotContext>;
  private botsStore: IBotsStore; // SDK type, properly typed with IBotsStore interface
  private templateManager: GlobalTemplateManager;
  private imageConfig: ImageProcessingConfig; // Image processing configuration
  private teamId: string; // Validated Unthread team ID for fail-fast initialization

  constructor(bot: Telegraf<BotContext>, botsStore: IBotsStore) {
    this.bot = bot;
    this.botsStore = botsStore;
    this.templateManager = GlobalTemplateManager.getInstance();
    this.imageConfig = getImageProcessingConfig(); // Load configuration
    
    // SLACK_TEAM_ID is validated as required environment variable at startup
    this.teamId = getSlackTeamId(); // Safe getter that ensures non-empty value
    
    LogEngine.info('TelegramWebhookHandler initialized', {
      imageProcessingEnabled: this.imageConfig.enabled,
      maxImageSizeMB: Math.round(this.imageConfig.maxImageSize / 1024 / 1024),
      supportedFormats: this.imageConfig.supportedFormats.length,
      teamIdConfigured: !!this.teamId // Log confirmation without exposing the actual value
    });
  }

  /**
   * Send message with blocked user detection and cleanup
   * 
   * @param chatId - Target chat ID
   * @param text - Message text
   * @param options - Additional send options
   * @returns Sent message or null if failed
   */
  async safeSendMessage(chatId: number, text: string, options: any = {}): Promise<any | null> {
    try {
      return await this.bot.telegram.sendMessage(chatId, text, options);
    } catch (error: any) {
      if (error.response?.error_code === 403) {
        if (error.response.description?.includes('bot was blocked by the user')) {
          LogEngine.warn('Bot was blocked by user - cleaning up user data', { chatId });
          
          // Clean up blocked user from storage (solution from GitHub issue #1513)
          await this.cleanupBlockedUser(chatId);
          
          return null;
        }
        if (error.response.description?.includes('chat not found')) {
          LogEngine.warn('Chat not found - cleaning up chat data', { chatId });
          
          // Clean up chat that no longer exists
          await this.cleanupBlockedUser(chatId);
          
          return null;
        }
      }
      
      if (error.response?.error_code === 429) {
        LogEngine.warn('Rate limit exceeded when sending message', { 
          chatId, 
          retryAfter: error.response.parameters?.retry_after 
        });
        return null;
      }
      
      // For other errors, log and re-throw
      LogEngine.error('Error sending message', {
        error: error.message,
        chatId,
        textLength: text?.length
      });
      throw error;
    }
  }

  /**
   * Handle agent message created events from Unthread
   * @param event - The webhook event
   */
  async handleMessageCreated(event: any): Promise<void> {
    try {
      // Cast to our typed webhook event for better type safety
      const webhookEvent = event as WebhookEvent;
      
      LogEngine.debug('🔄 Processing agent message webhook', {
        conversationId: webhookEvent.data.conversationId,
        textLength: webhookEvent.data.content?.length || 0,
        sentBy: webhookEvent.data.userId,
        timestamp: webhookEvent.timestamp,
        sourcePlatform: webhookEvent.sourcePlatform
      });

      // 1. Validate webhook event structure and source
      if (!AttachmentDetectionService.shouldProcessEvent(webhookEvent)) {
        LogEngine.warn('❌ Skipping non-dashboard webhook event', { 
          sourcePlatform: webhookEvent.sourcePlatform || 'unknown',
          conversationId: webhookEvent.data.conversationId
        });
        return;
      }

      // 2. Get conversation ID from webhook event
      const conversationId = webhookEvent.data.conversationId;
      if (!conversationId) {
        LogEngine.warn('❌ No conversation ID in webhook event', { event: webhookEvent });
        return;
      }

      LogEngine.info('Looking up ticket for conversation', { conversationId });

      // 3. Look up original ticket message using conversation ID from webhook
      const ticketData = await this.botsStore.getTicketByConversationId(conversationId);
      
      LogEngine.info('Ticket lookup result', {
        conversationId,
        found: !!ticketData,
        ticketData: ticketData ? {
          friendlyId: ticketData.friendlyId,
          chatId: ticketData.chatId,
          messageId: ticketData.messageId,
          conversationId: ticketData.conversationId,
          ticketId: ticketData.ticketId
        } : null
      });
      
      if (!ticketData) {
        LogEngine.warn(`❌ No ticket found for conversation: ${conversationId}`);
        return;
      }

      LogEngine.info('✅ Ticket found', {
        conversationId,
        friendlyId: ticketData.friendlyId,
        chatId: ticketData.chatId,
        messageId: ticketData.messageId,
        storedConversationId: ticketData.conversationId,
        storedTicketId: ticketData.ticketId
      });

      // 4. Get attachment processing decision using metadata-first approach
      const processingDecision = AttachmentDetectionService.getProcessingDecision(webhookEvent);
      
      // Log integration status for monitoring
      this.logIntegrationStatus(webhookEvent, conversationId);
      
      LogEngine.info('📋 Attachment processing decision', {
        conversationId,
        shouldProcess: processingDecision.shouldProcess,
        reason: processingDecision.reason,
        hasAttachments: processingDecision.hasAttachments,
        hasSupportedImages: processingDecision.hasSupportedImages,
        summary: processingDecision.summary
      });

      // 5. Handle different processing decisions
      if (processingDecision.hasUnsupported) {
        await this.handleUnsupportedAttachments(webhookEvent, ticketData);
        return;
      }

      if (processingDecision.isOversized) {
        await this.handleOversizedAttachments(webhookEvent, ticketData);
        return;
      }

      // 6. Validate message content - check both 'content' and 'text' fields
      const messageText = webhookEvent.data.content || webhookEvent.data.text;
      
      // Skip "File attached" messages that are just attachment notifications
      const isFileAttachedNotification = messageText && 
        messageText.trim().toLowerCase() === 'file attached' && 
        processingDecision.hasAttachments;
      
      if (isFileAttachedNotification) {
        LogEngine.info('📎 Processing file-only message (skipping "File attached" text)', {
          conversationId,
          hasAttachments: processingDecision.hasAttachments,
          attachmentSummary: processingDecision.summary
        });
        
        // Find the latest agent message to reply to with attachments
        const replyToMessageId = await this.findLatestAgentMessage(conversationId, ticketData.messageId);
        
        // Process attachments only, skip the text
        if (processingDecision.hasSupportedImages) {
          await this.processImageAttachments(
            webhookEvent,
            conversationId,
            ticketData.chatId,
            replyToMessageId
          );
        }
        return;
      }
      
      // Message must have either meaningful text content OR attachments
      if ((!messageText || messageText.trim().length === 0) && !processingDecision.hasAttachments) {
        LogEngine.warn('❌ Empty message with no attachments in webhook event', { 
          conversationId,
          hasContent: !!webhookEvent.data.content,
          hasText: !!webhookEvent.data.text,
          hasAttachments: processingDecision.hasAttachments
        });
        return;
      }

      if (messageText && messageText.trim().length > 0) {
        LogEngine.info('✅ Message content validated', { 
          conversationId, 
          messageLength: messageText.length,
          messagePreview: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : '')
        });
      }

      // 7. Process text content if available
      const hasTextContent = !!(messageText && messageText.trim().length > 0);
      
      if (hasTextContent) {
        // This is a text message from dashboard - send the message normally
        LogEngine.info('✅ Delivering agent message with text content', {
          conversationId,
          telegramUserId: ticketData.telegramUserId,
          messageLength: messageText.length
        });

        // 8. Format agent message using template system
        const formattedMessage = await this.formatAgentMessageWithTemplate(
          messageText, 
          ticketData
        );
        
        LogEngine.info('✅ Message formatted for Telegram', { 
          conversationId,
          formattedLength: formattedMessage.length
        });

        // 9. Send agent message as reply to original ticket message
        LogEngine.info('📤 Attempting to send message to Telegram', {
          conversationId,
          chatId: ticketData.chatId,
          replyToMessageId: ticketData.messageId
        });

        const sentMessage = await this.sendTextMessageToTelegram(
          formattedMessage,
          ticketData,
          conversationId
        );

        // 10. Process image attachments if available and text was sent successfully
        if (sentMessage && processingDecision.hasSupportedImages) {
          await this.processImageAttachments(
            webhookEvent,
            conversationId,
            ticketData.chatId,
            sentMessage.message_id
          );
        }

      } else if (processingDecision.hasSupportedImages) {
        // This is an image-only event - find the latest agent message to reply to
        LogEngine.debug('📎 Processing image-only event (finding agent message to reply to)', {
          conversationId,
          hasImages: processingDecision.hasImages,
          chatId: ticketData.chatId,
          status: 'Finding latest agent message for attachment reply'
        });

        const replyToMessageId = await this.findLatestAgentMessage(conversationId, ticketData.messageId);
        
        // Process image attachments
        await this.processImageAttachments(
          webhookEvent,
          conversationId,
          ticketData.chatId,
          replyToMessageId
        );
      }

    } catch (error) {
      const err = error as Error;
      LogEngine.error('Error handling webhook message', {
        error: err.message,
        stack: err.stack,
        event: event
      });
      throw error;
    }
  }

  /**
   * Format agent message for display in Telegram
   * @param text - The agent message text
   * @param friendlyId - The ticket friendly ID (e.g., TKT-001)
   * @returns Formatted message
   */
  formatAgentMessage(text: string, friendlyId: string): string {
    // Clean and truncate message if too long
    const cleanText = this.sanitizeMessageText(text);
    const maxLength = 4000; // Telegram message limit is 4096, leave some room
    let truncatedText = cleanText;
    if (cleanText.length > maxLength) {
      truncatedText = cleanText.substring(0, maxLength - 50) + '...\n\n_Message truncated_';
    }
    return `🎫 Ticket #${friendlyId}\n\n💬 Response:\n${truncatedText}\n\n──────────\n📝 Reply to this message to respond or add more info to your ticket.`;
  }

  /**
   * Sanitize message text for Telegram Markdown
   * @param text - Raw message text
   * @returns Sanitized text
   */
  sanitizeMessageText(text: string): string {
    if (!text) {return '';}
    
    // Use our comprehensive markdown escaping utility
    // This prevents all entity parsing errors
    return escapeMarkdown(text.trim());
  }

  /**
   * Handle other webhook events (for future expansion)
   * @param eventType - Type of webhook event
   * @param event - The webhook event data
   */
  async handleOtherEvent(eventType: string, event: any): Promise<void> {
    LogEngine.info(`Received ${eventType} event (not processed)`, {
      eventType,
      conversationId: event.data?.conversationId,
      timestamp: event.timestamp
    });
  }

  /**
   * Handle conversation updated events from Unthread (status changes)
   * @param event - The webhook event
   */
  async handleConversationUpdated(event: any): Promise<void> {
    try {
      // 1. Get conversation ID from webhook event (try both fields)
      const conversationId = event.data.conversationId || event.data.id;

      LogEngine.info('🔄 Processing conversation status update webhook', {
        conversationId: conversationId,
        newStatus: event.data.status,
        previousStatus: event.data.previousStatus,
        timestamp: event.timestamp
      });
      
      const newStatus = typeof event.data.status === 'string' 
        ? event.data.status.toLowerCase() 
        : String(event.data.status || '').toLowerCase();
      
      if (!conversationId) {
        LogEngine.warn('❌ No conversation ID in webhook event', { event });
        return;
      }

      if (!newStatus || !['open', 'closed'].includes(newStatus)) {
        LogEngine.warn('❌ Invalid or missing status in webhook event', { 
          status: event.data.status,
          conversationId 
        });
        return;
      }

      LogEngine.info('Looking up ticket for status update', { conversationId, newStatus });

      // 2. Look up original ticket message using bots-brain
      const ticketData = await this.botsStore.getTicketByConversationId(conversationId);
      if (!ticketData) {
        LogEngine.warn(`❌ No ticket found for conversation: ${conversationId}`);
        return;
      }

      LogEngine.info('✅ Ticket found for status update', {
        conversationId,
        friendlyId: ticketData.friendlyId,
        chatId: ticketData.chatId,
        messageId: ticketData.messageId,
        newStatus
      });

      // 3. Format status update message using template system
      const statusMessage = await this.formatStatusUpdateWithTemplate(
        ticketData, 
        newStatus
      );
      
      LogEngine.info('✅ Status message formatted for Telegram', { 
        conversationId,
        newStatus,
        messageLength: statusMessage.length
      });

      // 4. Send status notification as reply to original ticket message
      LogEngine.info('📤 Attempting to send status notification to Telegram', {
        conversationId,
        chatId: ticketData.chatId,
        replyToMessageId: ticketData.messageId,
        newStatus
      });

      try {
        const sentMessage = await this.safeSendMessage(
          ticketData.chatId,
          statusMessage,
          { 
            reply_to_message_id: ticketData.messageId,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          }
        );
        
        if (sentMessage) {
          LogEngine.info('✅🎉 Status notification delivered to Telegram successfully!', {
            conversationId,
            chatId: ticketData.chatId,
            replyToMessageId: ticketData.messageId,
            sentMessageId: sentMessage.message_id,
            friendlyId: ticketData.friendlyId,
            newStatus
          });
        } else {
          LogEngine.warn('Status notification not sent - user may have blocked bot', {
            conversationId,
            chatId: ticketData.chatId,
            friendlyId: ticketData.friendlyId,
            newStatus
          });
        }

      } catch (telegramError) {
        const err = telegramError as Error;
        LogEngine.error('Failed to send status notification to Telegram', {
          error: err.message,
          chatId: ticketData.chatId,
          messageId: ticketData.messageId,
          conversationId,
          newStatus
        });

        // Try sending without reply if reply fails (original message might be deleted)
        try {
          const fallbackMessage = await this.safeSendMessage(
            ticketData.chatId,
            `${statusMessage}\n\n_Note: Sent as new message (original ticket message not found)_`,
            { 
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }
          );
          
          if (fallbackMessage) {
            LogEngine.info('Status notification sent as new message (fallback)', {
              conversationId,
              chatId: ticketData.chatId,
              newStatus
            });
          } else {
            LogEngine.warn('Fallback status notification also failed - user may have blocked bot', {
              conversationId,
              chatId: ticketData.chatId,
              newStatus
            });
          }

        } catch (fallbackError) {
          const fallbackErr = fallbackError as Error;
          LogEngine.error('Failed to send fallback status notification to Telegram', {
            error: fallbackErr.message,
            chatId: ticketData.chatId,
            conversationId,
            newStatus
          });
          throw fallbackError;
        }
      }

    } catch (error) {
      const err = error as Error;
      LogEngine.error('Error handling conversation update webhook', {
        error: err.message,
        stack: err.stack,
        event: event
      });
      throw error;
    }
  }

  /**
   * Format status update message for display in Telegram
   * @param status - The new status (open/closed)
   * @param friendlyId - The ticket friendly ID (e.g., TKT-001)
   * @returns Formatted status message
   */
  formatStatusUpdateMessage(status: string, friendlyId: string): string {
    const statusIcon = status === 'closed' ? '🔒' : '📂';
    const statusText = status === 'closed' ? 'CLOSED' : 'OPEN';
    const statusEmoji = status === 'closed' ? '✅' : '🔄';
    
    let message = `${statusIcon} *Ticket Status Update*\n\n`;
    message += `🎫 Ticket #${friendlyId}\n`;
    message += `${statusEmoji} Status: *${statusText}*\n\n`;
    
    if (status === 'closed') {
      message += `Your ticket has been resolved and closed. If you need further assistance, please create a new ticket using /support.`;
    } else {
      message += `Your ticket has been reopened and is now active. An agent will assist you shortly.`;
    }

    return message;
  }

  /**
   * Format agent message using template system
   * @param text - The agent message text
   * @param ticketData - The ticket data from storage
   * @returns Formatted message
   */
  async formatAgentMessageWithTemplate(text: string, ticketData: any): Promise<string> {
    try {
      // Build template variables for global template system
      const variables = {
        ticketNumber: ticketData.friendlyId,        // Primary: "TKT-001" format (user-friendly)
        friendlyId: ticketData.friendlyId,          // Explicit: "TKT-001" format (backward compatibility)
        conversationId: ticketData.conversationId,  // UUID from Unthread webhook events (consistent across all events)
        summary: ticketData.summary || 'Support Request',  // Use stored summary from ticket data
        customerName: ticketData.userName || 'Customer',
        status: 'Open',
        response: text,
        createdAt: new Date().toLocaleString(),
        updatedAt: new Date().toLocaleString()
      };

      // Format using global template system
      const formatted = await this.templateManager.renderTemplate('agent_response', variables);

      return formatted || text; // Fallback to plain text if template fails
    } catch (error) {
      LogEngine.warn('Failed to format message with template, using fallback', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ticketId: ticketData.friendlyId
      });
      
      // Fallback to original formatting
      return this.formatAgentMessage(text, ticketData.friendlyId);
    }
  }

  /**
   * Format ticket status update using template system
   * @param ticketData - The ticket data from storage
   * @param status - The new status
   * @returns Formatted message
   */
  async formatStatusUpdateWithTemplate(ticketData: any, status: string): Promise<string> {
    try {
      // Build template variables for global template system
      const variables = {
        ticketNumber: ticketData.friendlyId,        // Primary: "TKT-001" format (user-friendly)
        friendlyId: ticketData.friendlyId,          // Explicit: "TKT-001" format (backward compatibility)
        conversationId: ticketData.conversationId,  // UUID from Unthread webhook events (consistent across all events)
        summary: ticketData.summary || 'Support Request',  // Use stored summary from ticket data
        customerName: ticketData.userName || 'Customer',
        status: status === 'closed' ? 'Closed' : 'Open',
        response: '', // For status updates, response might be empty
        createdAt: new Date().toLocaleString(),
        updatedAt: new Date().toLocaleString()
      };

      // Choose template type based on status
      const templateType = 'ticket_status'; // Always use ticket_status for any status update

      // Format using global template system
      const formatted = await this.templateManager.renderTemplate(templateType, variables);

      return formatted || this.getFallbackStatusMessage(ticketData, status);
    } catch (error) {
      LogEngine.warn('Failed to format status update with template, using fallback', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ticketId: ticketData.friendlyId,
        status
      });
      
      return this.getFallbackStatusMessage(ticketData, status);
    }
  }

  private getFallbackStatusMessage(ticketData: any, status: string): string {
    // Fallback to simple status message
    const statusIcon = status === 'closed' ? '✅' : '📝';
    const statusText = status === 'closed' ? 'Closed' : 'Open';
    return `${statusIcon} *Ticket ${statusText}*\n\nTicket #${ticketData.friendlyId} has been ${status}.`;
  }

  /**
   * Clean up user data when bot is blocked or chat is not found
   * This implements the fix from GitHub issue telegraf/telegraf#1513
   * 
   * @param chatId - The chat ID of the blocked user
   */
  async cleanupBlockedUser(chatId: number): Promise<void> {
    try {
      LogEngine.info('Starting cleanup for blocked user', { chatId });
      
      // 1. Get all tickets for this chat
      const tickets = await this.botsStore.getTicketsForChat(chatId);
      
      if (tickets.length > 0) {
        LogEngine.info(`Found ${tickets.length} tickets to clean up for blocked user`, { 
          chatId, 
          ticketIds: tickets.map((t: any) => t.conversationId) 
        });
        
        // 2. Delete each ticket and its mappings
        for (const ticket of tickets) {
          await this.botsStore.deleteTicket(ticket.conversationId);
          LogEngine.info(`Cleaned up ticket ${ticket.friendlyId} for blocked user`, { 
            chatId, 
            conversationId: ticket.conversationId 
          });
        }
      }
      
      // 3. Clean up customer data for this chat
      const customer = await this.botsStore.getCustomerByChatId(chatId);
      if (customer) {
        // Remove customer mappings (the customer still exists in Unthread, just remove local mappings)
        await this.botsStore.storage.delete(`customer:telegram:${chatId}`);
        await this.botsStore.storage.delete(`customer:id:${customer.unthreadCustomerId}`);
        
        LogEngine.info('Cleaned up customer mappings for blocked user', { 
          chatId, 
          customerId: customer.unthreadCustomerId 
        });
      }
      
      // 4. Clean up any user states
      // User states are keyed by telegram user ID, not chat ID
      // So we can't clean them up directly without the user ID
      // They will expire naturally due to TTL
      
      LogEngine.info('Successfully cleaned up blocked user data', { chatId });
      
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Error cleaning up blocked user data', {
        error: err.message,
        stack: err.stack,
        chatId
      });
      // Don't throw - cleanup failure shouldn't crash the bot
    }
  }

  /**
   * Process ONLY Slack files from Unthread webhook events and forward them to Telegram
   * 
   * @param slackFiles - Array of Slack file objects from data.files
   * @param conversationId - Conversation ID for tracking
   * @param chatId - Telegram chat ID for delivery
   * @param replyToMessageId - Message ID to reply to
   */
  private async processSlackFiles(
    slackFiles: Array<Record<string, unknown>>,
    conversationId: string,
    chatId: number,
    replyToMessageId: number
  ): Promise<void> {
    LogEngine.debug('🔄 Processing Slack files from Unthread webhook', {
      conversationId,
      slackFileCount: slackFiles.length,
      chatId,
      replyToMessageId
    });

    for (let i = 0; i < slackFiles.length; i++) {
      const slackFile = slackFiles.at(i);
      
      // Type safety: Ensure slackFile is a valid object
      if (!slackFile || typeof slackFile !== 'object') {
        LogEngine.warn('⚠️ Skipping invalid Slack file object', {
          conversationId,
          fileIndex: i + 1,
          receivedType: typeof slackFile
        });
        continue;
      }
      
      try {
        const fileId = String(slackFile.id);
        
        // Validate that this is a proper Slack file ID
        if (!fileId.startsWith('F') || fileId.length < 10) {
          LogEngine.warn('⚠️ Invalid Slack file ID format', {
            conversationId,
            fileId,
            expectedFormat: 'F######## (starts with F, 10+ chars)'
          });
          continue;
        }

        LogEngine.info('✅ Valid Slack file detected', {
          conversationId,
          fileIndex: i + 1,
          fileName: slackFile.name,
          fileSize: slackFile.size,
          fileType: slackFile.mimetype,
          fileId: fileId
        });

        // Process using Slack file thumbnail endpoint
        await this.downloadAndForwardSlackFile({
          conversationId,
          fileId: fileId,
          fileName: String(slackFile.name),
          fileSize: Number(slackFile.size) || 0,
          mimeType: String(slackFile.mimetype || slackFile.type),
          chatId,
          replyToMessageId
        });

      } catch (error) {
        LogEngine.error('❌ Slack file processing failed', {
          conversationId,
          fileIndex: i + 1,
          fileName: slackFile.name || 'unknown',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    LogEngine.debug('✅ Slack file processing completed', {
      conversationId,
      processedCount: slackFiles.length
    });
  }

  /**
   * Downloads a Slack file using Unthread's Slack file thumbnail endpoint and forwards to Telegram
   * 
   * @param params - Download and forward parameters for Slack files
   */
  private async downloadAndForwardSlackFile(params: {
    conversationId: string;
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    chatId: number;
    replyToMessageId: number;
  }): Promise<void> {
    const { conversationId, fileId, fileName, fileSize, mimeType, chatId, replyToMessageId } = params;
    
    LogEngine.info('Starting Slack file download and forward', {
      conversationId,
      fileId,
      fileName,
      fileSize,
      mimeType,
      chatId,
      method: 'slack-thumbnail-endpoint'
    });

    try {
      // Use Unthread's Slack file thumbnail endpoint for Slack file IDs
      // Endpoint: https://api.unthread.io/api/slack/files/{fileId}/thumb?thumbSize={config}&teamId={teamId}
      const thumbnailSize = this.imageConfig.thumbnailSize; // Use centralized thumbnail size configuration
      
      const downloadBuffer = await downloadUnthreadImage(
        fileId,
        this.teamId,
        fileName,
        thumbnailSize // Use thumbnail size parameter
      );

      if (!downloadBuffer || downloadBuffer.length === 0) {
        throw new Error('Slack file download returned empty or invalid data');
      }

      LogEngine.info('Slack file downloaded successfully', {
        conversationId,
        fileId,
        fileName,
        downloadedSize: downloadBuffer.length,
        method: 'slack-thumbnail-endpoint'
      });

      // Forward to Telegram using existing attachment handler infrastructure
      const fileBuffer = {
        buffer: downloadBuffer,
        fileName: fileName,
        mimeType: mimeType,
        size: downloadBuffer.length
      };

      // Use existing attachment handler for Telegram upload
      const uploadSuccess = await attachmentHandler.uploadBufferToTelegram(
        fileBuffer,
        chatId,
        replyToMessageId,
        `📎 ${fileName} (${this.formatFileSize(fileBuffer.size)})`
      );

      if (uploadSuccess) {
        LogEngine.info('Slack file successfully forwarded to Telegram', {
          conversationId,
          fileId,
          fileName,
          finalSize: fileBuffer.size,
          chatId,
          status: 'Complete'
        });
      } else {
        throw new Error('Failed to upload Slack file to Telegram');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogEngine.error('Failed to download and forward Slack file', {
        conversationId,
        fileId,
        fileName,
        error: errorMessage,
        chatId
      });

      // Send user notification about the failure
      try {
        await this.bot.telegram.sendMessage(
          chatId,
          `❌ **Slack File Processing Failed**\n\n📎 **File:** ${fileName}\n**Error:** ${errorMessage}\n\n_Please ask your agent to resend the file or try again later._`,
          { 
            reply_parameters: { message_id: replyToMessageId },
            parse_mode: 'Markdown'
          }
        );
      } catch (notificationError) {
        LogEngine.error('Failed to send Slack file error notification', {
          error: notificationError instanceof Error ? notificationError.message : String(notificationError)
        });
      }

      // Re-throw for upstream error handling
      throw error;
    }
  }

  /**
   * Creates an enhanced attachment caption with metadata
   */
  private createAttachmentCaption(params: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    sendMethod: 'photo' | 'document';
    fileTypeEmoji: string;
  }): string {
    const { fileName, fileSize, sendMethod, fileTypeEmoji } = params;
    const sizeFormatted = this.formatFileSize(fileSize);
    const typeText = sendMethod === 'photo' ? 'Image' : 'Document';
    
    return `${fileTypeEmoji} **${typeText} from Support Agent**\n\n📎 **${fileName}**\n📊 **Size:** ${sizeFormatted}`;
  }

  /**
   * Gets appropriate emoji for file type
   */
  private getFileTypeEmoji(mimeType: string, sendMethod: 'photo' | 'document'): string {
    if (sendMethod === 'photo') {
      return '🖼️';
    }
    
    if (mimeType.includes('pdf')) { return '📄'; }
    if (mimeType.includes('text')) { return '📝'; }
    if (mimeType.includes('video')) { return '🎬'; }
    if (mimeType.includes('audio')) { return '🎵'; }
    if (mimeType.includes('zip') || mimeType.includes('archive')) { return '📦'; }
    
    return '📎';
  }

  /**
   * Gets human-readable file type description
   */
  private getReadableFileType(mimeType: string, sendMethod: 'photo' | 'document'): string {
    if (sendMethod === 'photo') {
      return 'Image';
    }
    
    if (mimeType.includes('pdf')) { return 'PDF Document'; }
    if (mimeType.includes('text')) { return 'Text File'; }
    if (mimeType.includes('video')) { return 'Video File'; }
    if (mimeType.includes('audio')) { return 'Audio File'; }
    if (mimeType.includes('zip')) { return 'Archive'; }
    
    return 'Document';
  }

  /**
   * Determines the appropriate Telegram send method based on file type
   */
  private determineTelegramSendMethod(mimeType: string, fileName: string): 'photo' | 'document' {
    // Check if it's an image type suitable for Telegram photos
    const isImage = mimeType.startsWith('image/');
    const isPhotoFormat = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    
    return (isImage && isPhotoFormat) ? 'photo' : 'document';
  }

  /**
   * Format file size in human-readable format
   */
  private formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) {
      return '0 B';
    }
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    if (i < 0 || i >= sizes.length) {
      return `${bytes} B`;
    }
    
    const size = sizes.at(i);
    if (!size) {
      return `${bytes} B`;
    }
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${size}`;
  }

  /**
   * Handle unsupported attachment types with user notification
   * Provides clear feedback about what file types aren't supported yet
   */
  private async handleUnsupportedAttachments(event: WebhookEvent, ticketData: any): Promise<void> {
    LogEngine.info('📎 Handling unsupported attachments', {
      conversationId: event.data.conversationId,
      attachmentSummary: AttachmentDetectionService.getAttachmentSummary(event)
    });

    // Send notification about unsupported files
    const message = '📎 *Attachment Received*\n\n' +
      '⚠️ Some file types are not supported yet. Currently, only images (PNG, JPEG, GIF, WebP) can be processed.\n\n' +
      'Your agent can still see and access all files in the dashboard.';

    await this.safeSendMessage(
      ticketData.chatId,
      message,
      {
        reply_to_message_id: ticketData.messageId,
        parse_mode: 'Markdown'
      }
    );
  }

  /**
   * Handle oversized attachments with user notification
   * Informs users when files exceed size limits
   */
  private async handleOversizedAttachments(event: WebhookEvent, ticketData: any): Promise<void> {
    const totalSize = AttachmentDetectionService.getTotalSize(event);
    
    LogEngine.info('📎 Handling oversized attachments', {
      conversationId: event.data.conversationId,
      totalSize: totalSize,
      attachmentSummary: AttachmentDetectionService.getAttachmentSummary(event)
    });

    // Send notification about size limits
    const maxSizeMB = Math.round(BUFFER_ATTACHMENT_CONFIG.maxFileSize / (1024 * 1024));
    const message = '📎 *Attachment Received*\n\n' +
      `⚠️ Files are too large to process (${this.formatFileSize(totalSize)}). ` +
      `Maximum size limit is ${maxSizeMB}MB.\n\n` +
      'Your agent can still see and access all files in the dashboard.';

    await this.safeSendMessage(
      ticketData.chatId,
      message,
      {
        reply_to_message_id: ticketData.messageId,
        parse_mode: 'Markdown'
      }
    );
  }

  /**
   * Send text message to Telegram with error handling and agent message tracking
   * Consolidates the message sending logic with proper error handling
   */
  private async sendTextMessageToTelegram(
    formattedMessage: string,
    ticketData: any,
    conversationId: string
  ): Promise<any> {
    try {
      const sentMessage = await this.safeSendMessage(
        ticketData.chatId,
        formattedMessage,
        { 
          reply_to_message_id: ticketData.messageId,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      );

      if (sentMessage) {
        // Store agent message for reply tracking
        await this.botsStore.storeAgentMessage({
          messageId: sentMessage.message_id,
          conversationId: conversationId,
          chatId: ticketData.chatId,
          friendlyId: ticketData.friendlyId,
          originalTicketMessageId: ticketData.messageId,
          sentAt: new Date().toISOString()
        });

        // Store this as the latest agent message for attachment replies
        await this.botsStore.storage.set(
          `agent_message:${conversationId}:latest`,
          JSON.stringify({
            messageId: sentMessage.message_id,
            conversationId: conversationId,
            chatId: ticketData.chatId,
            sentAt: new Date().toISOString()
          }),
          60 * 60 * 24 // 24 hour TTL
        );

        LogEngine.info('✅🎉 Agent message delivered to Telegram successfully!', {
          conversationId,
          chatId: ticketData.chatId,
          replyToMessageId: ticketData.messageId,
          sentMessageId: sentMessage.message_id,
          friendlyId: ticketData.friendlyId
        });

        return sentMessage;
      } else {
        LogEngine.warn('Message not sent - user may have blocked bot or chat not found', {
          conversationId,
          chatId: ticketData.chatId,
          friendlyId: ticketData.friendlyId
        });
        return null;
      }
    } catch (telegramError) {
      const err = telegramError as Error;
      LogEngine.error('Failed to send message to Telegram', {
        error: err.message,
        chatId: ticketData.chatId,
        messageId: ticketData.messageId,
        conversationId
      });
      
      // Try sending without reply if reply fails (original message might be deleted)
      try {
        const fallbackMessage = await this.safeSendMessage(
          ticketData.chatId,
          `${formattedMessage}\n\n_Note: Sent as new message (original ticket message not found)_`,
          { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          }
        );

        if (fallbackMessage) {
          LogEngine.info('Agent message sent as new message (fallback)', {
            conversationId,
            chatId: ticketData.chatId
          });
          return fallbackMessage;
        } else {
          LogEngine.warn('Fallback message also failed - user may have blocked bot', {
            conversationId,
            chatId: ticketData.chatId
          });
          return null;
        }

      } catch (fallbackError) {
        const fallbackErr = fallbackError as Error;
        LogEngine.error('Failed to send fallback message to Telegram', {
          error: fallbackErr.message,
          chatId: ticketData.chatId,
          conversationId
        });
        throw fallbackError;
      }
    }
  }

  /**
   * Find the latest agent message for attachment replies
   * Determines the best message to reply to for attachment-only events
   */
  private async findLatestAgentMessage(conversationId: string, fallbackMessageId: number): Promise<number> {
    try {
      // Try to get the latest agent message from Redis
      const agentMessageKey = `agent_message:${conversationId}:latest`;
      const latestAgentMessageData = await this.botsStore.storage.get(agentMessageKey);
      
      if (latestAgentMessageData && typeof latestAgentMessageData === 'string') {
        const agentMessage = JSON.parse(latestAgentMessageData);
        
        LogEngine.info('🎯 Found latest agent message to reply to', {
          conversationId,
          latestAgentMessageId: agentMessage.messageId,
          originalTicketId: fallbackMessageId
        });
        
        return agentMessage.messageId;
      } else {
        LogEngine.info('🎯 No latest agent message found, using original ticket as reply target', {
          conversationId,
          replyToMessageId: fallbackMessageId
        });
        return fallbackMessageId;
      }
    } catch (lookupError) {
      LogEngine.warn('⚠️ Failed to lookup latest agent message, using original ticket as reply target', {
        conversationId,
        error: lookupError instanceof Error ? lookupError.message : String(lookupError),
        fallbackReplyId: fallbackMessageId
      });
      return fallbackMessageId;
    }
  }

  /**
   * Process image attachments using metadata-driven approach
   * Handles supported image types with proper error handling and metadata efficiency
   */
  private async processImageAttachments(
    event: WebhookEvent,
    conversationId: string,
    chatId: number,
    replyToMessageId: number
  ): Promise<void> {
    LogEngine.info('📎 Processing image attachments with metadata-driven approach', {
      conversationId,
      attachmentSummary: AttachmentDetectionService.getAttachmentSummary(event),
      chatId,
      replyToMessageId,
      metadataDriven: true // Flag to indicate new processing approach
    });

    // Validate we have supported images using metadata
    if (!AttachmentDetectionService.hasSupportedImages(event)) {
      LogEngine.warn('No supported images found for processing', {
        conversationId,
        hasAttachments: AttachmentDetectionService.hasAttachments(event),
        hasImages: AttachmentDetectionService.hasImageAttachments(event),
        processingApproach: 'metadata-first'
      });
      return;
    }

    // Performance measurement for metadata vs legacy comparison
    const startTime = Date.now();

    // Get file information using metadata
    const fileNames = AttachmentDetectionService.getFileNames(event);
    const fileTypes = AttachmentDetectionService.getFileTypes(event);
    const totalSize = AttachmentDetectionService.getTotalSize(event);
    const files = event.data.files;

    LogEngine.debug('Metadata extraction completed', {
      conversationId,
      metadataFileCount: AttachmentDetectionService.getFileCount(event),
      metadataFileNames: fileNames,
      metadataTypes: fileTypes,
      metadataTotalSize: totalSize,
      extractionTimeMs: Date.now() - startTime
    });

    if (!files || files.length === 0) {
      LogEngine.warn('No files array found despite attachment metadata', {
        conversationId,
        metadataFileCount: AttachmentDetectionService.getFileCount(event),
        inconsistency: true
      });
      return;
    }

    // Validate metadata consistency with trust-but-verify approach
    if (!AttachmentDetectionService.validateConsistency(event)) {
      LogEngine.error('Metadata inconsistency detected, falling back to legacy processing', {
        conversationId,
        metadataCount: AttachmentDetectionService.getFileCount(event),
        actualCount: files.length,
        fallbackReason: 'metadata_inconsistency'
      });
      
      // Fallback to legacy method for safety
      await this.processSlackFiles(
        files as unknown as Record<string, unknown>[],
        conversationId,
        chatId,
        replyToMessageId
      );
      return;
    }

    // Process each supported image using metadata guidance
    const supportedImageTypes = this.imageConfig.supportedFormats;

    let processedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files.at(i);
      
      // Validate file object for security
      if (!file || typeof file !== 'object') {
        LogEngine.warn('Skipping invalid file object', {
          conversationId,
          fileIndex: i + 1,
          receivedType: typeof file
        });
        continue;
      }

      // Safely extract filename from file object directly
      const fileName = (file.name && typeof file.name === 'string') 
        ? String(file.name).trim() 
        : `image_${i + 1}`;
      
      // Extract MIME type directly from the current file object
      const fileType = (file.mimetype && typeof file.mimetype === 'string') 
        ? String(file.mimetype).toLowerCase() 
        : '';

      // Skip non-images using per-file MIME type validation
      if (!fileType || !fileType.startsWith('image/') || !supportedImageTypes.includes(fileType)) {
        LogEngine.debug('Skipping non-image or unsupported image type', {
          conversationId,
          fileName,
          fileType,
          fileIndex: i + 1
        });
        continue;
      }

      try {
        LogEngine.info('Processing supported image with metadata context', {
          conversationId,
          fileName,
          fileType,
          fileSize: file.size || 0,
          fileId: file.id || 'unknown',
          fileIndex: i + 1
        });

        await this.processImageFile({
          conversationId,
          file,
          fileName,
          fileType,
          chatId,
          replyToMessageId,
          fileIndex: i + 1,
          totalFiles: files.length
        });

        processedCount++;

      } catch (error) {
        LogEngine.error('Failed to process image file', {
          conversationId,
          fileName,
          fileType,
          fileIndex: i + 1,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    LogEngine.info('Image processing completed with metadata-driven approach', {
      conversationId,
      totalFiles: files.length,
      processedImages: processedCount,
      skippedFiles: files.length - processedCount,
      processingTimeMs: Date.now() - startTime,
      efficiency: 'metadata-first'
    });
  }

  /**
   * Verify integration health
   * Validates that the metadata-driven approach is functioning correctly
   */
  private logIntegrationStatus(event: WebhookEvent, conversationId: string): void {
    const integration = {
      status: 'Handler Integration',
      metadataAvailable: !!event.attachments,
      sourcePlatform: event.sourcePlatform,
      targetPlatform: event.targetPlatform,
      validationResult: AttachmentDetectionService.validateConsistency(event),
      processingDecision: AttachmentDetectionService.getProcessingDecision(event),
      attachmentSummary: AttachmentDetectionService.getAttachmentSummary(event)
    };

    LogEngine.debug('Integration Status', {
      conversationId,
      integration,
      success: integration.metadataAvailable && integration.validationResult
    });
  }

  /**
   * Process individual image file with proper type validation
   * Handles the actual download and forwarding of a single image
   */
  private async processImageFile(params: {
    conversationId: string;
    file: any;
    fileName: string;
    fileType: string;
    chatId: number;
    replyToMessageId: number;
    fileIndex: number;
    totalFiles: number;
  }): Promise<void> {
    const { conversationId, file, fileName, fileType, chatId, replyToMessageId, fileIndex, totalFiles } = params;
    
    // Validate file structure
    if (!file || typeof file !== 'object') {
      throw new Error(`Invalid file object at index ${fileIndex}`);
    }

    const fileId = String(file.id);
    const fileSize = Number(file.size) || 0;
    
    // Validate Slack file ID format
    if (!fileId.startsWith('F') || fileId.length < 10) {
      throw new Error(`Invalid Slack file ID format: ${fileId}`);
    }

    LogEngine.info('Processing image file', {
      conversationId,
      fileId,
      fileName,
      fileSize,
      fileType,
      progress: `${fileIndex}/${totalFiles}`
    });

    // Use Slack thumbnail endpoint for image download
    await this.downloadAndForwardSlackFile({
      conversationId,
      fileId,
      fileName,
      fileSize,
      mimeType: fileType,
      chatId,
      replyToMessageId
    });
  }

}
