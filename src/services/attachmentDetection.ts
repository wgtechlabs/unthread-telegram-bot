/**
 * Attachment Detection Service
 * 
 * Clean, metadata-driven attachment detection using the new webhook structure.
 * Replaces complex, error-prone file detection with guaranteed webhook metadata.
 * 
 * Key Features:
 * - Source validation (dashboard-only processing)
 * - Instant attachment detection without array iteration
 * - Image-specific filtering for MVP implementation
 * - Size validation using pre-calculated metadata
 * - Consistent validation with trust-but-verify approach
 * 
 * @author Waren Gonzaga, WG Technology Labs

 * @since August 2025
 */

import { WebhookEvent } from '../types/webhookEvents.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import { getImageProcessingConfig } from '../config/env.js';

type AttachmentMetadata = {
  hasFiles: boolean;
  fileCount: number;
  totalSize: number;
  types: string[];
  names: string[];
};

type ProcessableFile = {
  id?: string;
  name?: string;
  title?: string;
  size?: number;
  mimetype?: string;
  filetype?: string;
  type?: string;
  urlPrivate?: string;
  urlPrivateDownload?: string;
};

export class AttachmentDetectionService {
  private static readValue(record: Record<string, unknown>, key: string): unknown {
    for (const [entryKey, value] of Object.entries(record)) {
      if (entryKey === key) {
        return value;
      }
    }

    return undefined;
  }

  private static readString(record: Record<string, unknown>, key: string): string {
    const value = this.readValue(record, key);
    return typeof value === 'string' ? value.trim() : '';
  }

  private static readNumber(record: Record<string, unknown>, key: string): number | undefined {
    const value = this.readValue(record, key);

    if (typeof value === 'number') {
      return Number.isFinite(value) && value >= 0 ? value : undefined;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value.trim(), 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    }

    return undefined;
  }

  private static readStringArray(record: Record<string, unknown>, key: string): string[] {
    const value = this.readValue(record, key);
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean);
  }

  private static readObject(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const value = this.readValue(record, key);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private static readTopLevelAttachmentMetadata(event: WebhookEvent): AttachmentMetadata | null {
    if (!event.attachments || typeof event.attachments !== 'object') {
      return null;
    }

    const attachments = event.attachments as unknown as Record<string, unknown>;
    const fileCount = this.readNumber(attachments, 'fileCount') ?? this.readNumber(attachments, 'count') ?? 0;
    const totalSize = this.readNumber(attachments, 'totalSize') ?? 0;
    const hasFiles = typeof attachments.hasFiles === 'boolean'
      ? attachments.hasFiles
      : fileCount > 0;

    return {
      hasFiles,
      fileCount,
      totalSize,
      types: this.readStringArray(attachments, 'types'),
      names: this.readStringArray(attachments, 'names')
    };
  }

  private static getMetadataAttachmentRecords(event: WebhookEvent): Record<string, unknown>[] {
    const dataRecord = event.data as unknown as Record<string, unknown>;
    const metadata = this.readObject(dataRecord, 'metadata');
    const payload = metadata ? this.readObject(metadata, 'event_payload') : null;
    const payloadAttachments = payload?.attachments;

    if (Array.isArray(payloadAttachments)) {
      return payloadAttachments
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
    }

    const directAttachments = dataRecord.attachments;
    if (Array.isArray(directAttachments)) {
      return directAttachments
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
    }

    return [];
  }

  static getResolvedAttachments(event: WebhookEvent): AttachmentMetadata | null {
    const topLevelMetadata = this.readTopLevelAttachmentMetadata(event);
    if (topLevelMetadata) {
      return topLevelMetadata;
    }

    const files = this.getProcessableFiles(event);
    if (files.length === 0) {
      return null;
    }

    return {
      hasFiles: true,
      fileCount: files.length,
      totalSize: files.reduce((sum, file) => sum + (typeof file.size === 'number' ? file.size : 0), 0),
      types: [...new Set(files
        .map(file => this.normalizeType(file.mimetype || file.filetype || file.type))
        .filter(Boolean))],
      names: files
        .map((file, index) => file.name || file.title || `attachment-${index + 1}`)
    };
  }

  static getProcessableFiles(event: WebhookEvent): ProcessableFile[] {
    if (Array.isArray(event.data.files) && event.data.files.length > 0) {
      return event.data.files as ProcessableFile[];
    }

    const metadataFiles = this.getMetadataAttachmentRecords(event);
    if (metadataFiles.length === 0) {
      return [];
    }

    const attachments = this.readTopLevelAttachmentMetadata(event);

    return metadataFiles
      .map((file, index): ProcessableFile | null => {
        const id = this.readString(file, 'id') || this.readString(file, 'fileId') || this.readString(file, 'file_id');
        const name = this.readString(file, 'name') || this.readString(file, 'title') || attachments?.names.at(index) || `attachment-${index + 1}`;
        const rawType = this.readString(file, 'mimetype') || this.readString(file, 'mimeType') || this.readString(file, 'type');
        const normalizedType = this.normalizeType(rawType) || rawType;
        const urlPrivate = this.readString(file, 'urlPrivate') || this.readString(file, 'url_private');
        const urlPrivateDownload = this.readString(file, 'urlPrivateDownload') || this.readString(file, 'url_private_download');
        const size = this.readNumber(file, 'size');

        if (!id && !urlPrivate && !urlPrivateDownload) {
          return null;
        }

        return {
          ...(id ? { id } : {}),
          ...(name ? { name, title: name } : {}),
          ...(size !== undefined ? { size } : {}),
          ...(normalizedType ? { mimetype: normalizedType, type: normalizedType } : {}),
          ...(rawType ? { filetype: rawType } : {}),
          ...(urlPrivate ? { urlPrivate } : {}),
          ...(urlPrivateDownload ? { urlPrivateDownload } : {})
        };
      })
      .filter((file): file is ProcessableFile => file !== null);
  }

  /**
   * Normalize incoming attachment type into canonical MIME format.
   * Supports both MIME values (image/png) and extension values (png).
   */
  static normalizeType(rawType: string | undefined): string {
    if (!rawType || typeof rawType !== 'string') {
      return '';
    }

    const normalized = rawType.trim().toLowerCase();
    if (!normalized) {
      return '';
    }

    if (normalized.startsWith('image/')) {
      return normalized;
    }

    switch (normalized) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      default:
        return '';
    }
  }
  
  /**
   * Primary event validation - only process dashboard → telegram events
   * Replaces complex multi-source event routing
   */
  static shouldProcessEvent(event: WebhookEvent): boolean {
    return event.sourcePlatform === 'dashboard' && 
           event.targetPlatform === 'telegram';
  }
  
  /**
   * Primary attachment detection using webhook metadata
   * Replaces complex array checking and location detection
   */
  static hasAttachments(event: WebhookEvent): boolean {
      return this.shouldProcessEvent(event) &&
        this.getResolvedAttachments(event)?.hasFiles === true;
  }
  
  /**
   * Image-specific detection for enhanced attachment processing
   * Uses metadata types array for instant categorization
   */
  static hasImageAttachments(event: WebhookEvent): boolean {
    if (!this.hasAttachments(event)) {
      return false;
    }
    
    return this.getResolvedAttachments(event)?.types?.some(type =>
      this.normalizeType(type).startsWith('image/')
    ) ?? false;
  }
  
  /**
   * Supported image type validation with configuration
   * Only processes image types we can handle reliably
   */
  static hasSupportedImages(event: WebhookEvent): boolean {
    if (!this.hasImageAttachments(event)) {
      return false;
    }
    
    const supportedTypes = getImageProcessingConfig().supportedFormats;
    
    return this.getResolvedAttachments(event)?.types?.some(type =>
      supportedTypes.includes(this.normalizeType(type))
    ) ?? false;
  }
  
  /**
   * Check for unsupported file types (non-images)
   * Enables clear user communication about what we can't process yet
   */
  static hasUnsupportedAttachments(event: WebhookEvent): boolean {
    if (!this.hasAttachments(event)) {
      return false;
    }
    
    // If we have attachments but no supported images, they're unsupported
    return !this.hasSupportedImages(event);
  }
  
  /**
   * Size validation using pre-calculated metadata
   * No need to iterate through files for size calculation
   */
  static isWithinSizeLimit(event: WebhookEvent, maxSizeBytes: number): boolean {
    if (!this.hasAttachments(event)) {
      return true;
    }
    return (this.getResolvedAttachments(event)?.totalSize ?? 0) <= maxSizeBytes;
  }
  
  /**
   * Check if files exceed size limits
   * Enables specific messaging for oversized files
   */
  static isOversized(event: WebhookEvent, maxSizeBytes: number): boolean {
    if (!this.hasAttachments(event)) {
      return false;
    }
    return (this.getResolvedAttachments(event)?.totalSize ?? 0) > maxSizeBytes;
  }
  
  /**
   * Get attachment summary for logging/UI
   * Ready-to-use summary without manual calculation
   */
  static getAttachmentSummary(event: WebhookEvent): string {
    if (!this.hasAttachments(event)) {
      return 'No attachments';
    }
    
    const attachments = this.getResolvedAttachments(event);
    if (!attachments) {
      return 'No attachments';
    }
    
    const { fileCount, totalSize, types } = attachments;
    const sizeMB = Math.round(totalSize / 1024 / 1024 * 100) / 100;
    const typeList = types.join(', ');
    
    return `${fileCount} files (${sizeMB}MB) - ${typeList}`;
  }
  
  /**
   * Get file count without array access
   * Instant count from metadata
   */
  static getFileCount(event: WebhookEvent): number {
    return this.getResolvedAttachments(event)?.fileCount || 0;
  }
  
  /**
   * Get total size without calculation
   * Pre-calculated size from metadata
   */
  static getTotalSize(event: WebhookEvent): number {
    return this.getResolvedAttachments(event)?.totalSize || 0;
  }
  
  /**
   * Get unique file types without iteration
   * Deduplicated types from metadata
   */
  static getFileTypes(event: WebhookEvent): string[] {
    return this.getResolvedAttachments(event)?.types || [];
  }
  
  /**
   * Get file names with guaranteed correlation to data.files
   * names[i] corresponds to data.files[i]
   */
  static getFileNames(event: WebhookEvent): string[] {
    return this.getResolvedAttachments(event)?.names || [];
  }
  
  /**
   * Validate metadata consistency (trust but verify)
   * Ensures webhook metadata matches actual file data
   */
  static validateConsistency(event: WebhookEvent): boolean {
    if (!this.shouldProcessEvent(event)) {
      return false;
    }
    
    const metadata = this.getResolvedAttachments(event);
    const files = this.getProcessableFiles(event);
    
    // No files scenario - both should be empty/false
    if (!metadata?.hasFiles && files.length === 0) {
      return true;
    }
    
    // Has files scenario - counts should match
    if (metadata?.hasFiles && files.length === metadata.fileCount) {
      return true;
    }
    
    // Inconsistency detected
    LogEngine.warn('Attachment metadata inconsistency detected', {
      metadataHasFiles: metadata?.hasFiles,
      metadataCount: metadata?.fileCount,
      actualFilesCount: files.length,
      eventId: event.eventId,
      sourcePlatform: event.sourcePlatform,
      conversationId: event.data.conversationId
    });
    
    return false;
  }
  
  /**
   * Generate processing decision summary
   * Helpful for logging and debugging
   */
  static getProcessingDecision(event: WebhookEvent, maxSizeBytes: number = getImageProcessingConfig().maxImageSize * getImageProcessingConfig().maxImagesPerBatch): {
    shouldProcess: boolean;
    hasAttachments: boolean;
    hasImages: boolean;
    hasSupportedImages: boolean;
    hasUnsupported: boolean;
    isOversized: boolean;
    summary: string;
    reason: string;
  } {
    const shouldProcess = this.shouldProcessEvent(event);
    const hasAttachments = this.hasAttachments(event);
    const hasImages = this.hasImageAttachments(event);
    const hasSupportedImages = this.hasSupportedImages(event);
    const hasUnsupported = this.hasUnsupportedAttachments(event);
    const isOversized = this.isOversized(event, maxSizeBytes);
    const summary = this.getAttachmentSummary(event);
    
    let reason = '';
    if (!shouldProcess) {
      reason = 'Non-dashboard event';
    } else if (!hasAttachments) {
      reason = 'No attachments';
    } else if (isOversized) {
      reason = 'Files too large';
    } else if (hasUnsupported) {
      reason = 'Unsupported file types';
    } else if (hasSupportedImages) {
      reason = 'Ready for image processing';
    } else {
      reason = 'Unknown state';
    }
    
    return {
      shouldProcess,
      hasAttachments,
      hasImages,
      hasSupportedImages,
      hasUnsupported,
      isOversized,
      summary,
      reason
    };
  }
}
