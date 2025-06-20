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
