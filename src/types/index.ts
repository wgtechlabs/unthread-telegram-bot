/**
 * Unthread Telegram Bot - Type Definitions
 * 
 * Core TypeScript interfaces and type definitions for the Unthread Telegram Bot
 * project. Provides type safety and IntelliSense support across the entire
 * application codebase.
 * 
 * Type Categories:
 * - Bot Context: Extended Telegraf context with bot-specific properties
 * - Command Handlers: Function signatures for bot command implementations
 * - Support Form: Types for multi-step support ticket creation flow
 * - Error Handling: Telegram-specific error types and error handling
 * 
 * Features:
 * - Type-safe bot context extensions
 * - Enum-based support form field definitions
 * - Comprehensive error type definitions * - Integration with Telegraf framework types
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */
import { Context, Telegraf } from 'telegraf';
import { Message, Update, UserFromGetMe } from 'telegraf/typings/core/types/typegram';

// Bot context extensions - extending the base context
export interface BotContext extends Context<Update> {
  botInfo: UserFromGetMe;
}

// Command handler type
export type CommandHandler = (ctx: BotContext) => Promise<void>;

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
