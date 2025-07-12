import type { Pool } from 'pg';

/**
 * Unthread Telegram Bot - SDK Type Definitions
 *
 * Core TypeScript interfaces and type definitions for the Bots Brain and
 * Unthread Webhook SDKs. Provides comprehensive type safety and IntelliSense
 * support for all SDK components and integrations.
 *
 * Type Categories:
 * - Storage Interfaces: Multi-layer storage system types
 * - Database Connections: PostgreSQL and Redis connection interfaces
 * - Ticket Management: Support ticket and customer data structures
 * - Webhook Events: Event types for Unthread platform integration
 * - User Management: User state and conversation data types
 *
 * Key Interfaces:
 * - IBotsStore: High-level bot storage operations interface
 * - Storage: Low-level storage engine interface
 * - TicketData: Support ticket information and metadata
 * - WebhookEvent: Unthread platform webhook event structure
 * - UserState: Conversation state and form data management
 *
 * Features:
 * - Type-safe database operations
 * - Comprehensive webhook event typing
 * - Storage layer abstraction interfaces
 * - User state management types * - Integration with external service types
 *
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

// Database connection interface
export interface DatabaseConnection {
  readonly connectionPool: Pool; // PostgreSQL pool accessor
  query(text: string, params?: any[]): Promise<any>;
}

// Storage interfaces
export interface StorageConfig {
  postgres?: Pool;
  redisUrl?: string | undefined;
}

export interface Storage {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

// Ticket data structures
export interface TicketData {
  chatId: number;
  messageId: number;
  conversationId: string;
  ticketId: string;
  friendlyId: string;
  telegramUserId: number;
  createdAt: string;
  customerId?: string;
  summary?: string;
  status?: string;
  platform?: string;
  storedAt?: string;
  version?: string;
  metadata?: Record<string, any>;
}

export interface TicketInfo {
  messageId: number;
  conversationId: string;
  friendlyId: string;
}

// Customer data structures
export interface CustomerData {
  id: string;
  unthreadCustomerId: string;
  telegramChatId: number;
  chatId?: number;
  chatTitle?: string;
  customerName?: string;
  email?: string;
  name?: string;
  company?: string;
  createdAt: string;
  updatedAt: string;
}

// User data structures
export interface UserData {
  id: string;
  telegramUserId: number;
  telegramUsername?: string;
  unthreadName?: string;
  unthreadEmail?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

// Admin profile data structures
export interface AdminProfile {
  telegramUserId: number;
  telegramUsername?: string;
  dmChatId: number; // DM chat ID for notifications
  isActivated: boolean;
  activatedAt: string;
  lastActiveAt: string;
}

// Setup session data structures
export interface SetupSession {
  groupChatId: number;
  groupChatName: string;
  initiatingAdminId: number;
  sessionId: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  startedAt: string;
  expiresAt: string; // startedAt + 3 minutes
  currentStep: string;
}

// DM Setup Wizard interfaces
export interface DmSetupSession {
  sessionId: string;
  adminId: number;
  groupChatId: number;
  groupChatName: string;
  status: 'active' | 'completed' | 'cancelled';
  startedAt: string;
  expiresAt: string; // Extended timeout for DM sessions (10 minutes)
  currentStep: string;
  stepData?: Record<string, any>;
  messageIds?: number[]; // Track wizard messages for cleanup
}

// User state for conversations
export interface UserState {
  currentField?: string;
  field?: string;
  ticket?: any;
  [key: string]: any;
}

// Group configuration and setup state interfaces
export interface GroupConfig {
  chatId: number;
  chatTitle?: string;
  isConfigured: boolean;
  customerId?: string;
  customerName?: string;
  setupBy?: number;
  setupAt?: string;
  botIsAdmin: boolean;
  lastAdminCheck?: string;
  setupVersion?: string;
  lastUpdatedAt?: string;  // Metadata field for tracking updates
  version?: string;        // Version field for schema versioning
  metadata?: Record<string, any>;
}

export interface SetupState {
  chatId: number;
  step: 'bot_admin_check' | 'customer_selection' | 'customer_creation' | 'customer_linking' | 'complete';
  initiatedBy: number;
  startedAt: string;
  suggestedCustomerName?: string;
  userInput?: string;
  retryCount?: number;
  metadata?: Record<string, any>;
}

// Agent message data
export interface AgentMessageData {
  messageId: number;
  conversationId: string;
  chatId: number;
  friendlyId: string;
  originalTicketMessageId: number;
  sentAt: string;
}

// Webhook event interfaces
export interface WebhookEvent {
  type: 'message_created' | 'conversation_updated';
  sourcePlatform: 'dashboard';
  timestamp: string;
  data: MessageData | ConversationData;
}

export interface MessageCreatedEvent extends WebhookEvent {
  type: 'message_created';
  data: MessageData;
}

export interface ConversationUpdatedEvent extends WebhookEvent {
  type: 'conversation_updated';
  data: ConversationData;
}

export interface MessageData {
  conversationId?: string;
  id?: string;
  content?: string;
  text?: string;
  [key: string]: any;
}

export interface ConversationData {
  conversationId?: string;
  id?: string;
  status?: string;
  [key: string]: any;
}

export interface WebhookConsumerConfig {
  redisUrl: string;
  queueName: string;
}

export type EventHandler = (event: WebhookEvent) => Promise<void>;

// BotsStore interface
export interface IBotsStore {
  storage: Storage;

  // Ticket operations
  storeTicket(ticketData: TicketData): Promise<boolean>;
  getTicketByConversationId(conversationId: string): Promise<TicketData | null>;
  getTicketByMessageId(messageId: number): Promise<TicketData | null>;
  getTicketByFriendlyId(friendlyId: string): Promise<TicketData | null>;
  getTicketByTicketId(ticketId: string): Promise<TicketData | null>;
  getTicketsForChat(chatId: number): Promise<TicketData[]>;
  deleteTicket(conversationId: string): Promise<boolean>;

  // User state operations
  storeUserState(telegramUserId: number, state: UserState): Promise<boolean>;
  getUserState(telegramUserId: number): Promise<UserState | null>;
  clearUserState(telegramUserId: number): Promise<boolean>;

  // Customer operations
  storeCustomer(customerData: CustomerData): Promise<boolean>;
  getCustomerById(customerId: string): Promise<CustomerData | null>;
  getCustomerByChatId(chatId: number): Promise<CustomerData | null>;

  // User operations
  storeUser(userData: UserData): Promise<boolean>;
  getUserByTelegramId(telegramUserId: number): Promise<UserData | null>;
  updateUser(telegramUserId: number, updates: Partial<UserData>): Promise<boolean>;
  
  // Admin profile operations
  storeAdminProfile(adminData: AdminProfile): Promise<boolean>;
  getAdminProfile(telegramUserId: number): Promise<AdminProfile | null>;
  updateAdminProfile(telegramUserId: number, updates: Partial<AdminProfile>): Promise<boolean>;
  deleteAdminProfile(telegramUserId: number): Promise<boolean>;
  
  // Setup session operations
  storeSetupSession(sessionData: SetupSession): Promise<boolean>;
  getSetupSession(sessionId: string): Promise<SetupSession | null>;
  getActiveSetupSessionByAdmin(adminId: number): Promise<SetupSession | null>;
  updateSetupSession(sessionId: string, updates: Partial<SetupSession>): Promise<boolean>;
  deleteSetupSession(sessionId: string): Promise<boolean>;
  cleanupExpiredSessions(): Promise<number>; // Returns count of cleaned sessions
  
  // DM setup session operations
  storeDmSetupSession(sessionData: DmSetupSession): Promise<boolean>;
  getDmSetupSession(sessionId: string): Promise<DmSetupSession | null>;
  getActiveDmSetupSessionByAdmin(adminId: number): Promise<DmSetupSession | null>;
  updateDmSetupSession(sessionId: string, updates: Partial<DmSetupSession>): Promise<boolean>;
  deleteDmSetupSession(sessionId: string): Promise<boolean>;
  cleanupExpiredDmSessions(): Promise<number>; // Returns count of cleaned sessions

  // Agent message operations
  storeAgentMessage(messageData: AgentMessageData): Promise<boolean>;
  getAgentMessage(messageId: number): Promise<AgentMessageData | null>;
  
  // Group configuration operations
  storeGroupConfig(config: GroupConfig): Promise<boolean>;
  getGroupConfig(chatId: number): Promise<GroupConfig | null>;
  updateGroupConfig(chatId: number, updates: Partial<GroupConfig>): Promise<boolean>;
  deleteGroupConfig(chatId: number): Promise<boolean>;
  
  // Batch group configuration operations
  storeGroupConfigs(configs: GroupConfig[]): Promise<boolean>;
  getGroupConfigs(chatIds: number[]): Promise<(GroupConfig | null)[]>;
  updateGroupConfigs(updates: {chatId: number, updates: Partial<GroupConfig>}[]): Promise<boolean>;
  deleteGroupConfigs(chatIds: number[]): Promise<boolean>;
  
  // Setup state operations
  storeSetupState(state: SetupState): Promise<boolean>;
  getSetupState(chatId: number): Promise<SetupState | null>;
  updateSetupState(chatId: number, updates: Partial<SetupState>): Promise<boolean>;
  clearSetupState(chatId: number): Promise<boolean>;
  
  // Batch setup state operations
  storeSetupStates(states: SetupState[]): Promise<boolean>;
  getSetupStates(chatIds: number[]): Promise<(SetupState | null)[]>;
  updateSetupStates(updates: {chatId: number, updates: Partial<SetupState>}[]): Promise<boolean>;
  clearSetupStates(chatIds: number[]): Promise<boolean>;
}
