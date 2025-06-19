import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * Handles incoming webhook messages from Unthread agents
 * Sends agent responses as replies to original ticket messages in Telegram
 */
export class TelegramWebhookHandler {
  constructor(bot, botsStore) {
    this.bot = bot;
    this.botsStore = botsStore;
  }

  /**
   * Safely send a message with error handling for blocked users and other common errors
   * 
   * @param {number} chatId - The chat ID to send the message to
   * @param {string} text - The message text
   * @param {object} options - Additional options for sendMessage
   * @returns {Promise<object|null>} - The sent message object or null if failed
   */
  async safeSendMessage(chatId, text, options = {}) {
    try {
      return await this.bot.telegram.sendMessage(chatId, text, options);
    } catch (error) {
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
   * @param {Object} event - The webhook event
   * @param {string} event.data.conversationId - Unthread conversation ID
   * @param {string} event.data.text - Agent message text
   * @param {string} event.data.sentByUserId - ID of the agent who sent the message
   * @param {string} event.timestamp - Event timestamp
   */
  async handleMessageCreated(event) {
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

      // 2. Look up original ticket message using bots-brain
      const ticketData = await this.botsStore.getTicketByConversationId(conversationId);
      if (!ticketData) {
        LogEngine.warn(`❌ No ticket found for conversation: ${conversationId}`);
        return;
      }

      LogEngine.info('✅ Ticket found', {
        conversationId,
        friendlyId: ticketData.friendlyId,
        chatId: ticketData.chatId,
        messageId: ticketData.messageId
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

      // 4. Format agent message for Telegram
      const formattedMessage = this.formatAgentMessage(messageText, ticketData.friendlyId);
      
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
        LogEngine.error('Failed to send message to Telegram', {
          error: telegramError.message,
          chatId: ticketData.chatId,
          messageId: ticketData.messageId,
          conversationId
        });        // Try sending without reply if reply fails (original message might be deleted)
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
          LogEngine.error('Failed to send fallback message to Telegram', {
            error: fallbackError.message,
            chatId: ticketData.chatId,
            conversationId
          });
          throw fallbackError;
        }
      }

    } catch (error) {
      LogEngine.error('Error handling webhook message', {
        error: error.message,
        stack: error.stack,
        event: event
      });
      throw error;
    }
  }

  /**
   * Format agent message for display in Telegram
   * @param {string} text - The agent message text
   * @param {string} friendlyId - The ticket friendly ID (e.g., TKT-001)
   * @returns {string} Formatted message
   */
  formatAgentMessage(text, friendlyId) {
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
   * @param {string} text - Raw message text
   * @returns {string} Sanitized text
   */
  sanitizeMessageText(text) {
    if (!text) return '';
    
    // Basic cleanup
    let cleaned = text.trim();
    
    // Escape common Markdown characters that might break formatting
    // But preserve basic formatting like *bold* and _italic_
    cleaned = cleaned
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/`/g, '\\`')    // Escape backticks
      .replace(/\[/g, '\\[')   // Escape square brackets
      .replace(/\]/g, '\\]');  // Escape square brackets

    return cleaned;
  }

  /**
   * Handle other webhook events (for future expansion)
   * @param {string} eventType - Type of webhook event
   * @param {Object} event - The webhook event data
   */
  async handleOtherEvent(eventType, event) {
    LogEngine.info(`Received ${eventType} event (not processed)`, {
      eventType,
      conversationId: event.data?.conversationId,
      timestamp: event.timestamp
    });
  }

  /**
   * Handle conversation updated events from Unthread (status changes)
   * @param {Object} event - The webhook event
   * @param {string} event.data.conversationId - Unthread conversation ID
   * @param {string} event.data.status - New status (open/closed)
   * @param {string} event.data.previousStatus - Previous status (if available)
   * @param {string} event.timestamp - Event timestamp
   */
  async handleConversationUpdated(event) {
    try {
      // 1. Get conversation ID from webhook event (try both fields)
      const conversationId = event.data.conversationId || event.data.id;

      LogEngine.info('🔄 Processing conversation status update webhook', {
        conversationId: conversationId,
        newStatus: event.data.status,
        previousStatus: event.data.previousStatus,
        timestamp: event.timestamp
      });
      const newStatus = typeof event.data.status === 'string' ? event.data.status.toLowerCase() : String(event.data.status || '').toLowerCase();
      
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

      // 3. Format status update message for Telegram
      const statusMessage = this.formatStatusUpdateMessage(newStatus, ticketData.friendlyId);
      
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
        LogEngine.error('Failed to send status notification to Telegram', {
          error: telegramError.message,
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
          LogEngine.error('Failed to send fallback status notification to Telegram', {
            error: fallbackError.message,
            chatId: ticketData.chatId,
            conversationId,
            newStatus
          });
          throw fallbackError;
        }
      }

    } catch (error) {
      LogEngine.error('Error handling conversation update webhook', {
        error: error.message,
        stack: error.stack,
        event: event
      });
      throw error;
    }
  }

  /**
   * Format status update message for display in Telegram
   * @param {string} status - The new status (open/closed)
   * @param {string} friendlyId - The ticket friendly ID (e.g., TKT-001)
   * @returns {string} Formatted status message
   */
  formatStatusUpdateMessage(status, friendlyId) {
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
   * Clean up user data when bot is blocked or chat is not found
   * This implements the fix from GitHub issue telegraf/telegraf#1513
   * 
   * @param {number} chatId - The chat ID of the blocked user
   */
  async cleanupBlockedUser(chatId) {
    try {
      LogEngine.info('Starting cleanup for blocked user', { chatId });
      
      // 1. Get all tickets for this chat
      const tickets = await this.botsStore.getTicketsForChat(chatId);
      
      if (tickets.length > 0) {
        LogEngine.info(`Found ${tickets.length} tickets to clean up for blocked user`, { 
          chatId, 
          ticketIds: tickets.map(t => t.conversationId) 
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
      LogEngine.error('Error cleaning up blocked user data', {
        error: error.message,
        stack: error.stack,
        chatId
      });
      // Don't throw - cleanup failure shouldn't crash the bot
    }
  }
}
