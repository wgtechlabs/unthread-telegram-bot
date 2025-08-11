/**
 * Attachment Detection Service Test Suite
 * 
 * Comprehensive tests for attachment detection functionality including
 * event validation, attachment detection, image processing, and metadata handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AttachmentDetectionService } from '../services/attachmentDetection.js';
import { WebhookEvent } from '../types/webhookEvents.js';

// Mock dependencies
vi.mock('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../config/env.js', () => ({
  getImageProcessingConfig: vi.fn().mockReturnValue({
    enabled: true,
    maxSize: 10485760, // 10MB
    supportedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    quality: 85
  })
}));

describe('AttachmentDetectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shouldProcessEvent', () => {
    it('should return true for dashboard to telegram events', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {}
      };

      const result = AttachmentDetectionService.shouldProcessEvent(event);
      expect(result).toBe(true);
    });

    it('should return false for non-dashboard source events', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'slack',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {}
      };

      const result = AttachmentDetectionService.shouldProcessEvent(event);
      expect(result).toBe(false);
    });

    it('should return false for non-telegram target events', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'slack',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {}
      };

      const result = AttachmentDetectionService.shouldProcessEvent(event);
      expect(result).toBe(false);
    });

    it('should return false for telegram to dashboard events', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'telegram',
        targetPlatform: 'dashboard',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {}
      };

      const result = AttachmentDetectionService.shouldProcessEvent(event);
      expect(result).toBe(false);
    });
  });

  describe('hasAttachments', () => {
    it('should return true when event has attachments', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: true,
          count: 2,
          totalSize: 1024000
        }
      };

      const result = AttachmentDetectionService.hasAttachments(event);
      expect(result).toBe(true);
    });

    it('should return false when event has no attachments', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: false,
          count: 0,
          totalSize: 0
        }
      };

      const result = AttachmentDetectionService.hasAttachments(event);
      expect(result).toBe(false);
    });

    it('should return false when attachments is undefined', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {}
      };

      const result = AttachmentDetectionService.hasAttachments(event);
      expect(result).toBe(false);
    });

    it('should return false for non-processable events', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'slack',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: true,
          count: 1,
          totalSize: 1024
        }
      };

      const result = AttachmentDetectionService.hasAttachments(event);
      expect(result).toBe(false);
    });
  });

  describe('hasImageAttachments', () => {
    it('should return true when event has image attachments', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: true,
          count: 2,
          totalSize: 1024000,
          types: ['image/jpeg', 'image/png']
        }
      };

      const result = AttachmentDetectionService.hasImageAttachments(event);
      expect(result).toBe(true);
    });

    it('should return false when event has no attachments', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {}
      };

      const result = AttachmentDetectionService.hasImageAttachments(event);
      expect(result).toBe(false);
    });

    it('should return false when event has non-image attachments', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: true,
          count: 1,
          totalSize: 1024,
          types: ['application/pdf', 'text/plain']
        }
      };

      const result = AttachmentDetectionService.hasImageAttachments(event);
      expect(result).toBe(false);
    });

    it('should return false when types array is empty', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: true,
          count: 1,
          totalSize: 1024,
          types: []
        }
      };

      const result = AttachmentDetectionService.hasImageAttachments(event);
      expect(result).toBe(false);
    });

    it('should return false when types is undefined', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: true,
          count: 1,
          totalSize: 1024
        }
      };

      const result = AttachmentDetectionService.hasImageAttachments(event);
      expect(result).toBe(false);
    });
  });

  describe('Event Validation Edge Cases', () => {
    it('should handle events with missing required fields', () => {
      const incompleteEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram'
        // Missing eventType, timestamp, data
      } as WebhookEvent;

      const result = AttachmentDetectionService.shouldProcessEvent(incompleteEvent);
      expect(result).toBe(true); // Still validates source/target correctly
    });

    it('should handle events with null values', () => {
      const eventWithNulls: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: null as any
      };

      const hasAttachments = AttachmentDetectionService.hasAttachments(eventWithNulls);
      const hasImages = AttachmentDetectionService.hasImageAttachments(eventWithNulls);
      
      expect(hasAttachments).toBe(false);
      expect(hasImages).toBe(false);
    });
  });

  describe('Attachment Metadata Validation', () => {
    it('should handle mixed attachment types', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: true,
          count: 3,
          totalSize: 2048000,
          types: ['image/jpeg', 'application/pdf', 'image/png']
        }
      };

      const hasAttachments = AttachmentDetectionService.hasAttachments(event);
      const hasImages = AttachmentDetectionService.hasImageAttachments(event);
      
      expect(hasAttachments).toBe(true);
      expect(hasImages).toBe(true);
    });

    it('should handle zero count with hasFiles true', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: true,
          count: 0,
          totalSize: 0
        }
      };

      const result = AttachmentDetectionService.hasAttachments(event);
      expect(result).toBe(true); // hasFiles takes precedence
    });

    it('should handle large file sizes', () => {
      const event: WebhookEvent = {
        sourcePlatform: 'dashboard',
        targetPlatform: 'telegram',
        eventType: 'message',
        timestamp: new Date().toISOString(),
        data: {},
        attachments: {
          hasFiles: true,
          count: 1,
          totalSize: 50000000, // 50MB
          types: ['image/jpeg']
        }
      };

      const hasAttachments = AttachmentDetectionService.hasAttachments(event);
      const hasImages = AttachmentDetectionService.hasImageAttachments(event);
      
      expect(hasAttachments).toBe(true);
      expect(hasImages).toBe(true);
    });
  });

  describe('Image Type Detection', () => {
    it('should detect common image formats', () => {
      const imageTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp',
        'image/svg+xml'
      ];

      imageTypes.forEach(type => {
        const event: WebhookEvent = {
          sourcePlatform: 'dashboard',
          targetPlatform: 'telegram',
          eventType: 'message',
          timestamp: new Date().toISOString(),
          data: {},
          attachments: {
            hasFiles: true,
            count: 1,
            totalSize: 1024,
            types: [type]
          }
        };

        const result = AttachmentDetectionService.hasImageAttachments(event);
        expect(result).toBe(true);
      });
    });

    it('should ignore non-image formats', () => {
      const nonImageTypes = [
        'application/pdf',
        'text/plain',
        'application/json',
        'video/mp4',
        'audio/mpeg',
        'application/zip'
      ];

      nonImageTypes.forEach(type => {
        const event: WebhookEvent = {
          sourcePlatform: 'dashboard',
          targetPlatform: 'telegram',
          eventType: 'message',
          timestamp: new Date().toISOString(),
          data: {},
          attachments: {
            hasFiles: true,
            count: 1,
            totalSize: 1024,
            types: [type]
          }
        };

        const result = AttachmentDetectionService.hasImageAttachments(event);
        expect(result).toBe(false);
      });
    });
  });
});