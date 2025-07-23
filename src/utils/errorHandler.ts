/**
 * Unthread Telegram Bot - Error Handler
 * 
 * Simple error handling system for attachment processing with clear
 * user-facing error messages and proper logging.
 * 
 * Core Features:
 * - Attachment-specific error classification
 * - User-friendly error messages for Telegram
 * - Basic error context logging
 * - Clear error reporting
 * 
 * Error Categories:
 * - Validation Errors: Event structure and attachment validation
 * - Download Errors: Unthread API file download failures
 * - Upload Errors: Telegram file upload failures
 * - Network Errors: Connectivity and timeout issues
 * - Security Errors: File type and size validation failures
 * 
 * User Experience:
 * - Clear, actionable error messages in Telegram
 * - No silent failures - all errors reported to users
 * - Consistent error message formatting
 * - Helpful suggestions for resolving issues
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0-rc1
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import type { Telegraf } from 'telegraf';

/**
 * Attachment processing error types with specific classification
 */
export enum AttachmentErrorType {
  // Validation Errors
  ATTACHMENT_VALIDATION_FAILED = 'ATTACHMENT_VALIDATION_FAILED',
  NO_ATTACHMENTS_FOUND = 'NO_ATTACHMENTS_FOUND',
  INVALID_ATTACHMENT_STRUCTURE = 'INVALID_ATTACHMENT_STRUCTURE',
  
  // Download Errors  
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  DOWNLOAD_TIMEOUT = 'DOWNLOAD_TIMEOUT',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  UNTHREAD_AUTH_FAILED = 'UNTHREAD_AUTH_FAILED',
  
  // Upload Errors
  TELEGRAM_UPLOAD_FAILED = 'TELEGRAM_UPLOAD_FAILED',
  FILE_SIZE_EXCEEDED = 'FILE_SIZE_EXCEEDED',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  
  // Network Errors
  NETWORK_CONNECTION_FAILED = 'NETWORK_CONNECTION_FAILED',
  API_RATE_LIMIT_EXCEEDED = 'API_RATE_LIMIT_EXCEEDED',
  
  // System Errors
  MEMORY_ALLOCATION_FAILED = 'MEMORY_ALLOCATION_FAILED',
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR'
}

/**
 * Error context interface for comprehensive error tracking
 */
export interface AttachmentErrorContext {
  conversationId?: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  chatId?: number;
  messageId?: number;
  userId?: string;
  attemptNumber?: number;
  processingStep?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Attachment processing error class with detailed context
 */
export class AttachmentProcessingError extends Error {
  public readonly errorType: AttachmentErrorType;
  public readonly context: AttachmentErrorContext;
  public readonly timestamp: Date;
  public readonly userMessage: string;

  constructor(
    errorType: AttachmentErrorType,
    message: string,
    context: AttachmentErrorContext = {},
    userMessage?: string
  ) {
    super(message);
    this.name = 'AttachmentProcessingError';
    this.errorType = errorType;
    this.context = context;
    this.timestamp = new Date();
    this.userMessage = userMessage || this.getDefaultUserMessage(errorType);
  }

  /**
   * Get user-friendly error message based on error type
   */
  private getDefaultUserMessage(errorType: AttachmentErrorType): string {
    const message = ATTACHMENT_ERROR_MESSAGES[errorType as keyof typeof ATTACHMENT_ERROR_MESSAGES];
    return message || ATTACHMENT_ERROR_MESSAGES[AttachmentErrorType.UNEXPECTED_ERROR];
  }
}

/**
 * User-friendly error messages for Telegram users
 */
export const ATTACHMENT_ERROR_MESSAGES: Record<AttachmentErrorType, string> = {
  // Validation Errors
  [AttachmentErrorType.ATTACHMENT_VALIDATION_FAILED]: "❌ There was an issue processing your attachment. Please try uploading it again.",
  [AttachmentErrorType.NO_ATTACHMENTS_FOUND]: "📎 No attachments were found in the message. Please check and try again.",
  [AttachmentErrorType.INVALID_ATTACHMENT_STRUCTURE]: "❌ The attachment format is invalid. Please try uploading a different file.",
  
  // Download Errors
  [AttachmentErrorType.FILE_NOT_FOUND]: "❌ Attachment could not be found in the system. Please try uploading again.",
  [AttachmentErrorType.DOWNLOAD_TIMEOUT]: "⏰ Attachment download timed out. The file may be too large or the connection is slow. Please try again.",
  [AttachmentErrorType.DOWNLOAD_FAILED]: "📥 Failed to download the attachment. Please try again or contact support.",
  [AttachmentErrorType.UNTHREAD_AUTH_FAILED]: "🔐 Authentication error occurred. Please contact support if this persists.",
  
  // Upload Errors
  [AttachmentErrorType.TELEGRAM_UPLOAD_FAILED]: "📤 Failed to upload attachment to Telegram. Please try again.",
  [AttachmentErrorType.FILE_SIZE_EXCEEDED]: "📁 Attachment is too large to forward (max 50MB). Please use a file sharing service.",
  [AttachmentErrorType.UNSUPPORTED_FILE_TYPE]: "🚫 File type not supported for forwarding. Supported: images, documents, archives.",
  
  // Network Errors
  [AttachmentErrorType.NETWORK_CONNECTION_FAILED]: "🌐 Network connection failed. Please check your internet connection and try again.",
  [AttachmentErrorType.API_RATE_LIMIT_EXCEEDED]: "⏳ Too many requests. Please wait a moment and try again.",
  
  // System Errors
  [AttachmentErrorType.MEMORY_ALLOCATION_FAILED]: "💾 System resource error. Please try again with a smaller file.",
  [AttachmentErrorType.UNEXPECTED_ERROR]: "❌ An unexpected error occurred with the attachment. Please try again or contact support."
};

/**
 * Enhanced error handler for attachment processing
 */
export class AttachmentErrorHandler {
  /**
   * Create and log an attachment processing error
   */
  static createError(
    errorType: AttachmentErrorType,
    message: string,
    context: AttachmentErrorContext = {},
    userMessage?: string
  ): AttachmentProcessingError {
    const error = new AttachmentProcessingError(errorType, message, context, userMessage);
    
    // Log error with full context
    LogEngine.error(`[AttachmentError] ${errorType}`, {
      errorType,
      message,
      context,
      userMessage: error.userMessage,
      timestamp: error.timestamp.toISOString(),
      stackTrace: error.stack?.substring(0, 500)
    });

    return error;
  }

  /**
   * Send error message to Telegram user
   */
  static async notifyUser(
    bot: Telegraf,
    chatId: number,
    error: AttachmentProcessingError,
    originalMessageId?: number
  ): Promise<boolean> {
    try {
      const errorMessage = `🔄 **Attachment Processing Failed**\n\n${error.userMessage}`;
      
      const options: any = {
        parse_mode: 'Markdown'
      };
      
      if (originalMessageId) {
        options.reply_to_message_id = originalMessageId;
      }

      await bot.telegram.sendMessage(chatId, errorMessage, options);
      
      LogEngine.info('✅ Error notification sent to user', {
        errorType: error.errorType,
        chatId,
        conversationId: error.context.conversationId,
        originalMessageId
      });
      
      return true;
    } catch (notificationError) {
      LogEngine.error('❌ Failed to send error notification to user', {
        errorType: error.errorType,
        chatId,
        notificationError: notificationError instanceof Error ? notificationError.message : String(notificationError)
      });
      return false;
    }
  }

  /**
   * Validate attachment structure and throw appropriate error
   */
  static validateAttachment(attachment: Record<string, unknown>, context: AttachmentErrorContext = {}): void {
    if (!attachment.id || !attachment.name) {
      throw this.createError(
        AttachmentErrorType.INVALID_ATTACHMENT_STRUCTURE,
        `Attachment missing required fields: ${!attachment.id ? 'id' : 'name'}`,
        {
          ...context,
          fileName: attachment.name as string,
          additionalData: { missingFields: !attachment.id ? ['id'] : ['name'] }
        }
      );
    }

    if (attachment.size && typeof attachment.size === 'number' && attachment.size > 50 * 1024 * 1024) {
      throw this.createError(
        AttachmentErrorType.FILE_SIZE_EXCEEDED,
        `File size ${attachment.size} exceeds 50MB limit`,
        {
          ...context,
          fileName: attachment.name as string,
          fileSize: attachment.size
        }
      );
    }
  }

  /**
   * Wrap async operation with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    errorType: AttachmentErrorType,
    context: AttachmentErrorContext = {}
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AttachmentProcessingError) {
        throw error; // Re-throw our custom errors
      }
      
      // Convert generic errors to attachment processing errors
      throw this.createError(
        errorType,
        error instanceof Error ? error.message : String(error),
        context
      );
    }
  }
}
