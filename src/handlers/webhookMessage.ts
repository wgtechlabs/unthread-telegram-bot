/**
 * Unthread Telegram Bot - Webhook Message Handler
 * 
 * Handles incoming webhook events from the Unthread platform and delivers agent
 * responses back to Telegram users. This module bridges the communication gap
 * between Unthread agents and Telegram conversations.
 * 
 * Core Functionality:
 * - Processes webhook events from Unthread dashboard
 * - Routes agent messages to corresponding Telegram chats
 * - Maintains conversation threading and context
 * - Handles delivery errors and user blocking scenarios
 * 
 * Features:
 * - Safe message delivery with comprehensive error handling
 * - Automatic user blocking detection and cleanup
 * - Message formatting and threading preservation
 * - Integration with Bots Brain storage for conversation context
 * - Real-time agent response delivery to Telegram users
 * Error Handling:
 * - Graceful handling of blocked users and deleted chats
 * - Rate limiting and API error recovery
 * - Comprehensive logging for debugging and monitoring
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */
import { LogEngine } from '@wgtechlabs/log-engine';
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../types/index.js';
import type { IBotsStore } from '../sdk/types.js';
import { GlobalTemplateManager } from '../utils/globalTemplateManager.js';
import { escapeMarkdown } from '../utils/markdownEscape.js';
import { 
  AttachmentErrorHandler, 
  AttachmentProcessingError,
  AttachmentErrorType
} from '../utils/errorHandler.js';
import { recordSuccessfulAttachment, recordFailedAttachment } from '../utils/attachmentMetrics.js';
import { downloadAttachmentFromUnthread } from '../services/unthread.js';

/**
 * Handles incoming webhook messages from Unthread agents
 * Sends agent responses as replies to original ticket messages in Telegram
 */
export class TelegramWebhookHandler {
  private bot: Telegraf<BotContext>;
  private botsStore: IBotsStore; // SDK type, properly typed with IBotsStore interface
  private templateManager: GlobalTemplateManager;

  constructor(bot: Telegraf<BotContext>, botsStore: IBotsStore) {
    this.bot = bot;
    this.botsStore = botsStore;
    this.templateManager = GlobalTemplateManager.getInstance();
  }

  /**
   * Safely send a message with error handling for blocked users and other common errors
   * 
   * @param chatId - The chat ID to send the message to
   * @param text - The message text
   * @param options - Additional options for sendMessage
   * @returns The sent message object or null if failed
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
      LogEngine.info('🔄 Processing agent message webhook', {
        conversationId: event.data.conversationId,
        textLength: event.data.content?.length || 0,
        sentBy: event.data.userId,
        timestamp: event.timestamp
      });

      // 1. Get conversation ID from webhook event
      const conversationId = event.data.conversationId;
      if (!conversationId) {
        LogEngine.warn('❌ No conversation ID in webhook event', { event });
        return;
      }

      LogEngine.info('🔍 Looking up ticket for conversation', { conversationId });

      // DEBUG: Log the full event data structure to understand the webhook payload
      LogEngine.info('🔍 DEBUG: Full webhook event data', {
        eventData: JSON.stringify(event.data, null, 2),
        conversationIdFromEvent: conversationId,
        hasConversationId: !!conversationId
      });

      // 2. Look up original ticket message using conversation ID from webhook
      // 
      // UNIFIED APPROACH: Use conversationId from webhook as the single source of truth.
      // We now store all tickets using the webhook conversationId to eliminate ID mismatches.
      // This ensures consistent routing regardless of Unthread's internal ID variations.
      //
      LogEngine.info('🔍 DEBUG: About to lookup ticket', {
        conversationId,
        lookupKey: `ticket:unthread:${conversationId}`
      });
      
      const ticketData = await this.botsStore.getTicketByConversationId(conversationId);
      
      LogEngine.info('🔍 DEBUG: Ticket lookup result', {
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

      // 3. Validate message content - check both 'content' and 'text' fields
      const messageText = event.data.content || event.data.text;
      
      // Check for attachments in metadata
      const metadata = event.data.metadata as Record<string, unknown> | undefined;
      const eventPayload = metadata?.event_payload as Record<string, unknown> | undefined;
      const attachments = eventPayload?.attachments as Array<Record<string, unknown>> | undefined;
      const hasAttachments = !!(attachments && attachments.length > 0);
      
      // Message must have either text content OR attachments
      if ((!messageText || messageText.trim().length === 0) && !hasAttachments) {
        LogEngine.warn('❌ Empty message with no attachments in webhook event', { 
          conversationId,
          hasContent: !!event.data.content,
          hasText: !!event.data.text,
          hasAttachments
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

      // Log attachment detection
      if (hasAttachments && attachments) {
        LogEngine.info('📎 Processing message with attachments', {
          conversationId,
          attachmentCount: attachments.length,
          hasTextContent: !!(messageText && messageText.trim().length > 0),
          attachments: attachments.map((att: Record<string, unknown>) => ({
            id: att.id,
            name: att.name,
            size: att.size,
            type: att.type
          }))
        });
      }

      // 4. Always deliver agent messages - we'll prompt for email when user replies instead
      LogEngine.info('✅ Delivering agent message directly to user', {
        conversationId,
        telegramUserId: ticketData.telegramUserId,
        messageLength: messageText.length
      });

      // 5. Format agent message using template system
      const formattedMessage = await this.formatAgentMessageWithTemplate(
        messageText, 
        ticketData, 
        event.data
      );
      
      LogEngine.info('✅ Message formatted for Telegram', { 
        conversationId,
        formattedLength: formattedMessage.length
      });

      // 5. Send agent message as reply to original ticket message
      LogEngine.info('📤 Attempting to send message to Telegram', {
        conversationId,
        chatId: ticketData.chatId,
        replyToMessageId: ticketData.messageId
      });

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
          // 6. Store agent message for reply tracking
          await this.botsStore.storeAgentMessage({
            messageId: sentMessage.message_id,
            conversationId: conversationId,
            chatId: ticketData.chatId,
            friendlyId: ticketData.friendlyId,
            originalTicketMessageId: ticketData.messageId,
            sentAt: new Date().toISOString()
          });

          LogEngine.info('✅🎉 Agent message delivered to Telegram successfully!', {
            conversationId,
            chatId: ticketData.chatId,
            replyToMessageId: ticketData.messageId,
            sentMessageId: sentMessage.message_id,
            friendlyId: ticketData.friendlyId
          });

          // 7. Process attachments if present
          if (hasAttachments && attachments) {
            LogEngine.info('🔄 Processing attachments for dashboard message', {
              conversationId,
              attachmentCount: attachments.length,
              chatId: ticketData.chatId,
              replyToMessageId: sentMessage.message_id
            });

            try {
              await this.processAttachmentsFromDashboard(
                attachments,
                conversationId,
                ticketData.chatId,
                sentMessage.message_id
              );
            } catch (attachmentError) {
              LogEngine.error('❌ Failed to process attachments from dashboard', {
                conversationId,
                attachmentCount: attachments.length,
                error: attachmentError instanceof Error ? attachmentError.message : String(attachmentError)
              });

              // Send error notification to user
              if (attachmentError instanceof AttachmentProcessingError) {
                await AttachmentErrorHandler.notifyUser(
                  this.bot,
                  ticketData.chatId,
                  attachmentError,
                  sentMessage.message_id
                );
              } else {
                // Generic error notification
                await this.safeSendMessage(
                  ticketData.chatId,
                  '❌ Failed to process attachments. Please contact support if this persists.',
                  { 
                    reply_to_message_id: sentMessage.message_id,
                    parse_mode: 'Markdown'
                  }
                );
              }
            }
          }
        } else {
          LogEngine.warn('Message not sent - user may have blocked bot or chat not found', {
            conversationId,
            chatId: ticketData.chatId,
            friendlyId: ticketData.friendlyId
          });
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
          } else {
            LogEngine.warn('Fallback message also failed - user may have blocked bot', {
              conversationId,
              chatId: ticketData.chatId
            });
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

      LogEngine.info('🔍 Looking up ticket for status update', { conversationId, newStatus });

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
        newStatus, 
        event.data
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
   * @param eventData - The webhook event data
   * @returns Formatted message
   */
  async formatAgentMessageWithTemplate(text: string, ticketData: any, eventData: any): Promise<string> {
    try {
      // Build template variables for global template system
      const variables = {
        ticketNumber: ticketData.friendlyId,        // Primary: "TKT-001" format (user-friendly)
        friendlyId: ticketData.friendlyId,          // Explicit: "TKT-001" format (backward compatibility)
        conversationId: ticketData.conversationId,  // UUID from Unthread webhook events (consistent across all events)
        summary: eventData.subject || 'Support Request',
        customerName: ticketData.userName || 'Customer',
        status: 'Open',
        agentName: eventData.userName || eventData.agentName || 'Support Agent',
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
   * @param eventData - The webhook event data
   * @returns Formatted message
   */
  async formatStatusUpdateWithTemplate(ticketData: any, status: string, eventData: any): Promise<string> {
    try {
      // Build template variables for global template system
      const variables = {
        ticketNumber: ticketData.friendlyId,        // Primary: "TKT-001" format (user-friendly)
        friendlyId: ticketData.friendlyId,          // Explicit: "TKT-001" format (backward compatibility)
        conversationId: ticketData.conversationId,  // UUID from Unthread webhook events (consistent across all events)
        summary: eventData.subject || 'Support Request',
        customerName: ticketData.userName || 'Customer',
        status: status === 'closed' ? 'Closed' : 'Updated',
        agentName: eventData.userName || eventData.agentName || 'Support Agent',
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
    const statusText = status === 'closed' ? 'Closed' : 'Updated';
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
      // Note: User states are keyed by telegram user ID, not chat ID
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
   * Process attachments from dashboard messages and forward them to Telegram
   * Phase 1 implementation: Detection and validation, Phase 2 will add download/upload
   * 
   * @param attachments - Array of attachment objects from webhook metadata
   * @param conversationId - Unthread conversation ID
   * @param chatId - Telegram chat ID
   * @param replyToMessageId - Message ID to reply to
   */
  private async processAttachmentsFromDashboard(
    attachments: Array<Record<string, unknown>>,
    conversationId: string,
    chatId: number,
    replyToMessageId: number
  ): Promise<void> {
    LogEngine.info('🔄 Starting attachment processing from dashboard', {
      conversationId,
      attachmentCount: attachments.length,
      chatId,
      replyToMessageId,
      phase: 'Phase1-ValidationOnly'
    });

    // Phase 1: Validate attachments and prepare for Phase 2 implementation
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      
      // Skip invalid attachments
      if (!attachment) {
        LogEngine.warn('⚠️ Skipping undefined attachment', {
          conversationId,
          attachmentIndex: i + 1
        });
        continue;
      }
      
      try {
        // Validate attachment structure
        AttachmentErrorHandler.validateAttachment(attachment, {
          conversationId,
          chatId,
          messageId: replyToMessageId
        });

        LogEngine.info('✅ Attachment validated successfully', {
          conversationId,
          attachmentIndex: i + 1,
          fileName: attachment.name,
          fileSize: attachment.size,
          fileType: attachment.type,
          fileId: attachment.id
        });

        // Phase 2: Download and forward attachment to Telegram
        await this.downloadAndForwardAttachment({
          conversationId,
          fileId: String(attachment.id),
          fileName: String(attachment.name),
          fileSize: Number(attachment.size) || 0,
          mimeType: String(attachment.type),
          chatId,
          replyToMessageId
        });

      } catch (validationError) {
        LogEngine.error('❌ Attachment validation failed', {
          conversationId,
          attachmentIndex: i + 1,
          fileName: attachment.name || 'unknown',
          error: validationError instanceof Error ? validationError.message : String(validationError)
        });

        if (validationError instanceof AttachmentProcessingError) {
          await AttachmentErrorHandler.notifyUser(
            this.bot,
            chatId,
            validationError,
            replyToMessageId
          );
        }
      }
    }

    LogEngine.info('✅ Phase 1 attachment processing completed', {
      conversationId,
      processedCount: attachments.length,
      phase: 'Phase1-ValidationOnly'
    });
  }

  /**
   * Downloads an attachment from Unthread and forwards it to Telegram
   * 
   * Phase 2 implementation that handles the complete attachment processing pipeline:
   * 1. Downloads file from Unthread using conversation and file IDs
   * 2. Processes file buffer with existing AttachmentHandler
   * 3. Uploads to Telegram with proper threading and error handling
   * 
   * @param params - Download and forwarding parameters
   */
  private async downloadAndForwardAttachment(params: {
    conversationId: string;
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    chatId: number;
    replyToMessageId: number;
  }): Promise<void> {
    const { conversationId, fileId, fileName, fileSize, mimeType, chatId, replyToMessageId } = params;
    const startTime = Date.now();
    
    try {
      LogEngine.info('🔄 Starting attachment download and forward', {
        conversationId,
        fileId,
        fileName,
        fileSize,
        chatId,
        mimeType
      });

      // Step 1: Download attachment from Unthread
      LogEngine.debug('📥 Downloading attachment from Unthread API', { conversationId, fileId });
      const downloadStartTime = Date.now();
      
      const fileBuffer = await downloadAttachmentFromUnthread(
        conversationId,
        fileId,
        fileName,
        50 * 1024 * 1024 // 50MB limit for Telegram
      );

      const downloadTime = Date.now() - downloadStartTime;
      LogEngine.info('✅ Successfully downloaded attachment from Unthread', {
        conversationId,
        fileId,
        fileName,
        downloadedSize: fileBuffer.length,
        downloadTimeMs: downloadTime
      });

      // Step 2: Upload to Telegram using direct bot API
      LogEngine.debug('📤 Uploading attachment to Telegram', { chatId, fileName });
      const uploadStartTime = Date.now();
      
      try {
        // Determine the correct Telegram send method based on file type
        const sendMethod = this.determineTelegramSendMethod(mimeType, fileName);
        const fileTypeEmoji = this.getFileTypeEmoji(mimeType, sendMethod);
        
        // Enhanced caption with more metadata
        const caption = this.createAttachmentCaption({
          fileName,
          fileSize,
          mimeType,
          sendMethod,
          fileTypeEmoji
        });

        let telegramResult;
        if (sendMethod === 'document') {
          telegramResult = await this.bot.telegram.sendDocument(
            chatId,
            {
              source: fileBuffer,
              filename: fileName
            },
            {
              reply_parameters: { message_id: replyToMessageId },
              caption
            }
          );
        } else if (sendMethod === 'photo') {
          telegramResult = await this.bot.telegram.sendPhoto(
            chatId,
            {
              source: fileBuffer,
              filename: fileName
            },
            {
              reply_parameters: { message_id: replyToMessageId },
              caption
            }
          );
        } else {
          // Default to document
          telegramResult = await this.bot.telegram.sendDocument(
            chatId,
            {
              source: fileBuffer,
              filename: fileName
            },
            {
              reply_parameters: { message_id: replyToMessageId },
              caption
            }
          );
        }

        const uploadTime = Date.now() - uploadStartTime;
        const totalTime = Date.now() - startTime;

        LogEngine.info('🎉 Successfully forwarded attachment to Telegram', {
          conversationId,
          fileId,
          fileName,
          chatId,
          telegramFileId: telegramResult.document?.file_id || telegramResult.photo?.[0]?.file_id,
          messageId: telegramResult.message_id,
          downloadTimeMs: downloadTime,
          uploadTimeMs: uploadTime,
          totalTimeMs: totalTime,
          sendMethod
        });

        // Record successful operation metrics
        recordSuccessfulAttachment({
          downloadTimeMs: downloadTime,
          uploadTimeMs: uploadTime,
          totalTimeMs: totalTime,
          fileSize,
          mimeType,
          fileName,
          conversationId,
          chatId,
          timestamp: Date.now()
        });

        // Enhanced success notification with processing details
        await this.safeSendMessage(
          chatId,
          this.createSuccessNotification({
            fileName,
            fileSize,
            mimeType,
            sendMethod,
            processingTime: totalTime,
            downloadTime,
            uploadTime
          }),
          {
            reply_parameters: { message_id: replyToMessageId },
            parse_mode: 'Markdown'
          }
        );

      } catch (telegramError) {
        const uploadTime = Date.now() - uploadStartTime;
        LogEngine.error('Failed to upload attachment to Telegram', {
          conversationId,
          fileId,
          fileName,
          chatId,
          uploadTimeMs: uploadTime,
          error: telegramError instanceof Error ? telegramError.message : String(telegramError)
        });

        throw new AttachmentProcessingError(
          AttachmentErrorType.TELEGRAM_UPLOAD_FAILED,
          `Failed to upload attachment to Telegram: ${telegramError instanceof Error ? telegramError.message : String(telegramError)}`,
          {
            conversationId,
            fileId,
            fileName,
            fileSize,
            chatId,
            additionalData: { telegramError }
          }
        );
      }

    } catch (error) {
      const totalTime = Date.now() - startTime;
      LogEngine.error('❌ Failed to download and forward attachment', {
        conversationId,
        fileId,
        fileName,
        chatId,
        totalTimeMs: totalTime,
        error: error instanceof Error ? error.message : String(error)
      });

      // Handle AttachmentProcessingError with user notification
      if (error instanceof AttachmentProcessingError) {
        // Record failed operation metrics
        recordFailedAttachment(
          {
            downloadTimeMs: 0, // May not have completed download
            uploadTimeMs: 0,
            totalTimeMs: totalTime,
            fileSize,
            mimeType,
            fileName,
            conversationId,
            chatId,
            timestamp: Date.now()
          },
          error.errorType,
          error.message
        );

        await AttachmentErrorHandler.notifyUser(
          this.bot,
          chatId,
          error,
          replyToMessageId
        );
        return;
      }

      // Handle unexpected errors
      recordFailedAttachment(
        {
          downloadTimeMs: 0,
          uploadTimeMs: 0,
          totalTimeMs: totalTime,
          fileSize,
          mimeType,
          fileName,
          conversationId,
          chatId,
          timestamp: Date.now()
        },
        'UNEXPECTED_ERROR',
        error instanceof Error ? error.message : String(error)
      );

      await this.safeSendMessage(
        chatId,
        `❌ **Failed to Forward Attachment**\n\n` +
        `📎 **${fileName}**\n` +
        `🚨 An unexpected error occurred while processing your attachment.\n\n` +
        `Please try again or contact support if the issue persists.`,
        {
          reply_parameters: { message_id: replyToMessageId },
          parse_mode: 'Markdown'
        }
      );
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
    const { fileName, fileSize, mimeType, sendMethod, fileTypeEmoji } = params;
    
    return `${fileTypeEmoji} **${fileName}**\n` +
           `📊 **Size:** ${this.formatFileSize(fileSize)}\n` +
           `🔖 **Type:** ${this.getReadableFileType(mimeType, sendMethod)}`;
  }

  /**
   * Creates a success notification with processing details
   */
  private createSuccessNotification(params: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    sendMethod: 'photo' | 'document';
    processingTime: number;
    downloadTime: number;
    uploadTime: number;
  }): string {
    const { fileName, fileSize, mimeType, sendMethod, processingTime, downloadTime, uploadTime } = params;
    
    return `✅ **Attachment Forwarded Successfully**\n\n` +
           `📎 **${fileName}**\n` +
           `📊 **Size:** ${this.formatFileSize(fileSize)}\n` +
           `🔖 **Type:** ${this.getReadableFileType(mimeType, sendMethod)}\n` +
           `⚡ **Processing:** ${processingTime}ms (↓${downloadTime}ms ↑${uploadTime}ms)`;
  }

  /**
   * Gets appropriate emoji for file type
   */
  private getFileTypeEmoji(mimeType: string, sendMethod: 'photo' | 'document'): string {
    if (sendMethod === 'photo') {
      return '📷';
    }

    // Document types
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📋';
    if (mimeType.includes('video')) return '🎥';
    if (mimeType.includes('audio')) return '🎵';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return '🗜️';
    if (mimeType.includes('text')) return '📄';
    
    return '📎'; // Default document emoji
  }

  /**
   * Gets human-readable file type description
   */
  private getReadableFileType(mimeType: string, sendMethod: 'photo' | 'document'): string {
    if (sendMethod === 'photo') {
      return 'Image';
    }

    // Specific document types
    if (mimeType.includes('pdf')) return 'PDF Document';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'Word Document';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'Spreadsheet';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'Presentation';
    if (mimeType.includes('video')) return 'Video File';
    if (mimeType.includes('audio')) return 'Audio File';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'Archive';
    if (mimeType.includes('text')) return 'Text File';
    
    // Extract from mime type if possible
    if (mimeType.includes('/')) {
      const parts = mimeType.split('/');
      if (parts.length >= 2 && parts[1]) {
        return parts[1].charAt(0).toUpperCase() + parts[1].slice(1) + ' File';
      }
    }
    
    return 'Document';
  }

  /**
   * Determines the appropriate Telegram send method based on file type
   */
  private determineTelegramSendMethod(mimeType: string, fileName: string): 'photo' | 'document' {
    // Image files that should be sent as photos
    const imageTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp'
    ];

    // Check if it's an image type and under 10MB (Telegram photo limit)
    if (imageTypes.includes(mimeType.toLowerCase())) {
      return 'photo';
    }

    // Check file extension as fallback
    const extension = fileName.toLowerCase().split('.').pop();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    
    if (extension && imageExtensions.includes(extension)) {
      return 'photo';
    }

    // Default to document for all other files
    return 'document';
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
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

}
