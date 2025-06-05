/**
 * BotsStore - High-level bot storage operations
 * Provides bot-specific methods for storing and retrieving ticket data
 * Uses UnifiedStorage for multi-layer caching
 */
import { UnifiedStorage } from './UnifiedStorage.js';

export class BotsStore {
  static instance = null;
  
  constructor(unifiedStorage) {
    this.storage = unifiedStorage;
  }
  
  /**
   * Initialize the BotsStore singleton with database connection
   */
  static async initialize(dbConnection, platformRedisUrl = null) {
    if (!BotsStore.instance) {
      const unifiedStorageConfig = {
        postgres: dbConnection.pool, // Pass the existing pool instead of config
        redisUrl: platformRedisUrl
      };
      const unifiedStorage = new UnifiedStorage(unifiedStorageConfig);
      await unifiedStorage.connect();
      BotsStore.instance = new BotsStore(unifiedStorage);
    }
    return BotsStore.instance;
  }
  
  /**
   * Get the singleton instance
   */
  static getInstance() {
    if (!BotsStore.instance) {
      throw new Error('BotsStore not initialized. Call BotsStore.initialize() first.');
    }
    return BotsStore.instance;
  }
  
  /**
   * Static methods for convenience
   */
  static async storeTicket(ticketData) {
    return BotsStore.getInstance().storeTicket(ticketData);
  }
  
  static async getTicketByTelegramMessageId(messageId) {
    return BotsStore.getInstance().getTicketByMessageId(messageId);
  }
  
  static async getTicketByConversationId(conversationId) {
    return BotsStore.getInstance().getTicketByConversationId(conversationId);
  }
  
  static async setUserState(telegramUserId, state) {
    return BotsStore.getInstance().storeUserState(telegramUserId, state);
  }
  
  static async getUserState(telegramUserId) {
    return BotsStore.getInstance().getUserState(telegramUserId);
  }
  
  static async clearUserState(telegramUserId) {
    return BotsStore.getInstance().clearUserState(telegramUserId);
  }

  // Static methods for customer operations
  static async storeCustomer(customerData) {
    return BotsStore.getInstance().storeCustomer(customerData);
  }

  static async getCustomerById(customerId) {
    return BotsStore.getInstance().getCustomerById(customerId);
  }

  static async getCustomerByChatId(chatId) {
    return BotsStore.getInstance().getCustomerByChatId(chatId);
  }

  // Static methods for user operations
  static async storeUser(userData) {
    return BotsStore.getInstance().storeUser(userData);
  }

  static async getUserByTelegramId(telegramUserId) {
    return BotsStore.getInstance().getUserByTelegramId(telegramUserId);
  }
  
  static async shutdown() {
    if (BotsStore.instance) {
      await BotsStore.instance.storage.disconnect();
      BotsStore.instance = null;
    }
  }
  
  /**
   * Store ticket data with bidirectional mapping
   * Creates multiple keys for different lookup patterns
   */
  async storeTicket(ticketData) {
    const {
      chatId,
      messageId,
      conversationId,
      ticketId,
      friendlyId,
      telegramUserId,
      createdAt
    } = ticketData;
    
    // Enhanced ticket data with metadata
    const enrichedTicketData = {
      ...ticketData,
      platform: 'telegram',
      storedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    try {
      // Store with multiple keys for different lookup patterns
      const promises = [
        // Primary lookup by Telegram message ID
        this.storage.set(`ticket:telegram:${messageId}`, enrichedTicketData),
        
        // Lookup by Unthread conversation ID
        this.storage.set(`ticket:unthread:${conversationId}`, enrichedTicketData),
        
        // Lookup by Unthread ticket ID (if different from conversation ID)
        ticketId !== conversationId ? 
          this.storage.set(`ticket:unthread:${ticketId}`, enrichedTicketData) : 
          Promise.resolve(true),
        
        // Lookup by friendly ID
        this.storage.set(`ticket:friendly:${friendlyId}`, enrichedTicketData),
        
        // Chat-specific mapping for listing tickets in a chat
        this.addToChatTickets(chatId, messageId, conversationId)
      ];
      
      await Promise.all(promises);
      console.log(`✅ Ticket stored: ${friendlyId} (${conversationId})`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store ticket:', error);
      return false;
    }
  }
  
  /**
   * Get ticket by Unthread conversation ID
   */
  async getTicketByConversationId(conversationId) {
    return await this.storage.get(`ticket:unthread:${conversationId}`);
  }
  
  /**
   * Get ticket by Telegram message ID
   */
  async getTicketByMessageId(messageId) {
    return await this.storage.get(`ticket:telegram:${messageId}`);
  }
  
  /**
   * Get ticket by friendly ID
   */
  async getTicketByFriendlyId(friendlyId) {
    return await this.storage.get(`ticket:friendly:${friendlyId}`);
  }
  
  /**
   * Get ticket by Unthread ticket ID
   */
  async getTicketByTicketId(ticketId) {
    return await this.storage.get(`ticket:unthread:${ticketId}`);
  }
  
  /**
   * Get all tickets for a specific chat
   */
  async getTicketsForChat(chatId) {
    const chatTickets = await this.storage.get(`chat:tickets:${chatId}`);
    if (!chatTickets) return [];
    
    // Get full ticket data for each ticket
    const ticketPromises = chatTickets.map(ticketInfo => 
      this.getTicketByConversationId(ticketInfo.conversationId)
    );
    
    const tickets = await Promise.all(ticketPromises);
    return tickets.filter(ticket => ticket !== null);
  }
  
  /**
   * Store user state for ongoing ticket creation
   */
  async storeUserState(telegramUserId, state) {
    return await this.storage.set(`user:state:${telegramUserId}`, {
      ...state,
      updatedAt: new Date().toISOString()
    });
  }
  
  /**
   * Get user state for ongoing ticket creation
   */
  async getUserState(telegramUserId) {
    return await this.storage.get(`user:state:${telegramUserId}`);
  }
  
  /**
   * Clear user state
   */
  async clearUserState(telegramUserId) {
    return await this.storage.delete(`user:state:${telegramUserId}`);
  }
  
  /**
   * Store customer mapping (Telegram chat to Unthread customer)
   */
  async storeCustomer(customerData) {
    const { chatId, unthreadCustomerId, chatTitle, customerName } = customerData;
    
    const enrichedCustomerData = {
      ...customerData,
      storedAt: new Date().toISOString(),
      platform: 'telegram'
    };
    
    try {
      await Promise.all([
        // Primary lookup by customer ID
        this.storage.set(`customer:id:${unthreadCustomerId}`, enrichedCustomerData),
        
        // Lookup by chat ID for quick access
        this.storage.set(`customer:telegram:${chatId}`, enrichedCustomerData)
      ]);
      
      console.log(`✅ Customer stored: ${customerName || chatTitle} (${unthreadCustomerId})`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store customer:', error);
      return false;
    }
  }

  /**
   * Get customer by Unthread customer ID (primary identifier)
   */
  async getCustomerById(customerId) {
    return await this.storage.get(`customer:id:${customerId}`);
  }

  /**
   * Get customer by Telegram chat ID
   */
  async getCustomerByChatId(chatId) {
    return await this.storage.get(`customer:telegram:${chatId}`);
  }

  /**
   * Store user information
   */
  async storeUser(userData) {
    const { telegramUserId, telegramUsername, unthreadName, unthreadEmail } = userData;
    
    const enrichedUserData = {
      ...userData,
      storedAt: new Date().toISOString(),
      platform: 'telegram'
    };
    
    try {
      // Primary lookup by Telegram user ID
      await this.storage.set(`user:telegram:${telegramUserId}`, enrichedUserData);
      
      console.log(`✅ User stored: ${unthreadName} (${telegramUserId})`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store user:', error);
      return false;
    }
  }

  /**
   * Get user by Telegram user ID (primary identifier)
   */
  async getUserByTelegramId(telegramUserId) {
    return await this.storage.get(`user:telegram:${telegramUserId}`);
  }

  /**
   * Get customer by Unthread customer ID (legacy method for backwards compatibility)
   */
  async getCustomerByUnthreadId(unthreadCustomerId) {
    // Try new format first, then fall back to old format
    const customer = await this.storage.get(`customer:id:${unthreadCustomerId}`);
    if (customer) return customer;
    
    return await this.storage.get(`customer:unthread:${unthreadCustomerId}`);
  }
  
  /**
   * Helper: Add ticket to chat's ticket list
   */
  async addToChatTickets(chatId, messageId, conversationId) {
    const key = `chat:tickets:${chatId}`;
    const existingTickets = await this.storage.get(key) || [];
    
    // Check if ticket already exists
    const ticketExists = existingTickets.some(t => t.conversationId === conversationId);
    if (!ticketExists) {
      existingTickets.push({
        messageId,
        conversationId,
        addedAt: new Date().toISOString()
      });
      
      await this.storage.set(key, existingTickets);
    }
  }
  
  /**
   * Delete ticket and all its mappings
   */
  async deleteTicket(conversationId) {
    try {
      // Get ticket data first to know all the keys to delete
      const ticket = await this.getTicketByConversationId(conversationId);
      if (!ticket) return true;
      
      const promises = [
        this.storage.delete(`ticket:telegram:${ticket.messageId}`),
        this.storage.delete(`ticket:unthread:${conversationId}`),
        this.storage.delete(`ticket:friendly:${ticket.friendlyId}`)
      ];
      
      if (ticket.ticketId !== conversationId) {
        promises.push(this.storage.delete(`ticket:unthread:${ticket.ticketId}`));
      }
      
      await Promise.all(promises);
      
      // Remove from chat tickets list
      await this.removeFromChatTickets(ticket.chatId, conversationId);
      
      console.log(`✅ Ticket deleted: ${ticket.friendlyId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete ticket:', error);
      return false;
    }
  }
  
  /**
   * Helper: Remove ticket from chat's ticket list
   */
  async removeFromChatTickets(chatId, conversationId) {
    const key = `chat:tickets:${chatId}`;
    const existingTickets = await this.storage.get(key) || [];
    
    const filteredTickets = existingTickets.filter(t => t.conversationId !== conversationId);
    await this.storage.set(key, filteredTickets);
  }
  
  /**
   * Get storage statistics
   */
  async getStats() {
    const storageStats = this.storage.getStats();
    
    return {
      ...storageStats,
      sdk: 'bots-brain',
      version: '1.0.0'
    };
  }
  
  /**
   * Store agent message data for reply tracking
   * This allows us to track when users reply to agent messages
   */
  async storeAgentMessage(agentMessageData) {
    const {
      messageId,      // Telegram message ID of the agent message
      conversationId, // Unthread conversation ID
      chatId,         // Telegram chat ID
      sentAt          // Timestamp when message was sent
    } = agentMessageData;
    
    const enrichedData = {
      ...agentMessageData,
      platform: 'telegram',
      type: 'agent_message',
      storedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    try {
      // Store agent message for reply lookup
      await this.storage.set(`agent_message:telegram:${messageId}`, enrichedData);
      
      console.log(`✅ Agent message stored: ${messageId} for conversation ${conversationId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to store agent message:', error);
      return false;
    }
  }
  
  /**
   * Get agent message data by Telegram message ID
   */
  async getAgentMessageByTelegramId(messageId) {
    return await this.storage.get(`agent_message:telegram:${messageId}`);
  }
  
  /**
   * Static methods for agent message tracking
   */
  static async storeAgentMessage(agentMessageData) {
    return BotsStore.getInstance().storeAgentMessage(agentMessageData);
  }
  
  static async getAgentMessageByTelegramId(messageId) {
    return BotsStore.getInstance().getAgentMessageByTelegramId(messageId);
  }
}
