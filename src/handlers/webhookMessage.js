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
      LogEngine.info('Processing agent message webhook', {
        conversationId: event.data.conversationId,
        textLength: event.data.content?.length || 0,
        sentBy: event.data.userId,
        timestamp: event.timestamp
      });

      // 1. Get conversation ID from webhook event
      const conversationId = event.data.conversationId;
      if (!conversationId) {
        LogEngine.warn('No conversation ID in webhook event', { event });
        return;
      }

      // 2. Look up original ticket message using bots-brain
      const ticketData = await this.botsStore.getTicketByConversationId(conversationId);
      if (!ticketData) {
        LogEngine.warn(`No ticket found for conversation: ${conversationId}`);
        return;
      }

      // 3. Validate message content
      const messageText = event.data.content;
      if (!messageText || messageText.trim().length === 0) {
        LogEngine.warn('Empty message text in webhook event', { conversationId });
        return;
      }

      // 4. Format agent message for Telegram
      const formattedMessage = this.formatAgentMessage(messageText, ticketData.friendlyId);

      // 5. Send agent message as reply to original ticket message
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

        this.        LogEngine.info('✅ Agent message delivered to Telegram', {
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

          this.LogEngine.info('Agent message sent as new message (fallback)', {
            conversationId,
            chatId: ticketData.chatId
          });

        } catch (fallbackError) {
          this.LogEngine.error('Failed to send fallback message to Telegram', {
            error: fallbackError.message,
            chatId: ticketData.chatId,
            conversationId
          });
          throw fallbackError;
        }
      }

    } catch (error) {
      this.LogEngine.error('Error handling webhook message', {
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

    return `🎧 **Agent Response** (${friendlyId})\n\n${truncatedText}`;
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
    this.LogEngine.info(`Received ${eventType} event (not processed)`, {
      eventType,
      conversationId: event.data?.conversationId,
      timestamp: event.timestamp
    });
  }
}
