/**
 * Webhook Message Handler - Routes Unthread agent responses to Telegram
 * 
 * Key Features:
 * - Processes Unthread webhook events
 * - Routes agent messages to Telegram chats
 * - Handles user blocking and delivery errors
 * 
 * Current Status:
 * - ✅ Telegram → Unthread: ENABLED (users can send files to agents)
 * - ✅ Unthread → Telegram: ENABLED (agents' files are forwarded to users)
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0-rc2
 * @since 2025
 */
import { LogEngine } from '@wgtechlabs/log-engine';
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../types/index.js';
import type { IBotsStore } from '../sdk/types.js';
import { GlobalTemplateManager } from '../utils/globalTemplateManager.js';
import { escapeMarkdown } from '../utils/markdownEscape.js';
import { downloadUnthreadImage } from '../services/unthread.js';
import { attachmentHandler } from '../utils/attachmentHandler.js';
import { type ImageProcessingConfig, getImageProcessingConfig } from '../config/env.js';
// ENABLED: Attachment processing fully operational
// Removed unused AttachmentErrorHandler and AttachmentProcessingError imports

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
    
    // Fail-fast validation: Ensure required environment variables are set at initialization
    this.teamId = process.env.SLACK_TEAM_ID || '';
    if (!this.teamId) {
      const errorMessage = 'SLACK_TEAM_ID environment variable is not set. Please configure it before starting the application.';
      LogEngine.error('Configuration validation failed during initialization', {
        missingVariable: 'SLACK_TEAM_ID',
        suggestion: 'Set SLACK_TEAM_ID in your environment variables (Slack workspace identifier)'
      });
      throw new Error(errorMessage);
    }
    
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
      LogEngine.debug('🔄 Processing agent message webhook', {
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

      LogEngine.info('Looking up ticket for conversation', { conversationId });

      // Log the full event data structure to understand the webhook payload
      LogEngine.info('Full webhook event data', {
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
      LogEngine.info('About to lookup ticket', {
        conversationId,
        lookupKey: `ticket:unthread:${conversationId}`
      });
      
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

      // 3. Validate message content - check both 'content' and 'text' fields
      const messageText = event.data.content || event.data.text;
      
      // Check for attachments ONLY in data.files (Slack files)
      // Dashboard attachments with u-warentest IDs are USELESS - the real files come from "unknown" source events
      const dataFiles = event.data.files as Array<Record<string, unknown>> | undefined;
      
      const hasSlackFiles = !!(dataFiles && dataFiles.length > 0);
      const hasAttachments = hasSlackFiles;
      
      // Use only Slack files for processing - dashboard attachments are ignored
      const allAttachments = [...(dataFiles || [])];
      
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
      if (hasAttachments && allAttachments.length > 0) {
        LogEngine.debug('📎 Processing message with attachments', {
          conversationId,
          attachmentCount: allAttachments.length,
          hasTextContent: !!(messageText && messageText.trim().length > 0),
          attachments: allAttachments.map((att: Record<string, unknown>) => ({
            id: att.id,
            name: att.name,
            size: att.size,
            type: att.type
          }))
        });
      }

      // 4. Handle attachment-only events (unknown source) vs text+attachment events (dashboard source)
      const hasTextContent = !!(messageText && messageText.trim().length > 0);
      
      if (hasTextContent) {
        // This is a text message (dashboard event) - send the message normally
        LogEngine.info('✅ Delivering agent message with text content', {
          conversationId,
          telegramUserId: ticketData.telegramUserId,
          messageLength: messageText.length
        });

        // 5. Format agent message using template system
        const formattedMessage = await this.formatAgentMessageWithTemplate(
          messageText, 
          ticketData
        );
        
        LogEngine.info('✅ Message formatted for Telegram', { 
          conversationId,
          formattedLength: formattedMessage.length
        });

        // 6. Send agent message as reply to original ticket message
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
            // 7. Store agent message for reply tracking
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

            // 8. Process ONLY Slack files - dashboard attachments are USELESS (u-warentest IDs don't work)
            // The real files come from "unknown" source events which need a separate handler
            if (hasAttachments) {
              LogEngine.info('📎 Processing Slack files only - dashboard u-warentest IDs ignored', {
                conversationId,
                slackFileCount: hasSlackFiles && dataFiles ? dataFiles.length : 0,
                totalAttachments: allAttachments.length,
                chatId: ticketData.chatId,
                status: 'Slack-only processing (dashboard IDs are useless)'
              });
              
              // Process Slack files using Slack thumbnail endpoint
              if (hasSlackFiles && dataFiles) {
                await this.processSlackFiles(
                  dataFiles,
                  conversationId,
                  ticketData.chatId,
                  sentMessage.message_id
                );
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
      } else if (hasAttachments) {
        // This is an attachment-only event (unknown source) - find the latest agent message to reply to
        LogEngine.debug('📎 Processing attachment-only event (finding agent message to reply to)', {
          conversationId,
          attachmentCount: allAttachments.length,
          chatId: ticketData.chatId,
          status: 'Finding latest agent message for attachment reply'
        });

        // Use a simple approach: check Redis for the most recent agent message in this conversation
        let replyToMessageId = ticketData.messageId; // Default fallback to original ticket
        
        try {
          // Try to get the latest agent message from Redis using a simple pattern
          // We'll look for agent messages stored with this conversation ID
          const agentMessageKey = `agent_message:${conversationId}:latest`;
          const latestAgentMessageData = await this.botsStore.storage.get(agentMessageKey);
          
          if (latestAgentMessageData && typeof latestAgentMessageData === 'string') {
            const agentMessage = JSON.parse(latestAgentMessageData);
            replyToMessageId = agentMessage.messageId;
            
            LogEngine.info('🎯 Found latest agent message to reply to', {
              conversationId,
              latestAgentMessageId: replyToMessageId,
              originalTicketId: ticketData.messageId
            });
          } else {
            LogEngine.info('🎯 No latest agent message found, using original ticket as reply target', {
              conversationId,
              replyToMessageId: ticketData.messageId
            });
          }
        } catch (lookupError) {
          LogEngine.warn('⚠️ Failed to lookup latest agent message, using original ticket as reply target', {
            conversationId,
            error: lookupError instanceof Error ? lookupError.message : String(lookupError),
            fallbackReplyId: ticketData.messageId
          });
        }

        // Process Slack files using the determined reply target (latest agent message or original ticket)
        if (hasSlackFiles && dataFiles) {
          await this.processSlackFiles(
            dataFiles,
            conversationId,
            ticketData.chatId,
            replyToMessageId
          );
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
      const slackFile = slackFiles[i];
      
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
      // Endpoint: https://api.unthread.io/api/slack/files/{fileId}/thumb?thumbSize=160&teamId={teamId}
      const thumbnailSize = 160; // Standard thumbnail size
      
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
   * Handle unknown webhook events with image attachments
   * Routes Unthread agent image attachments to Telegram users with enhanced configuration
   */
  async handleUnknownEventWithImages(event: any): Promise<void> {
    try {
      // Check if image processing is enabled
      if (!this.imageConfig.enabled) {
        LogEngine.debug('Image processing disabled via configuration', {
          eventType: event.type,
          conversationId: event.data?.conversationId
        });
        return;
      }

      LogEngine.info('Processing unknown event with potential image attachments', {
        eventType: event.type,
        conversationId: event.data?.conversationId,
        timestamp: event.timestamp,
        configEnabled: this.imageConfig.enabled
      });

      // 1. Extract conversation ID from webhook event
      const conversationId = event.data?.conversationId;
      if (!conversationId) {
        LogEngine.warn('No conversation ID in unknown event', { 
          eventType: event.type,
          dataKeys: Object.keys(event.data || {})
        });
        return;
      }

      // 2. Look up ticket data for routing
      const ticketData = await this.botsStore.getTicketByConversationId(conversationId);
      if (!ticketData) {
        LogEngine.warn('No ticket found for conversation in unknown event', {
          conversationId,
          eventType: event.type
        });
        return;
      }

      // 3. Extract attachments from various possible locations in the event
      let attachments: Array<Record<string, unknown>> = [];
      
      // Check multiple possible locations for attachments
      const metadata = event.data.metadata as Record<string, unknown> | undefined;
      const eventPayload = metadata?.event_payload as Record<string, unknown> | undefined;
      
      // Try different attachment locations
      if (eventPayload?.attachments) {
        attachments = eventPayload.attachments as Array<Record<string, unknown>>;
      } else if (event.data.attachments) {
        attachments = event.data.attachments as Array<Record<string, unknown>>;
      } else if (metadata?.attachments) {
        attachments = metadata.attachments as Array<Record<string, unknown>>;
      }

      // 4. Enhanced image filtering with configuration validation
      const imageAttachments = attachments.filter((att: Record<string, unknown>) => {
        const mimeType = att.mimeType as string || att.mime_type as string || att.type as string || '';
        const fileName = att.name as string || att.filename as string || '';
        const fileSize = (att.size as number) || 0;
        
        // Check if it's an image by MIME type or file extension
        const isImageMime = mimeType.startsWith('image/');
        const isImageExtension = /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|ico)$/i.test(fileName);
        
        // Validate against configuration
        const isSupportedFormat = this.imageConfig.supportedFormats.includes(mimeType) || 
                                 this.imageConfig.supportedFormats.some(format => {
                                   const formatPrefix = format.split('/')[0];
                                   return formatPrefix && mimeType.startsWith(formatPrefix);
                                 });
        
        const isValidSize = fileSize === 0 || fileSize <= this.imageConfig.maxImageSize;
        
        if ((isImageMime || isImageExtension) && !isSupportedFormat) {
          LogEngine.warn('Image format not supported by configuration', {
            fileName, mimeType, 
            supportedFormats: this.imageConfig.supportedFormats
          });
          return false;
        }
        
        if ((isImageMime || isImageExtension) && !isValidSize) {
          LogEngine.warn('Image size exceeds configuration limit', {
            fileName, 
            fileSizeMB: Math.round(fileSize / 1024 / 1024),
            maxSizeMB: Math.round(this.imageConfig.maxImageSize / 1024 / 1024)
          });
          return false;
        }
        
        return (isImageMime || isImageExtension) && isSupportedFormat && isValidSize;
      });

      if (imageAttachments.length === 0) {
        LogEngine.debug('No valid image attachments found in unknown event', {
          conversationId,
          eventType: event.type,
          totalAttachments: attachments.length,
          configEnabled: this.imageConfig.enabled
        });
        return;
      }

      // Apply batch size limits
      const processableImages = imageAttachments.slice(0, this.imageConfig.maxImagesPerBatch);
      if (imageAttachments.length > this.imageConfig.maxImagesPerBatch) {
        LogEngine.warn('Image batch size exceeds limit, processing subset', {
          conversationId,
          totalImages: imageAttachments.length,
          processingCount: processableImages.length,
          maxBatchSize: this.imageConfig.maxImagesPerBatch
        });
      }

      LogEngine.info('Found valid image attachments in unknown event', {
        conversationId,
        eventType: event.type,
        validImageCount: processableImages.length,
        totalAttachments: attachments.length,
        configValidation: 'passed'
      });

      // 5. Enhanced image download with timeout and error tracking
      const fileIds: string[] = [];
      const imageBuffers: Array<{ buffer: Buffer; fileName: string; mimeType: string; size: number }> = [];
      const downloadErrors: Array<{ fileName: string; error: string }> = [];

      for (const attachment of processableImages) {
        try {
          const fileId = attachment.id as string || attachment.file_id as string;
          const fileName = attachment.name as string || attachment.filename as string || `image_${Date.now()}`;
          const mimeType = attachment.mimeType as string || attachment.mime_type as string || 'image/jpeg';

          if (!fileId) {
            LogEngine.warn('No file ID found for image attachment', {
              attachment: Object.keys(attachment)
            });
            downloadErrors.push({ fileName, error: 'No file ID found' });
            continue;
          }

          LogEngine.debug('Downloading image from Unthread', {
            fileId,
            fileName,
            mimeType,
            timeout: this.imageConfig.downloadTimeout
          });

          // Download with timeout handling (using pre-validated team ID)
          // Download with timeout wrapper
          const downloadPromise = downloadUnthreadImage(
            fileId, 
            this.teamId, // Use the validated team ID from constructor
            fileName,
            this.imageConfig.enableThumbnails ? this.imageConfig.thumbnailSize : undefined
          );
          
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Download timeout')), this.imageConfig.downloadTimeout);
          });

          const imageBuffer = await Promise.race([downloadPromise, timeoutPromise]);
          
          // Additional size validation after download
          if (imageBuffer.length > this.imageConfig.maxImageSize) {
            LogEngine.warn('Downloaded image exceeds size limit', {
              fileName,
              actualSize: imageBuffer.length,
              maxSize: this.imageConfig.maxImageSize
            });
            downloadErrors.push({ 
              fileName, 
              error: `Image too large: ${Math.round(imageBuffer.length / 1024 / 1024)}MB` 
            });
            continue;
          }
          
          // Create FileBuffer structure for our attachment handler
          const fileBufferData = {
            buffer: imageBuffer,
            fileName: fileName,
            mimeType: mimeType,
            size: imageBuffer.length
          };
          
          imageBuffers.push(fileBufferData);
          fileIds.push(fileId);

          LogEngine.info('Image downloaded successfully', {
            fileId,
            fileName: fileName,
            size: imageBuffer.length,
            downloadTimeMs: Date.now() // Note: actual timing would need start time
          });

        } catch (downloadError) {
          const errorMessage = downloadError instanceof Error ? downloadError.message : String(downloadError);
          LogEngine.error('Failed to download image attachment', {
            attachmentId: attachment.id || attachment.file_id,
            fileName: attachment.name,
            error: errorMessage,
            timeout: this.imageConfig.downloadTimeout
          });
          
          downloadErrors.push({ 
            fileName: attachment.name as string || 'unknown', 
            error: errorMessage 
          });
          // Continue with other attachments
        }
      }

      // Enhanced download results logging
      if (imageBuffers.length === 0) {
        LogEngine.warn('No images successfully downloaded', {
          conversationId,
          eventType: event.type,
          attemptedDownloads: processableImages.length,
          downloadErrors: downloadErrors.length > 0 ? downloadErrors : undefined
        });
        
        // Send user notification about download failures
        if (downloadErrors.length > 0) {
          try {
            await this.bot.telegram.sendMessage(
              ticketData.chatId,
              `⚠️ **Image Processing Error**\n\nSome images couldn't be downloaded:\n${downloadErrors.map(e => `• ${e.fileName}: ${e.error}`).join('\n')}\n\n_Please ask your agent to resend the images._`,
              { 
                reply_parameters: { message_id: ticketData.messageId },
                parse_mode: 'Markdown'
              }
            );
          } catch (notificationError) {
            LogEngine.error('Failed to send download error notification', {
              error: notificationError instanceof Error ? notificationError.message : String(notificationError)
            });
          }
        }
        return;
      }

      LogEngine.info('Download completed', {
        conversationId,
        successfulDownloads: imageBuffers.length,
        failedDownloads: downloadErrors.length,
        totalAttempted: processableImages.length
      });

      // 6. Enhanced upload to Telegram with timeout and performance tracking
      try {
        const uploadStartTime = Date.now();
        const chatId = ticketData.chatId;
        const replyToMessageId = ticketData.messageId;
        
        // Extract message text if available
        const messageText = event.data.content || event.data.text || event.data.message;
        const caption = messageText ? `💬 ${messageText}` : `📎 ${imageBuffers.length} image${imageBuffers.length > 1 ? 's' : ''} from agent`;

        LogEngine.info('Uploading images to Telegram', {
          conversationId,
          chatId,
          imageCount: imageBuffers.length,
          hasCaption: !!messageText,
          totalSize: imageBuffers.reduce((sum, img) => sum + img.size, 0),
          timeout: this.imageConfig.uploadTimeout
        });

        let uploadSuccess = false;

        // Upload with timeout wrapper
        const uploadPromise = (async () => {
          if (imageBuffers.length === 1) {
            // Single image upload
            const firstImage = imageBuffers[0];
            if (!firstImage) {
              throw new Error('Invalid image buffer detected');
            }
            
            return await attachmentHandler.uploadBufferToTelegram(
              firstImage,
              chatId,
              replyToMessageId,
              caption
            );
          } else {
            // Multiple images upload
            return await attachmentHandler.uploadMultipleImagesToTelegram(
              imageBuffers,
              chatId,
              replyToMessageId,
              caption
            );
          }
        })();

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Upload timeout')), this.imageConfig.uploadTimeout);
        });

        uploadSuccess = await Promise.race([uploadPromise, timeoutPromise]);
        const uploadTime = Date.now() - uploadStartTime;

        if (uploadSuccess) {
          LogEngine.info('Images uploaded to Telegram successfully', {
            conversationId,
            chatId,
            imageCount: imageBuffers.length,
            eventType: event.type,
            uploadTimeMs: uploadTime,
            performance: 'optimal',
            totalSizeMB: Math.round(imageBuffers.reduce((sum, img) => sum + img.size, 0) / 1024 / 1024)
          });

          // Store agent message for tracking with enhanced metadata
          await this.botsStore.storeAgentMessage({
            messageId: 0, // We don't have the exact message ID, but this is for tracking
            conversationId: conversationId,
            chatId: chatId,
            friendlyId: ticketData.friendlyId,
            originalTicketMessageId: ticketData.messageId,
            sentAt: new Date().toISOString()
          });

          // Success notification with processing metrics (optional)
          if (uploadTime > 5000 || imageBuffers.length > 3) { // Only for slow uploads or large batches
            try {
              await this.bot.telegram.sendMessage(
                chatId,
                `✅ **Image Processing Complete**\n\n📊 **Processing Stats:**\n• Images processed: ${imageBuffers.length}\n• Upload time: ${Math.round(uploadTime / 1000)}s\n• Total size: ${Math.round(imageBuffers.reduce((sum, img) => sum + img.size, 0) / 1024 / 1024)}MB`,
                { 
                  reply_parameters: { message_id: replyToMessageId },
                  parse_mode: 'Markdown'
                }
              );
            } catch (statsError) {
              LogEngine.debug('Stats notification failed (non-critical)', {
                error: statsError instanceof Error ? statsError.message : String(statsError)
              });
            }
          }

        } else {
          LogEngine.error('Failed to upload images to Telegram', {
            conversationId,
            chatId,
            imageCount: imageBuffers.length,
            uploadTimeMs: uploadTime
          });
          
          // Send user notification about upload failures
          try {
            await this.bot.telegram.sendMessage(
              chatId,
              `❌ **Image Upload Failed**\n\nWe couldn't send ${imageBuffers.length} image${imageBuffers.length > 1 ? 's' : ''} from your agent. This might be a temporary issue.\n\n_Please ask your agent to resend the images or try again later._`,
              { 
                reply_parameters: { message_id: replyToMessageId },
                parse_mode: 'Markdown'
              }
            );
          } catch (notificationError) {
            LogEngine.error('Failed to send upload error notification', {
              error: notificationError instanceof Error ? notificationError.message : String(notificationError)
            });
          }
        }

      } catch (uploadError) {
        LogEngine.error('Critical error uploading images to Telegram', {
          conversationId,
          chatId: ticketData.chatId,
          imageCount: imageBuffers.length,
          error: uploadError instanceof Error ? uploadError.message : String(uploadError),
          timeout: this.imageConfig.uploadTimeout
        });
        
        // Send critical error notification
        try {
          await this.bot.telegram.sendMessage(
            ticketData.chatId,
            `🚨 **Critical Error**\n\nA technical error occurred while processing ${imageBuffers.length} image${imageBuffers.length > 1 ? 's' : ''} from your agent.\n\nError: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}\n\n_Our team has been notified. Please contact support if this persists._`,
            { 
              reply_parameters: { message_id: ticketData.messageId },
              parse_mode: 'Markdown'
            }
          );
        } catch (criticalNotificationError) {
          LogEngine.error('Failed to send critical error notification', {
            error: criticalNotificationError instanceof Error ? criticalNotificationError.message : String(criticalNotificationError)
          });
        }
      }

    } catch (error) {
      LogEngine.error('Critical error in handleUnknownEventWithImages', {
        eventType: event.type,
        conversationId: event.data?.conversationId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
        imageProcessingConfig: {
          enabled: this.imageConfig.enabled,
          maxImageSizeMB: Math.round(this.imageConfig.maxImageSize / 1024 / 1024),
          maxBatchSize: this.imageConfig.maxImagesPerBatch
        }
      });
    }
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

}
