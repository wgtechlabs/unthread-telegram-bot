/**
 * Unthread Telegram Bot - Core Type Definitions and Interfaces
 * 
 * Comprehensive TypeScript type definitions providing type safety, IntelliSense
 * support, and compile-time validation across the entire Unthread Telegram Bot
 * application ecosystem.
 * 
 * Type Categories:
 * - Bot Context: Extended Telegraf context with bot-specific properties and methods
 * - Command Handlers: Function signatures and interfaces for bot command implementations
 * - Support Forms: Types for multi-step support ticket creation and user interaction flows
 * - Error Handling: Comprehensive Telegram-specific error types and error handling patterns
 * - User Management: Types for user state, permissions, and profile management
 * - Conversation State: Types for tracking conversation context and ticket associations
 * 
 * Framework Integration:
 * - Telegraf framework extensions with custom context properties
 * - Type-safe command handler implementations with parameter validation
 * - Integration with Unthread API response types and data structures
 * - Database entity types with proper ORM mapping support
 * 
 * Features:
 * - Type-safe bot context extensions with custom properties and methods
 * - Enum-based support form field definitions with validation rules
 * - Comprehensive error type hierarchies with actionable error handling
 * - Integration with external API types (Telegram, Unthread, Redis, PostgreSQL)
 * - Generic type patterns for reusable components and utilities
 * - Strict null checking and optional property handling
 * 
 * Code Quality Benefits:
 * - Compile-time type checking prevents runtime errors
 * - IntelliSense support improves developer productivity
 * - Self-documenting code through expressive type definitions
 * - Refactoring safety with automatic type validation
 * - API contract enforcement between modules and services
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @since 2025
 */
import { Context } from 'telegraf';
import { Update, UserFromGetMe } from 'telegraf/typings/core/types/typegram';

// Bot context extensions - extending the base context
export interface BotContext extends Context<Update> {
  botInfo: UserFromGetMe;
}

// Command handler type
export type CommandHandler = (_ctx: BotContext) => Promise<void>;

// Support form types
export enum SupportField {
  _SUMMARY = 'summary',
  _EMAIL = 'email',
  _COMPLETE = 'complete',
  _PROFILE_EMAIL_UPDATE = 'profile_email_update'
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

// Profile update state for managing email updates
export interface ProfileUpdateState {
  field: SupportField._PROFILE_EMAIL_UPDATE;
  initiatedBy: number; // Track who initiated the profile update
  initiatedInChat: number; // Track which chat the update was initiated in
  currentEmail?: string; // Store current email for reference
  newEmail?: string; // Store new email during update process
  messageId?: number; // For message editing
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
    payload: unknown;
  };
}

// Webhook event types - new webhook attachment metadata structure
export type {
  WebhookEvent,
  WebhookAttachments,
  WebhookFileData,
  AttachmentProcessingResult,
  AttachmentConfig
} from './webhookEvents.js';

// Webhook event validation functions
export {
  isValidWebhookEvent,
  hasValidAttachments
} from './webhookEvents.js';
