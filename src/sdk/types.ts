/**
 * SDK Type Definitions
 * Core interfaces for the bots-brain and unthread-webhook SDKs
 */

// Database connection interface
export interface DatabaseConnection {
  readonly connectionPool: any; // PostgreSQL pool accessor
  query(text: string, params?: any[]): Promise<any>;
}

// Storage interfaces
export interface StorageConfig {
  postgres?: any;
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

// User state for conversations
export interface UserState {
  currentField?: string;
  field?: string;
  ticket?: any;
  [key: string]: any;
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
  
  // Agent message operations
  storeAgentMessage(messageData: AgentMessageData): Promise<boolean>;
  getAgentMessage(messageId: number): Promise<AgentMessageData | null>;
}
