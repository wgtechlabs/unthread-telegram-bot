/**
 * BotsStore - High-level bot storage operations
 * Provides bot-specific methods for storing and retrieving ticket data
 * Uses UnifiedStorage for multi-layer caching
 */
import { UnifiedStorage } from './UnifiedStorage.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import type { 
  TicketData, 
  UserState, 
  CustomerData, 
  UserData, 
  AgentMessageData, 
  TicketInfo,
  IBotsStore,
  StorageConfig
} from '../types.js';
import type { DatabaseConnection } from '../../database/connection.js';

export class BotsStore implements IBotsStore {
  private static instance: BotsStore | null = null;
  public storage: UnifiedStorage;
  
  constructor(unifiedStorage: UnifiedStorage) {
    this.storage = unifiedStorage;
  }
  
  /**
   * Initialize the BotsStore singleton with database connection
   */
  static async initialize(dbConnection: DatabaseConnection, platformRedisUrl?: string): Promise<BotsStore> {
    if (!BotsStore.instance) {
      const unifiedStorageConfig = {
        postgres: dbConnection.connectionPool, // Use the getter to access the pool
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
  static getInstance(): BotsStore {
    if (!BotsStore.instance) {
      throw new Error('BotsStore not initialized. Call BotsStore.initialize() first.');
    }
    return BotsStore.instance;
  }
  
  /**
   * Static methods for convenience
   */
  static async storeTicket(ticketData: TicketData): Promise<boolean> {
    return BotsStore.getInstance().storeTicket(ticketData);
  }
  
  static async getTicketByTelegramMessageId(messageId: number): Promise<TicketData | null> {
    return BotsStore.getInstance().getTicketByMessageId(messageId);
  }
  
  static async getTicketByConversationId(conversationId: string): Promise<TicketData | null> {
    return BotsStore.getInstance().getTicketByConversationId(conversationId);
  }
  
  static async setUserState(telegramUserId: number, state: UserState): Promise<boolean> {
    return BotsStore.getInstance().storeUserState(telegramUserId, state);
  }
  
  static async getUserState(telegramUserId: number): Promise<UserState | null> {
    return BotsStore.getInstance().getUserState(telegramUserId);
  }
  
  static async clearUserState(telegramUserId: number): Promise<boolean> {
    return BotsStore.getInstance().clearUserState(telegramUserId);
  }

  // Static methods for customer operations
  static async storeCustomer(customerData: CustomerData): Promise<boolean> {
    return BotsStore.getInstance().storeCustomer(customerData);
  }

  static async getCustomerById(customerId: string): Promise<CustomerData | null> {
    return BotsStore.getInstance().getCustomerById(customerId);
  }

  static async getCustomerByChatId(chatId: number): Promise<CustomerData | null> {
    return BotsStore.getInstance().getCustomerByChatId(chatId);
  }

  // Static methods for user operations
  static async storeUser(userData: UserData): Promise<boolean> {
    return BotsStore.getInstance().storeUser(userData);
  }

  static async getUserByTelegramId(telegramUserId: number): Promise<UserData | null> {
    return BotsStore.getInstance().getUserByTelegramId(telegramUserId);
  }
  
  static async shutdown(): Promise<void> {
    if (BotsStore.instance) {
      await BotsStore.instance.storage.disconnect();
      BotsStore.instance = null;
    }
  }
  
  /**
   * Store ticket data with bidirectional mapping
   * Creates multiple keys for different lookup patterns
   */
  async storeTicket(ticketData: TicketData): Promise<boolean> {
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
    const enrichedTicketData: TicketData = {
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
          Promise.resolve(),
        
        // Lookup by friendly ID
        this.storage.set(`ticket:friendly:${friendlyId}`, enrichedTicketData),
        
        // Chat-specific mapping for listing tickets in a chat
        this.addToChatTickets(chatId, messageId, conversationId)
      ];
      
      await Promise.all(promises);
      LogEngine.info(`Ticket stored: ${friendlyId} (${conversationId})`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store ticket', {
        error: err.message,
        stack: err.stack
      });
      return false;
    }
  }
  
  /**
   * Get ticket by Unthread conversation ID
   */
  async getTicketByConversationId(conversationId: string): Promise<TicketData | null> {
    return await this.storage.get(`ticket:unthread:${conversationId}`);
  }
  
  /**
   * Get ticket by Telegram message ID
   */
  async getTicketByMessageId(messageId: number): Promise<TicketData | null> {
    return await this.storage.get(`ticket:telegram:${messageId}`);
  }
  
  /**
   * Get ticket by friendly ID
   */
  async getTicketByFriendlyId(friendlyId: string): Promise<TicketData | null> {
    return await this.storage.get(`ticket:friendly:${friendlyId}`);
  }
  
  /**
   * Get ticket by Unthread ticket ID
   */
  async getTicketByTicketId(ticketId: string): Promise<TicketData | null> {
    return await this.storage.get(`ticket:unthread:${ticketId}`);
  }
  
  /**
   * Get all tickets for a specific chat
   */
  async getTicketsForChat(chatId: number): Promise<TicketData[]> {
    const chatTickets: TicketInfo[] = await this.storage.get(`chat:tickets:${chatId}`) || [];
    
    // Get full ticket data for each ticket
    const ticketPromises = chatTickets.map(ticketInfo => 
      this.getTicketByConversationId(ticketInfo.conversationId)
    );
    
    const tickets = await Promise.all(ticketPromises);
    return tickets.filter((ticket): ticket is TicketData => ticket !== null);
  }
  
  /**
   * Store user state for ongoing ticket creation
   */
  async storeUserState(telegramUserId: number, state: UserState): Promise<boolean> {
    try {
      const stateData = {
        ...state,
        updatedAt: new Date().toISOString()
      };
      
      LogEngine.debug('Storing user state', {
        telegramUserId,
        key: `user:state:${telegramUserId}`,
        state: JSON.stringify(stateData)
      });
      
      await this.storage.set(`user:state:${telegramUserId}`, stateData);
      
      LogEngine.debug('User state stored successfully', { telegramUserId });
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store user state', {
        error: err.message,
        stack: err.stack,
        telegramUserId
      });
      return false;
    }
  }
  
  /**
   * Get user state for ongoing ticket creation
   */
  async getUserState(telegramUserId: number): Promise<UserState | null> {
    try {
      LogEngine.debug('Getting user state', {
        telegramUserId,
        key: `user:state:${telegramUserId}`
      });
      
      const state = await this.storage.get(`user:state:${telegramUserId}`);
      
      LogEngine.debug('User state retrieved', {
        telegramUserId,
        found: !!state,
        state: state ? JSON.stringify(state) : 'null'
      });
      
      return state;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to get user state', {
        error: err.message,
        stack: err.stack,
        telegramUserId
      });
      return null;
    }
  }
  
  /**
   * Clear user state
   */
  async clearUserState(telegramUserId: number): Promise<boolean> {
    try {
      await this.storage.delete(`user:state:${telegramUserId}`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to clear user state', {
        error: err.message,
        telegramUserId
      });
      return false;
    }
  }
  
  /**
   * Store customer mapping (Telegram chat to Unthread customer)
   */
  async storeCustomer(customerData: CustomerData): Promise<boolean> {
    const { telegramChatId, unthreadCustomerId, name, company } = customerData;
    
    const enrichedCustomerData: CustomerData = {
      ...customerData,
      createdAt: customerData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    try {
      await Promise.all([
        // Primary lookup by customer ID
        this.storage.set(`customer:id:${unthreadCustomerId}`, enrichedCustomerData),
        
        // Lookup by chat ID for quick access
        this.storage.set(`customer:telegram:${telegramChatId}`, enrichedCustomerData)
      ]);
      
      LogEngine.info(`Customer stored: ${name || company} (${unthreadCustomerId})`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store customer', {
        error: err.message,
        stack: err.stack
      });
      return false;
    }
  }

  /**
   * Get customer by Unthread customer ID (primary identifier)
   */
  async getCustomerById(customerId: string): Promise<CustomerData | null> {
    return await this.storage.get(`customer:id:${customerId}`);
  }

  /**
   * Get customer by Telegram chat ID
   */
  async getCustomerByChatId(chatId: number): Promise<CustomerData | null> {
    return await this.storage.get(`customer:telegram:${chatId}`);
  }

  /**
   * Store user information
   */
  async storeUser(userData: UserData): Promise<boolean> {
    const { telegramUserId, username, firstName, lastName } = userData;
    
    const enrichedUserData: UserData = {
      ...userData,
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    try {
      // Primary lookup by Telegram user ID
      await this.storage.set(`user:telegram:${telegramUserId}`, enrichedUserData);
      
      LogEngine.info(`User stored: ${firstName} ${lastName || ''} (${telegramUserId})`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store user', {
        error: err.message,
        telegramUserId
      });
      return false;
    }
  }

  /**
   * Get user by Telegram user ID (primary identifier)
   */
  async getUserByTelegramId(telegramUserId: number): Promise<UserData | null> {
    return await this.storage.get(`user:telegram:${telegramUserId}`);
  }

  /**
   * Get customer by Unthread customer ID (legacy method for backwards compatibility)
   */
  async getCustomerByUnthreadId(unthreadCustomerId: string): Promise<CustomerData | null> {
    // Try new format first, then fall back to old format
    const customer = await this.storage.get(`customer:id:${unthreadCustomerId}`);
    if (customer) return customer;
    
    return await this.storage.get(`customer:unthread:${unthreadCustomerId}`);
  }

  /**
   * Get or create customer for chat ID with proper cache hierarchy
   */
  async getOrCreateCustomer(
    chatId: number, 
    chatTitle: string, 
    createCustomerFn: (title: string) => Promise<{ id: string }>
  ): Promise<CustomerData> {
    try {
      // Step 1: Try to get existing customer (uses cache hierarchy automatically)
      const existingCustomer = await this.getCustomerByChatId(chatId);
      
      if (existingCustomer) {
        LogEngine.info(`Found existing customer for chat ${chatId}: ${existingCustomer.unthreadCustomerId}`);
        return existingCustomer;
      }
      
      // Step 2: Customer not found, create new one
      LogEngine.info(`Creating new customer for chat ${chatId}: ${chatTitle}`);
      const newCustomerResponse = await createCustomerFn(chatTitle);
      const unthreadCustomerId = newCustomerResponse.id;
      
      // Step 3: Store new customer (populates all cache layers)
      const customerData: CustomerData = {
        id: unthreadCustomerId,
        unthreadCustomerId,
        telegramChatId: chatId,
        company: chatTitle,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await this.storeCustomer(customerData);
      
      LogEngine.info(`Created and cached new customer: ${unthreadCustomerId}`);
      return customerData;
      
    } catch (error) {
      const err = error as Error;
      LogEngine.error(`Error in getOrCreateCustomer for chat ${chatId}`, {
        error: err.message,
        stack: err.stack
      });
      throw error;
    }
  }

  /**
   * Check if customer exists in cache (fast check without creating)
   */
  async hasCustomer(chatId: number): Promise<boolean> {
    try {
      const customer = await this.getCustomerByChatId(chatId);
      return !!customer;
    } catch (error) {
      const err = error as Error;
      LogEngine.error(`Error checking customer existence for chat ${chatId}`, {
        error: err.message,
        stack: err.stack
      });
      return false;
    }
  }

  /**
   * Helper: Add ticket to chat's ticket list
   */
  private async addToChatTickets(chatId: number, messageId: number, conversationId: string): Promise<void> {
    const key = `chat:tickets:${chatId}`;
    const existingTickets: TicketInfo[] = await this.storage.get(key) || [];
    
    // Check if ticket already exists
    const ticketExists = existingTickets.some(t => t.conversationId === conversationId);
    if (!ticketExists) {
      existingTickets.push({
        messageId,
        conversationId,
        friendlyId: '', // Will be filled from ticket data if needed
      });
      
      await this.storage.set(key, existingTickets);
    }
  }
  
  /**
   * Delete ticket and all its mappings
   */
  async deleteTicket(conversationId: string): Promise<boolean> {
    try {
      // Get ticket data first to know all the keys to delete
      const ticket = await this.getTicketByConversationId(conversationId);
      if (!ticket) return true;
      
      const promises = [
        this.storage.delete(`ticket:telegram:${ticket.messageId}`),
        this.storage.delete(`ticket:unthread:${conversationId}`),
        this.storage.delete(`ticket:friendly:${ticket.friendlyId}`)
      ];
      
      if (ticket.ticketId && ticket.ticketId !== conversationId) {
        promises.push(this.storage.delete(`ticket:unthread:${ticket.ticketId}`));
      }
      
      await Promise.all(promises);
      
      // Remove from chat tickets list
      await this.removeFromChatTickets(ticket.chatId, conversationId);
      
      LogEngine.info(`Ticket deleted: ${ticket.friendlyId}`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to delete ticket', {
        error: err.message,
        stack: err.stack
      });
      return false;
    }
  }
  
  /**
   * Helper: Remove ticket from chat's ticket list
   */
  private async removeFromChatTickets(chatId: number, conversationId: string): Promise<void> {
    const key = `chat:tickets:${chatId}`;
    const existingTickets: TicketInfo[] = await this.storage.get(key) || [];
    
    const filteredTickets = existingTickets.filter(t => t.conversationId !== conversationId);
    await this.storage.set(key, filteredTickets);
  }
  
  /**
   * Store agent message data for reply tracking
   */
  async storeAgentMessage(agentMessageData: AgentMessageData): Promise<boolean> {
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
      
      LogEngine.info(`Agent message stored: ${messageId} for conversation ${conversationId}`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store agent message', {
        error: err.message,
        stack: err.stack,
        messageId,
        conversationId
      });
      return false;
    }
  }
  
  /**
   * Get agent message data by Telegram message ID
   */
  async getAgentMessage(messageId: number): Promise<AgentMessageData | null> {
    return await this.storage.get(`agent_message:telegram:${messageId}`);
  }
  
  /**
   * Static methods for agent message tracking
   */
  static async storeAgentMessage(agentMessageData: AgentMessageData): Promise<boolean> {
    return BotsStore.getInstance().storeAgentMessage(agentMessageData);
  }
  
  static async getAgentMessageByTelegramId(messageId: number): Promise<AgentMessageData | null> {
    return BotsStore.getInstance().getAgentMessage(messageId);
  }

  // Static methods for cache-aware customer management
  static async getOrCreateCustomer(
    chatId: number, 
    chatTitle: string, 
    createCustomerFn: (title: string) => Promise<{ id: string }>
  ): Promise<CustomerData> {
    return BotsStore.getInstance().getOrCreateCustomer(chatId, chatTitle, createCustomerFn);
  }

  static async hasCustomer(chatId: number): Promise<boolean> {
    return BotsStore.getInstance().hasCustomer(chatId);
  }

  static async getCustomerCacheStats(): Promise<any> {
    const instance = BotsStore.getInstance();
    const storageStats = instance.storage.getStats();
    
    return {
      ...storageStats,
      cacheHierarchy: 'Memory → Redis → PostgreSQL',
      sdkVersion: 'bots-brain-1.0.0'
    };
  }

  // Memory inspection methods
  static async getMemoryStats(): Promise<any> {
    return BotsStore.getInstance().storage.getMemoryStats();
  }

  static async getMemoryContents(): Promise<any> {
    return BotsStore.getInstance().storage.getMemoryContents();
  }

  static async getMemoryContentsByPattern(pattern: string): Promise<any> {
    const allContents = BotsStore.getInstance().storage.getMemoryContents();
    return allContents.filter((entry: any) => entry.key.includes(pattern));
  }

  static async cleanupExpiredMemory(): Promise<number> {
    return BotsStore.getInstance().storage.cleanupExpiredMemory();
  }
}
