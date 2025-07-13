/**
 * Unthread Telegram Bot - Bots Brain BotsStore
 * 
 * High-level storage operations specifically designed for bot applications.
 * Provides bot-centric methods for storing and retrieving conversation data,
 * user states, and ticket information using the UnifiedStorage multi-layer architecture.
 * 
 * Core Features:
 * - Ticket data storage and retrieval with conversation threading
 * - User state management for multi-step workflows
 * - Customer profile persistence and lookup
 * - Agent message storage and conversation history
 * - Automatic data expiration and cleanup
 * 
 * Storage Operations:
 * - Ticket creation and status tracking
 * - User conversation state persistence
 * - Customer profile management
 * - Message history and threading
 * - Form data collection and validation
 * Performance:
 * - Multi-layer caching for optimal performance
 * - Automatic fallback between storage layers
 * - Memory cache for frequently accessed data
 * - Redis for distributed caching across instances
 * - PostgreSQL for permanent data persistence
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */
import { UnifiedStorage } from './UnifiedStorage.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import { z } from 'zod';
import type { 
  TicketData, 
  UserState, 
  CustomerData, 
  UserData, 
  AgentMessageData, 
  TicketInfo,
  GroupConfig,
  SetupState,
  AdminProfile,
  SetupSession,
  DmSetupSession,
  IBotsStore,
  StorageConfig
} from '../types.js';
import type { DatabaseConnection } from '../../database/connection.js';

// Zod schemas for runtime validation
const GroupConfigSchema = z.object({
  chatId: z.number(),
  chatTitle: z.string().optional(),
  isConfigured: z.boolean(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  setupBy: z.number().optional(),
  setupAt: z.string().optional(),
  botIsAdmin: z.boolean(),
  lastAdminCheck: z.string().optional(),
  setupVersion: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  // Additional fields that might be added during storage
  lastUpdatedAt: z.string().optional(),
  version: z.string().optional()
});

const SetupStateSchema = z.object({
  chatId: z.number(),
  step: z.enum(['bot_admin_check', 'customer_selection', 'customer_creation', 'customer_linking', 'complete']),
  initiatedBy: z.number(),
  startedAt: z.string(),
  suggestedCustomerName: z.string().optional(),
  userInput: z.string().optional(),
  retryCount: z.number().optional(),
  metadata: z.record(z.any()).optional(),
  // Additional fields that might be added during storage
  lastUpdatedAt: z.string().optional(),
  version: z.string().optional()
});

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

  static async updateUser(telegramUserId: number, updates: Partial<UserData>): Promise<boolean> {
    return BotsStore.getInstance().updateUser(telegramUserId, updates);
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
        this.storage.set(`ticket:telegram:${messageId}`, JSON.stringify(enrichedTicketData)),
        
        // Lookup by Unthread conversation ID
        this.storage.set(`ticket:unthread:${conversationId}`, JSON.stringify(enrichedTicketData)),
        
        // Lookup by Unthread ticket ID (if different from conversation ID)
        ticketId !== conversationId ? 
          this.storage.set(`ticket:unthread:${ticketId}`, JSON.stringify(enrichedTicketData)) : 
          Promise.resolve(),
        
        // Lookup by friendly ID
        this.storage.set(`ticket:friendly:${friendlyId}`, JSON.stringify(enrichedTicketData)),
        
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
    const data = await this.storage.get(`ticket:unthread:${conversationId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  }
  
  /**
   * Get ticket by Telegram message ID
   */
  async getTicketByMessageId(messageId: number): Promise<TicketData | null> {
    const data = await this.storage.get(`ticket:telegram:${messageId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  }
  
  /**
   * Get ticket by friendly ID
   */
  async getTicketByFriendlyId(friendlyId: string): Promise<TicketData | null> {
    const data = await this.storage.get(`ticket:friendly:${friendlyId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  }
  
  /**
   * Get ticket by Unthread ticket ID
   */
  async getTicketByTicketId(ticketId: string): Promise<TicketData | null> {
    const data = await this.storage.get(`ticket:unthread:${ticketId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  }
  
  /**
   * Get all tickets for a specific chat
   */
  async getTicketsForChat(chatId: number): Promise<TicketData[]> {
    const data = await this.storage.get(`chat:tickets:${chatId}`);
    const chatTickets: TicketInfo[] = data ? (typeof data === 'string' ? JSON.parse(data) : data) : [];
    
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
      
      await this.storage.set(`user:state:${telegramUserId}`, JSON.stringify(stateData));
      
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
      const parsedState = state ? (typeof state === 'string' ? JSON.parse(state) : state) : null;
      
      LogEngine.debug('User state retrieved', {
        telegramUserId,
        found: !!parsedState,
        state: parsedState ? JSON.stringify(parsedState) : 'null'
      });
      
      return parsedState;
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
        this.storage.set(`customer:id:${unthreadCustomerId}`, JSON.stringify(enrichedCustomerData)),
        
        // Lookup by chat ID for quick access
        this.storage.set(`customer:telegram:${telegramChatId}`, JSON.stringify(enrichedCustomerData))
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
    const data = await this.storage.get(`customer:id:${customerId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  }

  /**
   * Get customer by Telegram chat ID
   */
  async getCustomerByChatId(chatId: number): Promise<CustomerData | null> {
    const data = await this.storage.get(`customer:telegram:${chatId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
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
      await this.storage.set(`user:telegram:${telegramUserId}`, JSON.stringify(enrichedUserData));
      
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
    const data = await this.storage.get(`user:telegram:${telegramUserId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  }

  /**
   * Update user data for a specific Telegram user ID
   */
  async updateUser(telegramUserId: number, updates: Partial<UserData>): Promise<boolean> {
    try {
      // Get existing user data
      const existingUser = await this.getUserByTelegramId(telegramUserId);
      if (!existingUser) {
        LogEngine.warn('Cannot update non-existent user', { telegramUserId });
        return false;
      }

      // Merge updates with existing data
      const updatedUserData: UserData = {
        ...existingUser,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // Store updated user data
      await this.storage.set(`user:telegram:${telegramUserId}`, JSON.stringify(updatedUserData));
      
      LogEngine.info('User updated successfully', {
        telegramUserId,
        updatedFields: Object.keys(updates),
        unthreadEmail: updatedUserData.unthreadEmail
      });
      
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to update user', {
        error: err.message,
        telegramUserId,
        updates
      });
      return false;
    }
  }

  /**
   * Get customer by Unthread customer ID (legacy method for backwards compatibility)
   */
  async getCustomerByUnthreadId(unthreadCustomerId: string): Promise<CustomerData | null> {
    // Try new format first, then fall back to old format
    const customer = await this.storage.get(`customer:id:${unthreadCustomerId}`);
    if (customer) {
      return typeof customer === 'string' ? JSON.parse(customer) : customer;
    }
    
    const fallbackData = await this.storage.get(`customer:unthread:${unthreadCustomerId}`);
    return fallbackData ? (typeof fallbackData === 'string' ? JSON.parse(fallbackData) : fallbackData) : null;
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
    const data = await this.storage.get(key);
    const existingTickets: TicketInfo[] = data ? (typeof data === 'string' ? JSON.parse(data) : data) : [];
    
    // Check if ticket already exists
    const ticketExists = existingTickets.some(t => t.conversationId === conversationId);
    if (!ticketExists) {
      existingTickets.push({
        messageId,
        conversationId,
        friendlyId: '', // Will be filled from ticket data if needed
      });
      
      await this.storage.set(key, JSON.stringify(existingTickets));
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
    const data = await this.storage.get(key);
    const existingTickets: TicketInfo[] = data ? (typeof data === 'string' ? JSON.parse(data) : data) : [];
    
    const filteredTickets = existingTickets.filter(t => t.conversationId !== conversationId);
    await this.storage.set(key, JSON.stringify(filteredTickets));
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
      await this.storage.set(`agent_message:telegram:${messageId}`, JSON.stringify(enrichedData));
      
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
    const data = await this.storage.get(`agent_message:telegram:${messageId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
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

  // ===========================================
  // GROUP CONFIGURATION OPERATIONS
  // ===========================================

  /**
   * Store group configuration data
   */
  async storeGroupConfig(config: GroupConfig): Promise<boolean> {
    try {
      const key = `group_config:${config.chatId}`;
      const configData = {
        ...config,
        lastUpdatedAt: new Date().toISOString(),
        version: '1.0'
      };

      await this.storage.set(key, JSON.stringify(configData));
      
      LogEngine.info('Group configuration stored successfully', {
        chatId: config.chatId,
        isConfigured: config.isConfigured,
        customerId: config.customerId,
        setupBy: config.setupBy
      });

      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store group configuration', {
        error: err.message,
        chatId: config.chatId,
        setupBy: config.setupBy
      });
      return false;
    }
  }

  /**
   * Retrieve group configuration by chat ID
   */
  async getGroupConfig(chatId: number): Promise<GroupConfig | null> {
    try {
      const key = `group_config:${chatId}`;
      const data = await this.storage.get(key);
      
      if (!data) {
        LogEngine.debug('No group configuration found', { chatId });
        return null;
      }

      const config = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Validate the data structure using zod schema
      const validationResult = GroupConfigSchema.safeParse(config);
      if (!validationResult.success) {
        LogEngine.error('Invalid group configuration data structure', {
          chatId,
          errors: validationResult.error.issues,
          rawData: config
        });
        return null;
      }
      
      LogEngine.debug('Group configuration retrieved successfully', {
        chatId,
        isConfigured: validationResult.data.isConfigured,
        customerId: validationResult.data.customerId
      });

      return validationResult.data as GroupConfig;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to retrieve group configuration', {
        error: err.message,
        chatId
      });
      return null;
    }
  }

  /**
   * Update group configuration with partial data
   */
  async updateGroupConfig(chatId: number, updates: Partial<GroupConfig>): Promise<boolean> {
    try {
      const existingConfig = await this.getGroupConfig(chatId);
      
      if (!existingConfig) {
        LogEngine.warn('Cannot update non-existent group configuration', { chatId });
        return false;
      }

      // Exclude immutable fields from updates
      const safeUpdates = BotsStore.excludeImmutableFields(updates, ['chatId', 'customerId']);

      const updatedConfig: GroupConfig = {
        ...existingConfig,
        ...safeUpdates
      };

      const success = await this.storeGroupConfig(updatedConfig);
      
      if (success) {
        LogEngine.info('Group configuration updated successfully', {
          chatId,
          updatedFields: Object.keys(updates)
        });
      }

      return success;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to update group configuration', {
        error: err.message,
        chatId,
        updates
      });
      return false;
    }
  }

  /**
   * Delete group configuration
   */
  async deleteGroupConfig(chatId: number): Promise<boolean> {
    try {
      const key = `group_config:${chatId}`;
      await this.storage.delete(key);
      
      LogEngine.info('Group configuration deleted successfully', { chatId });
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to delete group configuration', {
        error: err.message,
        chatId
      });
      return false;
    }
  }

  // Batch group configuration operations
  async storeGroupConfigs(configs: GroupConfig[]): Promise<boolean> {
    try {
      const results = await Promise.all(configs.map(config => this.storeGroupConfig(config)));
      return results.every(result => result === true);
    } catch (error) {
      LogEngine.error('Failed to store group configurations', { error: (error as Error).message });
      return false;
    }
  }

  async getGroupConfigs(chatIds: number[]): Promise<(GroupConfig | null)[]> {
    try {
      return await Promise.all(chatIds.map(chatId => this.getGroupConfig(chatId)));
    } catch (error) {
      LogEngine.error('Failed to get group configurations', { error: (error as Error).message });
      return chatIds.map(() => null);
    }
  }

  async updateGroupConfigs(updates: {chatId: number, updates: Partial<GroupConfig>}[]): Promise<boolean> {
    try {
      const results = await Promise.all(updates.map(update => this.updateGroupConfig(update.chatId, update.updates)));
      return results.every(result => result === true);
    } catch (error) {
      LogEngine.error('Failed to update group configurations', { error: (error as Error).message });
      return false;
    }
  }

  async deleteGroupConfigs(chatIds: number[]): Promise<boolean> {
    try {
      const results = await Promise.all(chatIds.map(chatId => this.deleteGroupConfig(chatId)));
      return results.every(result => result === true);
    } catch (error) {
      LogEngine.error('Failed to delete group configurations', { error: (error as Error).message });
      return false;
    }
  }

  // ===========================================
  // GLOBAL CONFIGURATION OPERATIONS
  // ===========================================

  /**
   * Get global configuration value by key
   */
  async getGlobalConfig(key: string): Promise<any | null> {
    try {
      const globalKey = `global_config:${key}`;
      const data = await this.storage.get(globalKey);
      
      if (!data) {
        LogEngine.debug('No global configuration found', { key });
        return null;
      }

      return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to get global configuration', {
        error: err.message,
        key
      });
      return null;
    }
  }

  /**
   * Set global configuration value by key
   */
  async setGlobalConfig(key: string, value: any): Promise<boolean> {
    try {
      const globalKey = `global_config:${key}`;
      const dataToStore = typeof value === 'object' ? JSON.stringify(value) : value;
      
      await this.storage.set(globalKey, dataToStore);
      
      LogEngine.info('Global configuration saved successfully', { key });
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to set global configuration', {
        error: err.message,
        key
      });
      return false;
    }
  }

  /**
   * Delete global configuration by key
   */
  async deleteGlobalConfig(key: string): Promise<boolean> {
    try {
      const globalKey = `global_config:${key}`;
      await this.storage.delete(globalKey);
      
      LogEngine.info('Global configuration deleted successfully', { key });
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to delete global configuration', {
        error: err.message,
        key
      });
      return false;
    }
  }

  // ===========================================
  // SETUP STATE OPERATIONS
  // ===========================================

  /**
   * Store setup state for ongoing setup processes
   */
  async storeSetupState(state: SetupState): Promise<boolean> {
    try {
      const key = `setup_state:${state.chatId}`;
      const stateData = {
        ...state,
        lastUpdatedAt: new Date().toISOString(),
        version: '1.0'
      };

      // Set TTL for setup states (1 hour) to prevent stale states
      await this.storage.set(key, JSON.stringify(stateData), 3600);
      
      LogEngine.info('Setup state stored successfully', {
        chatId: state.chatId,
        step: state.step,
        initiatedBy: state.initiatedBy
      });

      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store setup state', {
        error: err.message,
        chatId: state.chatId,
        step: state.step
      });
      return false;
    }
  }

  /**
   * Retrieve setup state by chat ID
   */
  async getSetupState(chatId: number): Promise<SetupState | null> {
    try {
      const key = `setup_state:${chatId}`;
      const data = await this.storage.get(key);
      
      if (!data) {
        LogEngine.debug('No setup state found', { chatId });
        return null;
      }

      const state = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Validate the data structure using zod schema
      const validationResult = SetupStateSchema.safeParse(state);
      if (!validationResult.success) {
        LogEngine.error('Invalid setup state data structure', {
          chatId,
          errors: validationResult.error.issues,
          rawData: state
        });
        return null;
      }
      
      LogEngine.debug('Setup state retrieved successfully', {
        chatId,
        step: validationResult.data.step,
        initiatedBy: validationResult.data.initiatedBy
      });

      return validationResult.data as SetupState;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to retrieve setup state', {
        error: err.message,
        chatId
      });
      return null;
    }
  }

  /**
   * Update setup state with partial data
   */
  async updateSetupState(chatId: number, updates: Partial<SetupState>): Promise<boolean> {
    try {
      const existingState = await this.getSetupState(chatId);
      
      if (!existingState) {
        LogEngine.warn('Cannot update non-existent setup state', { chatId });
        return false;
      }

      // Exclude immutable fields from updates
      const safeUpdates = BotsStore.excludeImmutableFields(updates, ['chatId']);

      const updatedState: SetupState = {
        ...existingState,
        ...safeUpdates
      } as SetupState;

      const success = await this.storeSetupState(updatedState);
      
      if (success) {
        LogEngine.info('Setup state updated successfully', {
          chatId,
          newStep: updatedState.step,
          updatedFields: Object.keys(updates)
        });
      }

      return success;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to update setup state', {
        error: err.message,
        chatId,
        updates
      });
      return false;
    }
  }

  /**
   * Clear setup state (delete)
   */
  async clearSetupState(chatId: number): Promise<boolean> {
    try {
      const key = `setup_state:${chatId}`;
      await this.storage.delete(key);
      
      LogEngine.info('Setup state cleared successfully', { chatId });
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to clear setup state', {
        error: err.message,
        chatId
      });
      return false;
    }
  }

  // Batch setup state operations
  async storeSetupStates(states: SetupState[]): Promise<boolean> {
    try {
      const results = await Promise.all(states.map(state => this.storeSetupState(state)));
      return results.every(result => result === true);
    } catch (error) {
      LogEngine.error('Failed to store setup states', { error: (error as Error).message });
      return false;
    }
  }

  async getSetupStates(chatIds: number[]): Promise<(SetupState | null)[]> {
    try {
      return await Promise.all(chatIds.map(chatId => this.getSetupState(chatId)));
    } catch (error) {
      LogEngine.error('Failed to get setup states', { error: (error as Error).message });
      return chatIds.map(() => null);
    }
  }

  async updateSetupStates(updates: {chatId: number, updates: Partial<SetupState>}[]): Promise<boolean> {
    try {
      const results = await Promise.all(updates.map(update => this.updateSetupState(update.chatId, update.updates)));
      return results.every(result => result === true);
    } catch (error) {
      LogEngine.error('Failed to update setup states', { error: (error as Error).message });
      return false;
    }
  }

  async clearSetupStates(chatIds: number[]): Promise<boolean> {
    try {
      const results = await Promise.all(chatIds.map(chatId => this.clearSetupState(chatId)));
      return results.every(result => result === true);
    } catch (error) {
      LogEngine.error('Failed to clear setup states', { error: (error as Error).message });
      return false;
    }
  }

  // =====================================================================
  // Admin Profile Operations
  // =====================================================================

  /**
   * Store admin profile data with ID tracking
   */
  async storeAdminProfile(adminData: AdminProfile): Promise<boolean> {
    try {
      const enrichedData = {
        ...adminData,
        platform: 'telegram',
        type: 'admin_profile',
        storedAt: new Date().toISOString(),
        version: '1.0'
      };

      await this.storage.set(`admin:profile:${adminData.telegramUserId}`, JSON.stringify(enrichedData));
      
      // Track admin ID in list for retrieval
      const adminIdsKey = 'admin_profile_ids';
      const existingIds = await this.getArrayFromStorage(adminIdsKey);
      if (!existingIds.includes(adminData.telegramUserId)) {
        existingIds.push(adminData.telegramUserId);
        await this.storage.set(adminIdsKey, JSON.stringify(existingIds));
      }
      
      LogEngine.info(`Admin profile stored: ${adminData.telegramUserId}`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store admin profile', {
        error: err.message,
        telegramUserId: adminData.telegramUserId
      });
      return false;
    }
  }

  /**
   * Get admin profile by Telegram user ID
   */
  async getAdminProfile(telegramUserId: number): Promise<AdminProfile | null> {
    const data = await this.storage.get(`admin:profile:${telegramUserId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  }

  /**
   * Update admin profile
   */
  async updateAdminProfile(telegramUserId: number, updates: Partial<AdminProfile>): Promise<boolean> {
    try {
      const existing = await this.getAdminProfile(telegramUserId);
      if (!existing) return false;

      const updated = {
        ...existing,
        ...updates,
        lastActiveAt: new Date().toISOString()
      };

      return await this.storeAdminProfile(updated);
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to update admin profile', {
        error: err.message,
        telegramUserId
      });
      return false;
    }
  }

  /**
   * Delete admin profile
   */
  async deleteAdminProfile(telegramUserId: number): Promise<boolean> {
    try {
      await this.storage.delete(`admin:profile:${telegramUserId}`);
      
      // Remove from admin IDs list
      const adminIdsKey = 'admin_profile_ids';
      const existingIds = await this.getArrayFromStorage(adminIdsKey);
      const updatedIds = existingIds.filter((id: number) => id !== telegramUserId);
      await this.storage.set(adminIdsKey, JSON.stringify(updatedIds));
      
      LogEngine.info(`Admin profile deleted: ${telegramUserId}`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to delete admin profile', {
        error: err.message,
        telegramUserId
      });
      return false;
    }
  }

  /**
   * Get all admin profiles
   */
  async getAllAdminProfiles(): Promise<AdminProfile[]> {
    try {
      // Since there's no listKeys method, we'll track admin IDs separately
      const adminIdsKey = 'admin_profile_ids';
      const adminIds = await this.getArrayFromStorage(adminIdsKey);
      
      const profiles: AdminProfile[] = [];
      for (const adminId of adminIds) {
        const profile = await this.getAdminProfile(adminId);
        if (profile) {
          profiles.push(profile);
        }
      }
      
      return profiles;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to get all admin profiles', {
        error: err.message
      });
      return [];
    }
  }

  // =====================================================================
  // Setup Session Operations
  // =====================================================================

  /**
   * Store setup session data
   */
  async storeSetupSession(sessionData: SetupSession): Promise<boolean> {
    try {
      const enrichedData = {
        ...sessionData,
        platform: 'telegram',
        type: 'setup_session',
        storedAt: new Date().toISOString(),
        version: '1.0'
      };

      // Store by session ID
      await this.storage.set(`session:setup:${sessionData.sessionId}`, JSON.stringify(enrichedData), 600); // 10 minutes TTL

      // Store admin -> session mapping for blocking
      await this.storage.set(`session:admin:${sessionData.initiatingAdminId}`, sessionData.sessionId, 600);

      // Store group -> session mapping for getActiveSetupSessionByGroup
      if (sessionData.groupChatId) {
        await this.storage.set(`session:group:${sessionData.groupChatId}`, sessionData.sessionId, 600);
      }

      LogEngine.info(`Setup session stored: ${sessionData.sessionId}`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store setup session', {
        error: err.message,
        sessionId: sessionData.sessionId
      });
      return false;
    }
  }

  /**
   * Get setup session by session ID
   */
  async getSetupSession(sessionId: string): Promise<SetupSession | null> {
    const data = await this.storage.get(`session:setup:${sessionId}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  }

  /**
   * Get active setup session for admin (for blocking)
   */
  async getActiveSetupSessionByAdmin(adminId: number): Promise<SetupSession | null> {
    const sessionId = await this.storage.get(`session:admin:${adminId}`);
    if (!sessionId) return null;

    return await this.getSetupSession(sessionId);
  }

  /**
   * Get active setup session for group (for blocking)
   */
  async getActiveSetupSessionByGroup(groupChatId: number): Promise<SetupSession | null> {
    const sessionId = await this.storage.get(`session:group:${groupChatId}`);
    if (!sessionId) return null;

    return await this.getSetupSession(sessionId);
  }

  /**
   * Update setup session
   */
  async updateSetupSession(sessionId: string, updates: Partial<SetupSession>): Promise<boolean> {
    try {
      const existing = await this.getSetupSession(sessionId);
      if (!existing) return false;

      const updated = {
        ...existing,
        ...updates
      };

      return await this.storeSetupSession(updated);
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to update setup session', {
        error: err.message,
        sessionId
      });
      return false;
    }
  }

  /**
   * Delete setup session
   */
  async deleteSetupSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSetupSession(sessionId);
      if (session) {
        // Remove admin mapping
        await this.storage.delete(`session:admin:${session.initiatingAdminId}`);
      }

      // Remove session data
      await this.storage.delete(`session:setup:${sessionId}`);
      LogEngine.info(`Setup session deleted: ${sessionId}`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to delete setup session', {
        error: err.message,
        sessionId
      });
      return false;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    // Note: With TTL in Redis, sessions should auto-expire
    // This method is for manual cleanup if needed
    let cleanedCount = 0;
    try {
      // Implementation would depend on storage backend
      // For now, rely on TTL for automatic cleanup
      LogEngine.debug('Session cleanup completed (TTL-based)');
      return cleanedCount;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to cleanup expired sessions', {
        error: err.message
      });
      return 0;
    }
  }

  // ================================
  // DM Setup Session Management
  // ================================

  /**
   * Create and store a DM setup session
   */
  async storeDmSetupSession(sessionData: DmSetupSession): Promise<boolean> {
    try {
      const key = `dm_session:${sessionData.sessionId}`;
      
      // Calculate TTL based on the expiresAt field in the session data
      const now = new Date();
      const expiresAt = new Date(sessionData.expiresAt);
      const ttlSeconds = Math.max(300, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)); // Minimum 5 minutes TTL
      
      // Log TTL calculation for debugging
      LogEngine.info('Calculating session TTL', {
        sessionId: sessionData.sessionId,
        currentTime: now.toISOString(),
        expiresAt: sessionData.expiresAt,
        calculatedTTL: ttlSeconds,
        minimumTTL: 300
      });
      
      // If TTL is still too short after minimum enforcement, extend the expiry
      if (ttlSeconds <= 300) {
        const newExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
        const extendedSessionData = {
          ...sessionData,
          expiresAt: newExpiresAt.toISOString()
        };
        const newTtlSeconds = Math.floor((newExpiresAt.getTime() - now.getTime()) / 1000);
        
        LogEngine.warn('Session expiry was too short, extending automatically', {
          sessionId: sessionData.sessionId,
          originalExpiry: expiresAt.toISOString(),
          newExpiry: extendedSessionData.expiresAt,
          newTTL: newTtlSeconds
        });
        
        // Store with extended TTL using the copied data
        await this.storage.set(key, extendedSessionData, newTtlSeconds);
        
        // Create admin mapping for easy lookup with same TTL
        await this.storage.set(
          `dm_session:admin:${sessionData.adminId}`, 
          sessionData.sessionId, 
          newTtlSeconds
        );
      } else {
        // Store with calculated TTL
        await this.storage.set(key, sessionData, ttlSeconds);
        
        // Create admin mapping for easy lookup with same TTL
        await this.storage.set(
          `dm_session:admin:${sessionData.adminId}`, 
          sessionData.sessionId, 
          ttlSeconds
        );
      }

      LogEngine.info('DM setup session stored', {
        sessionId: sessionData.sessionId,
        adminId: sessionData.adminId,
        groupChatId: sessionData.groupChatId,
        step: sessionData.currentStep,
        expiresAt: sessionData.expiresAt,
        finalTTL: ttlSeconds > 300 ? ttlSeconds : Math.floor((new Date(sessionData.expiresAt).getTime() - now.getTime()) / 1000)
      });
      
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to store DM setup session', {
        error: err.message,
        sessionId: sessionData.sessionId
      });
      return false;
    }
  }

  /**
   * Retrieve a DM setup session by ID
   */
  async getDmSetupSession(sessionId: string): Promise<DmSetupSession | null> {
    try {
      const key = `dm_session:${sessionId}`;
      return await this.storage.get(key);
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to get DM setup session', {
        error: err.message,
        sessionId
      });
      return null;
    }
  }

  /**
   * Get active DM setup session by admin ID
   */
  async getActiveDmSetupSessionByAdmin(adminId: number): Promise<DmSetupSession | null> {
    try {
      const sessionId = await this.storage.get(`dm_session:admin:${adminId}`);
      if (!sessionId) return null;
      
      return await this.getDmSetupSession(sessionId);
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to get active DM setup session by admin', {
        error: err.message,
        adminId
      });
      return null;
    }
  }

  /**
   * Update a DM setup session
   */
  async updateDmSetupSession(sessionId: string, updates: Partial<DmSetupSession>): Promise<boolean> {
    try {
      const existing = await this.getDmSetupSession(sessionId);
      if (!existing) return false;

      const updated: DmSetupSession = {
        ...existing,
        ...updates
      };

      return await this.storeDmSetupSession(updated);
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to update DM setup session', {
        error: err.message,
        sessionId
      });
      return false;
    }
  }

  /**
   * Delete a DM setup session
   */
  async deleteDmSetupSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getDmSetupSession(sessionId);
      if (session) {
        // Remove admin mapping
        await this.storage.delete(`dm_session:admin:${session.adminId}`);
      }

      // Remove session data
      await this.storage.delete(`dm_session:${sessionId}`);
      LogEngine.info(`DM setup session deleted: ${sessionId}`);
      return true;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to delete DM setup session', {
        error: err.message,
        sessionId
      });
      return false;
    }
  }

  /**
   * Clean up expired DM sessions (mainly for manual cleanup as TTL handles auto-expiration)
   */
  async cleanupExpiredDmSessions(): Promise<number> {
    let cleanedCount = 0;
    try {
      // Implementation would depend on storage backend
      // For now, rely on TTL for automatic cleanup
      LogEngine.debug('DM session cleanup completed (TTL-based)');
      return cleanedCount;
    } catch (error) {
      const err = error as Error;
      LogEngine.error('Failed to cleanup expired DM sessions', {
        error: err.message
      });
      return 0;
    }
  }

  // =====================================================================
  // Static Helper Methods
  // =====================================================================

  static async getSetupState(chatId: number): Promise<SetupState | null> {
    return BotsStore.getInstance().getSetupState(chatId);
  }

  static async storeSetupState(setupState: SetupState): Promise<boolean> {
    return BotsStore.getInstance().storeSetupState(setupState);
  }

  static async updateSetupState(chatId: number, updates: Partial<SetupState>): Promise<boolean> {
    return BotsStore.getInstance().updateSetupState(chatId, updates);
  }

  static async clearSetupState(chatId: number): Promise<boolean> {
    return BotsStore.getInstance().clearSetupState(chatId);
  }

  static async storeAdminProfile(adminData: AdminProfile): Promise<boolean> {
    return BotsStore.getInstance().storeAdminProfile(adminData);
  }

  static async getAdminProfile(telegramUserId: number): Promise<AdminProfile | null> {
    return BotsStore.getInstance().getAdminProfile(telegramUserId);
  }

  static async updateAdminProfile(telegramUserId: number, updates: Partial<AdminProfile>): Promise<boolean> {
    return BotsStore.getInstance().updateAdminProfile(telegramUserId, updates);
  }

  static async deleteAdminProfile(telegramUserId: number): Promise<boolean> {
    return BotsStore.getInstance().deleteAdminProfile(telegramUserId);
  }

  static async getAllAdminProfiles(): Promise<AdminProfile[]> {
    return BotsStore.getInstance().getAllAdminProfiles();
  }

  static async storeSetupSession(sessionData: SetupSession): Promise<boolean> {
    return BotsStore.getInstance().storeSetupSession(sessionData);
  }

  static async getSetupSession(sessionId: string): Promise<SetupSession | null> {
    return BotsStore.getInstance().getSetupSession(sessionId);
  }

  static async getActiveSetupSessionByAdmin(adminId: number): Promise<SetupSession | null> {
    return BotsStore.getInstance().getActiveSetupSessionByAdmin(adminId);
  }

  static async getActiveSetupSessionByGroup(groupChatId: number): Promise<SetupSession | null> {
    return BotsStore.getInstance().getActiveSetupSessionByGroup(groupChatId);
  }

  static async updateSetupSession(sessionId: string, updates: Partial<SetupSession>): Promise<boolean> {
    return BotsStore.getInstance().updateSetupSession(sessionId, updates);
  }

  static async deleteSetupSession(sessionId: string): Promise<boolean> {
    return BotsStore.getInstance().deleteSetupSession(sessionId);
  }

  static async cleanupExpiredSessions(): Promise<number> {
    return BotsStore.getInstance().cleanupExpiredSessions();
  }

  // Static methods for DM setup sessions
  static async storeDmSetupSession(sessionData: DmSetupSession): Promise<boolean> {
    return BotsStore.getInstance().storeDmSetupSession(sessionData);
  }

  static async getDmSetupSession(sessionId: string): Promise<DmSetupSession | null> {
    return BotsStore.getInstance().getDmSetupSession(sessionId);
  }

  static async getActiveDmSetupSessionByAdmin(adminId: number): Promise<DmSetupSession | null> {
    return BotsStore.getInstance().getActiveDmSetupSessionByAdmin(adminId);
  }

  static async updateDmSetupSession(sessionId: string, updates: Partial<DmSetupSession>): Promise<boolean> {
    return BotsStore.getInstance().updateDmSetupSession(sessionId, updates);
  }

  static async deleteDmSetupSession(sessionId: string): Promise<boolean> {
    return BotsStore.getInstance().deleteDmSetupSession(sessionId);
  }

  static async cleanupExpiredDmSessions(): Promise<number> {
    return BotsStore.getInstance().cleanupExpiredDmSessions();
  }

  // Static methods for group configuration
  static async storeGroupConfig(groupConfig: GroupConfig): Promise<boolean> {
    return BotsStore.getInstance().storeGroupConfig(groupConfig);
  }

  static async getGroupConfig(chatId: number): Promise<GroupConfig | null> {
    return BotsStore.getInstance().getGroupConfig(chatId);
  }

  static async updateGroupConfig(chatId: number, updates: Partial<GroupConfig>): Promise<boolean> {
    return BotsStore.getInstance().updateGroupConfig(chatId, updates);
  }

  // Static methods for global configuration
  static async getGlobalConfig(key: string): Promise<any | null> {
    return BotsStore.getInstance().getGlobalConfig(key);
  }

  static async setGlobalConfig(key: string, value: any): Promise<boolean> {
    return BotsStore.getInstance().setGlobalConfig(key, value);
  }

  static async deleteGlobalConfig(key: string): Promise<boolean> {
    return BotsStore.getInstance().deleteGlobalConfig(key);
  }

  // =====================================================================
  // Helper Methods for Immutable Field Protection
  // =====================================================================

  /**
   * Create a safe update object that excludes immutable fields
   * This ensures certain fields cannot be overridden during updates
   */
  private static excludeImmutableFields<T extends Record<string, any>>(
    updates: Partial<T>, 
    immutableFields: (keyof T)[]
  ): Partial<T> {
    const safeUpdates = { ...updates };
    
    // Remove any immutable fields from the updates object
    for (const field of immutableFields) {
      if (field in safeUpdates) {
        delete safeUpdates[field];
        LogEngine.warn(`Attempted to update immutable field '${String(field)}' - ignoring`, {
          field: String(field),
          attemptedValue: updates[field]
        });
      }
    }
    
    return safeUpdates;
  }

  /**
   * Validate that critical immutable fields match expected values
   */
  private static validateImmutableFields<T extends Record<string, any>>(
    existingData: T,
    updates: Partial<T>,
    fieldValidations: { field: keyof T; expectedValue: any }[]
  ): boolean {
    for (const { field, expectedValue } of fieldValidations) {
      if (field in updates && updates[field] !== expectedValue) {
        LogEngine.error(`Immutable field validation failed for '${String(field)}'`, {
          field: String(field),
          expectedValue,
          attemptedValue: updates[field],
          existingValue: existingData[field]
        });
        return false;
      }
    }
    return true;
  }

  /**
   * Safely retrieve an array from storage, ensuring it's always an array
   * This prevents runtime errors when storage returns unexpected types
   */
  private async getArrayFromStorage(key: string): Promise<any[]> {
    const data = await this.storage.get(key);
    return Array.isArray(data) ? data : [];
  }
}

