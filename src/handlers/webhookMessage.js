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
        const sentMessage = await this.bot.telegram.sendMessage(
          ticketData.chatId,
          formattedMessage,
          { 
            reply_to_message_id: ticketData.messageId,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          }
        );

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

      } catch (telegramError) {
        LogEngine.error('Failed to send message to Telegram', {
          error: telegramError.message,
          chatId: ticketData.chatId,
          messageId: ticketData.messageId,
          conversationId
        });

        // Try sending without reply if reply fails (original message might be deleted)
        try {
          await this.bot.telegram.sendMessage(
            ticketData.chatId,
            `${formattedMessage}\n\n_Note: Sent as new message (original ticket message not found)_`,
            { 
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }
          );

          LogEngine.info('Agent message sent as new message (fallback)', {
            conversationId,
            chatId: ticketData.chatId
          });

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
      LogEngine.info('🔄 Processing conversation status update webhook', {
        conversationId: event.data.conversationId || event.data.id,
        newStatus: event.data.status,
        previousStatus: event.data.previousStatus,
        timestamp: event.timestamp
      });

      // 1. Get conversation ID from webhook event (try both fields)
      const conversationId = event.data.conversationId || event.data.id;
      const newStatus = event.data.status?.toLowerCase();
      
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
        const sentMessage = await this.bot.telegram.sendMessage(
          ticketData.chatId,
          statusMessage,
          { 
            reply_to_message_id: ticketData.messageId,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          }
        );

        LogEngine.info('✅🎉 Status notification delivered to Telegram successfully!', {
          conversationId,
          chatId: ticketData.chatId,
          replyToMessageId: ticketData.messageId,
          sentMessageId: sentMessage.message_id,
          friendlyId: ticketData.friendlyId,
          newStatus
        });

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
          await this.bot.telegram.sendMessage(
            ticketData.chatId,
            `${statusMessage}\n\n_Note: Sent as new message (original ticket message not found)_`,
            { 
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }
          );
          
          LogEngine.info('Status notification sent as new message (fallback)', {
            conversationId,
            chatId: ticketData.chatId,
            newStatus
          });

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
    
    let message = `${statusIcon} **Ticket Status Update**\n\n`;
    message += `🎫 Ticket #${friendlyId}\n`;
    message += `${statusEmoji} Status: **${statusText}**\n\n`;
    
    if (status === 'closed') {
      message += `Your ticket has been resolved and closed. If you need further assistance, please create a new ticket using /support.`;
    } else {
      message += `Your ticket has been reopened and is now active. An agent will assist you shortly.`;
    }

    return message;
  }
}
