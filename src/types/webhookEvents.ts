/**
 * Webhook Event Type Definitions
 * 
 * TypeScript interfaces for the new webhook attachment metadata structure.
 * Provides type safety and IntelliSense support for webhook event processing.
 * 
 * Key Features:
 * - Clear source platform identification (dashboard only)
 * - Rich attachment metadata for instant decisions
 * - Guaranteed consistency between metadata and file arrays
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since August 2025
 */

/**
 * Webhook attachment metadata structure
 * Provides instant file information without array processing
 */
export interface WebhookAttachments {
  hasFiles: boolean;        // Instant boolean check for file presence
  fileCount: number;        // Count without array.length calls
  totalSize: number;        // Pre-calculated total size in bytes
  types: string[];          // Unique MIME types for categorization
  names: string[];          // All file names (correlates with data.files[i])
}

/**
 * Individual file data structure from webhook
 * Maintains compatibility with existing Slack file format
 */
export interface WebhookFileData {
  id: string;                    // File identifier for downloads
  name: string;                  // Original filename
  size: number;                  // File size in bytes
  mimetype: string;              // MIME type for processing decisions
  urlPrivate: string;            // Private download URL
  urlPrivateDownload: string;    // Direct download URL
  filetype?: string;             // File extension (optional)
  title?: string;                // Display title (optional)
}

/**
 * Complete webhook event structure
 * Dashboard → Telegram events with guaranteed attachment metadata
 */
export interface WebhookEvent {
  platform: "unthread";                        // Always unthread
  targetPlatform: "telegram";                  // Always telegram for our bot
  type: "message_created";                     // Primary event type we process
  sourcePlatform: "dashboard";                 // Only process dashboard events
  attachments?: WebhookAttachments;            // NEW: Rich attachment metadata
  data: {
    id: string;                                // Message ID
    content?: string;                          // Message content (new field)
    text?: string;                             // Message text (legacy field)
    files?: WebhookFileData[];                 // File array for processing
    conversationId: string;                    // Conversation identifier
    teamId?: string;                           // Slack team ID
    userId?: string;                           // User identifier
    botId?: string;                            // Bot identifier
    channelId?: string;                        // Channel identifier
    threadTs?: string;                         // Thread timestamp
    timestamp?: string;                        // Message timestamp
    isExternal?: boolean;                      // External message flag
    sourceType?: string;                       // Source type identifier
    sentByUserId?: string;                     // Sender user ID
    isAutoresponse?: boolean;                  // Auto-response flag
    triageThreadId?: string | null;            // Triage thread ID
    originalEvent?: string;                    // Original event type
    eventTimestamp?: number;                   // Event timestamp
    webhookTimestamp?: number;                 // Webhook processing timestamp
    metadata?: Record<string, unknown>;        // Additional metadata
    blocks?: Array<Record<string, unknown>>;   // Slack blocks format
    deletedAt?: string | null;                 // Deletion timestamp
  };
  timestamp: number;                           // Event timestamp
  eventId: string;                             // Unique event identifier
}

/**
 * Type guard to validate webhook event structure
 * Ensures event meets our processing requirements
 */
export function isValidWebhookEvent(event: unknown): event is WebhookEvent {
  if (!event || typeof event !== 'object' || event === null) {
    return false;
  }
  
  const obj = event as Record<string, unknown>;
  const data = obj.data as Record<string, unknown> | undefined;
  
  return (
    obj.platform === 'unthread' &&
    obj.targetPlatform === 'telegram' &&
    obj.sourcePlatform === 'dashboard' &&
    obj.type === 'message_created' &&
    typeof obj.eventId === 'string' &&
    typeof obj.timestamp === 'number' &&
    data !== undefined &&
    typeof data.conversationId === 'string'
  );
}

/**
 * Type guard to validate attachment metadata structure
 * Ensures attachment metadata meets our processing requirements
 */
export function hasValidAttachments(event: WebhookEvent): boolean {
  const attachments = event.attachments;
  
  if (!attachments) {
    return true; // No attachments is valid
  }
  
  return (
    typeof attachments.hasFiles === 'boolean' &&
    typeof attachments.fileCount === 'number' &&
    typeof attachments.totalSize === 'number' &&
    Array.isArray(attachments.types) &&
    Array.isArray(attachments.names) &&
    attachments.fileCount >= 0 &&
    attachments.totalSize >= 0 &&
    (!attachments.hasFiles || (
      attachments.fileCount > 0 &&
      attachments.names.length === attachments.fileCount
    ))
  );
}

/**
 * Utility type for attachment processing results
 */
export interface AttachmentProcessingResult {
  success: boolean;
  processedCount: number;
  errors: string[];
  processingTime: number;
}

/**
 * Configuration interface for attachment processing
 */
export interface AttachmentConfig {
  maxFileSize: number;          // Maximum file size in bytes
  maxTotalSize: number;         // Maximum total size for all files
  supportedTypes: string[];     // Supported MIME types
  maxFileCount: number;         // Maximum number of files per message
}
