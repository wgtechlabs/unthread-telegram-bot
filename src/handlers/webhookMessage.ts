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
      if (!messageText || messageText.trim().length === 0) {
        LogEngine.warn('❌ Empty message text in webhook event', { 
          conversationId,
          hasContent: !!event.data.content,
          hasText: !!event.data.text
        });
        return;
      }

      LogEngine.info('✅ Message content validated', { 
        conversationId, 
        messageLength: messageText.length,
        messagePreview: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : '')
      });

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

}
