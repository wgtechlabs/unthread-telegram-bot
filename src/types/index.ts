import { Context, Telegraf } from 'telegraf';
import { Message, Update, UserFromGetMe } from 'telegraf/typings/core/types/typegram';

// Bot context extensions - extending the base context
export interface BotContext extends Context<Update> {
  botInfo: UserFromGetMe;
}

// Message types
export interface TextMessage extends Message.TextMessage {
  text: string;
}

export interface PhotoMessage extends Message.PhotoMessage {
  photo: Array<{
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
  }>;
}

// Command handler type
export type CommandHandler = (ctx: BotContext) => Promise<void>;

// Database types
export interface DatabaseConnection {
  connect(): Promise<void>;
  close(): Promise<void>;
  query(text: string, params?: any[]): Promise<any>;
}

// Customer types
export interface Customer {
  id: string;
  unthreadCustomerId: string;
  telegramChatId: number;
  email?: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Ticket types
export interface Ticket {
  conversationId: string;
  friendlyId: string;
  customerId: string;
  telegramChatId: number;
  summary: string;
  status: 'open' | 'closed' | 'pending';
  createdAt: Date;
  updatedAt: Date;
}

// Support form types
export enum SupportField {
  SUMMARY = 'summary',
  EMAIL = 'email',
  COMPLETE = 'complete'
}

export interface SupportFormState {
  field: SupportField;
  summary?: string;
  email?: string;
  messageId?: number;
  initiatedBy?: number; // Track who initiated the support request
  initiatedInChat?: number; // Track which chat the support was initiated in
  currentField?: SupportField; // For backward compatibility
}

// Storage interface
export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// Webhook types
export interface WebhookEvent {
  type: string;
  source: string;
  data: any;
  timestamp: string;
}

export interface MessageCreatedEvent extends WebhookEvent {
  type: 'message_created';
  data: {
    id: string;
    conversation_id: string;
    content: string;
    author: {
      id: string;
      name: string;
      type: 'agent' | 'customer';
    };
    created_at: string;
  };
}

export interface ConversationUpdatedEvent extends WebhookEvent {
  type: 'conversation_updated';
  data: {
    id: string;
    status: 'open' | 'closed' | 'pending';
    updated_at: string;
  };
}

// Configuration types
export interface BotConfig {
  telegramToken: string;
  unthreadApiKey: string;
  unthreadApiUrl: string;
  platformRedisUrl?: string;
  webhookRedisUrl?: string;
  databaseUrl: string;
}

// API Response types
export interface UnthreadApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateCustomerResponse {
  id: string;
  email: string;
  name?: string;
  created_at: string;
}

export interface CreateConversationResponse {
  id: string;
  friendly_id: string;
  customer_id: string;
  title: string;
  status: string;
  created_at: string;
}

// Error types
export interface TelegramError extends Error {
  response?: {
    error_code: number;
    description: string;
    parameters?: {
      retry_after?: number;
    };
  };
  on?: {
    method: string;
    payload: any;
  };
}

// Logging types
export interface LogContext {
  chatId?: number;
  userId?: number;
  conversationId?: string;
  error?: string;
  stack?: string;
  [key: string]: any;
}
