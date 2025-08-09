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

export class AttachmentDetectionService {
  
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
           event.attachments?.hasFiles === true;
  }
  
  /**
   * Image-specific detection for enhanced attachment processing
   * Uses metadata types array for instant categorization
   */
  static hasImageAttachments(event: WebhookEvent): boolean {
    if (!this.hasAttachments(event)) {
      return false;
    }
    
    return event.attachments?.types?.some(type => 
      type.startsWith('image/')
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
    
    return event.attachments?.types?.some(type => 
      supportedTypes.includes(type.toLowerCase())
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
    return (event.attachments?.totalSize ?? 0) <= maxSizeBytes;
  }
  
  /**
   * Check if files exceed size limits
   * Enables specific messaging for oversized files
   */
  static isOversized(event: WebhookEvent, maxSizeBytes: number): boolean {
    if (!this.hasAttachments(event)) {
      return false;
    }
    return (event.attachments?.totalSize ?? 0) > maxSizeBytes;
  }
  
  /**
   * Get attachment summary for logging/UI
   * Ready-to-use summary without manual calculation
   */
  static getAttachmentSummary(event: WebhookEvent): string {
    if (!this.hasAttachments(event)) {
      return 'No attachments';
    }
    
    const attachments = event.attachments;
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
    return event.attachments?.fileCount || 0;
  }
  
  /**
   * Get total size without calculation
   * Pre-calculated size from metadata
   */
  static getTotalSize(event: WebhookEvent): number {
    return event.attachments?.totalSize || 0;
  }
  
  /**
   * Get unique file types without iteration
   * Deduplicated types from metadata
   */
  static getFileTypes(event: WebhookEvent): string[] {
    return event.attachments?.types || [];
  }
  
  /**
   * Get file names with guaranteed correlation to data.files
   * names[i] corresponds to data.files[i]
   */
  static getFileNames(event: WebhookEvent): string[] {
    return event.attachments?.names || [];
  }
  
  /**
   * Validate metadata consistency (trust but verify)
   * Ensures webhook metadata matches actual file data
   */
  static validateConsistency(event: WebhookEvent): boolean {
    if (!this.shouldProcessEvent(event)) {
      return false;
    }
    
    const metadata = event.attachments;
    const files = event.data.files;
    
    // No files scenario - both should be empty/false
    if (!metadata?.hasFiles && (!files || files.length === 0)) {
      return true;
    }
    
    // Has files scenario - counts should match
    if (metadata?.hasFiles && files && files.length === metadata.fileCount) {
      return true;
    }
    
    // Inconsistency detected
    LogEngine.warn('Attachment metadata inconsistency detected', {
      metadataHasFiles: metadata?.hasFiles,
      metadataCount: metadata?.fileCount,
      actualFilesCount: files?.length || 0,
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
