/**
 * Unit tests for messageExamples module
 */
import { describe, expect, it } from 'vitest';
import {
  benefits,
  implementation,
  messageExamples
} from '../utils/messageExamples';

describe('messageExamples', () => {
  describe('messageExamples object', () => {
    it('should have old and new approaches', () => {
      expect(messageExamples).toHaveProperty('old');
      expect(messageExamples).toHaveProperty('new');
    });

    describe('old approach', () => {
      it('should have all required message types', () => {
        const { old } = messageExamples;
        
        expect(old).toHaveProperty('textOnly');
        expect(old).toHaveProperty('withAttachments');
        expect(old).toHaveProperty('mediaGroup');
      });

      it('should contain appropriate old-style messaging', () => {
        const { old } = messageExamples;
        
        expect(old.textOnly).toContain('Adding to ticket');
        expect(old.withAttachments).toContain('Processing files');
        expect(old.mediaGroup).toContain('Processing 3 files');
      });

      it('should use generic technical language', () => {
        const { old } = messageExamples;
        const messages = Object.values(old);
        
        messages.forEach(message => {
          expect(typeof message).toBe('string');
          expect(message.length).toBeGreaterThan(0);
        });
      });
    });

    describe('new approach', () => {
      it('should have comprehensive message types', () => {
        const { new: newApproach } = messageExamples;
        
        expect(newApproach).toHaveProperty('textOnly');
        expect(newApproach).toHaveProperty('singleImage');
        expect(newApproach).toHaveProperty('singleDocument');
        expect(newApproach).toHaveProperty('singleVideo');
        expect(newApproach).toHaveProperty('multipleImages');
        expect(newApproach).toHaveProperty('mixedFiles');
        expect(newApproach).toHaveProperty('imageOnly');
        expect(newApproach).toHaveProperty('imagesOnly');
        expect(newApproach).toHaveProperty('ticketCreation');
        expect(newApproach).toHaveProperty('agentReply');
        expect(newApproach).toHaveProperty('ticketReply');
      });

      it('should use user-friendly language', () => {
        const { new: newApproach } = messageExamples;
        
        expect(newApproach.textOnly).toContain('Sending your message');
        expect(newApproach.singleImage).toContain('message and image');
        expect(newApproach.singleDocument).toContain('message and document');
        expect(newApproach.singleVideo).toContain('message and video');
      });

      it('should differentiate between file types', () => {
        const { new: newApproach } = messageExamples;
        
        expect(newApproach.singleImage).toContain('image');
        expect(newApproach.singleDocument).toContain('document');
        expect(newApproach.singleVideo).toContain('video');
        expect(newApproach.multipleImages).toContain('images');
        expect(newApproach.mixedFiles).toContain('files');
      });

      it('should handle multiple attachments appropriately', () => {
        const { new: newApproach } = messageExamples;
        
        expect(newApproach.multipleImages).toContain('3 images');
        expect(newApproach.mixedFiles).toContain('5 files');
        expect(newApproach.imagesOnly).toContain('2 images');
        expect(newApproach.ticketReply).toContain('2 videos');
      });

      it('should provide context-aware messages', () => {
        const { new: newApproach } = messageExamples;
        
        expect(newApproach.ticketCreation).toContain('Creating Your Ticket');
        expect(newApproach.agentReply).toContain('response');
        expect(newApproach.ticketReply).toContain('support team');
      });

      it('should handle file-only scenarios', () => {
        const { new: newApproach } = messageExamples;
        
        expect(newApproach.imageOnly).toContain('Sending your image');
        expect(newApproach.imagesOnly).toContain('Sending your 2 images');
        expect(newApproach.imageOnly).not.toContain('message and');
        expect(newApproach.imagesOnly).not.toContain('message and');
      });

      it('should have consistent emoji usage', () => {
        const { new: newApproach } = messageExamples;
        
        Object.values(newApproach).forEach(message => {
          expect(message).toMatch(/⏳|🎫/); // Should contain loading or ticket emoji
        });
      });

      it('should emphasize communication over processing', () => {
        const { new: newApproach } = messageExamples;
        const messages = Object.values(newApproach);
        
        const sendingCount = messages.filter(msg => msg.includes('Sending')).length;
        const processingCount = messages.filter(msg => msg.includes('Processing')).length;
        
        expect(sendingCount).toBeGreaterThan(processingCount);
      });
    });
  });

  describe('benefits array', () => {
    it('should be an array of strings', () => {
      expect(Array.isArray(benefits)).toBe(true);
      expect(benefits.length).toBeGreaterThan(0);
      
      benefits.forEach(benefit => {
        expect(typeof benefit).toBe('string');
        expect(benefit.length).toBeGreaterThan(0);
      });
    });

    it('should contain expected benefits', () => {
      const benefitText = benefits.join(' ');
      
      expect(benefitText).toContain('User-friendly language');
      expect(benefitText).toContain('Context-aware');
      expect(benefitText).toContain('Natural counting');
      expect(benefitText).toContain('Intent-focused');
      expect(benefitText).toContain('Consistent across all contexts');
      expect(benefitText).toContain('Single source of truth');
      expect(benefitText).toContain('Easy to maintain');
    });

    it('should start each benefit with a checkmark', () => {
      benefits.forEach(benefit => {
        expect(benefit).toMatch(/^✅/);
      });
    });

    it('should cover key messaging improvements', () => {
      const benefitText = benefits.join(' ');
      
      // Should mention the old vs new comparison
      expect(benefitText).toContain('vs');
      
      // Should mention different file types
      expect(benefitText).toContain('images');
      expect(benefitText).toContain('documents');
      expect(benefitText).toContain('videos');
    });
  });

  describe('implementation object', () => {
    it('should have all required implementation details', () => {
      expect(implementation).toHaveProperty('fileDetection');
      expect(implementation).toHaveProperty('contentAnalysis');
      expect(implementation).toHaveProperty('smartCounting');
      expect(implementation).toHaveProperty('contextAware');
      expect(implementation).toHaveProperty('fallbackSafe');
    });

    it('should contain meaningful implementation descriptions', () => {
      Object.values(implementation).forEach(description => {
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(10);
      });
    });

    it('should describe technical capabilities', () => {
      expect(implementation.fileDetection).toContain('Telegram message types');
      expect(implementation.contentAnalysis).toContain('text, attachments');
      expect(implementation.smartCounting).toContain('similar file types');
      expect(implementation.contextAware).toContain('ticket creation');
      expect(implementation.fallbackSafe).toContain('Graceful degradation');
    });

    it('should mention specific Telegram features', () => {
      expect(implementation.fileDetection).toContain('photo');
      expect(implementation.fileDetection).toContain('document');
      expect(implementation.fileDetection).toContain('video');
      expect(implementation.fileDetection).toContain('audio');
    });

    it('should describe different contexts', () => {
      expect(implementation.contextAware).toContain('creation');
      expect(implementation.contextAware).toContain('replies');
      expect(implementation.contextAware).toContain('agent responses');
    });
  });

  describe('data structure consistency', () => {
    it('should have consistent data types', () => {
      expect(typeof messageExamples).toBe('object');
      expect(Array.isArray(benefits)).toBe(true);
      expect(typeof implementation).toBe('object');
    });

    it('should not have circular references', () => {
      expect(() => JSON.stringify(messageExamples)).not.toThrow();
      expect(() => JSON.stringify(benefits)).not.toThrow();
      expect(() => JSON.stringify(implementation)).not.toThrow();
    });

    it('should have non-empty content', () => {
      expect(Object.keys(messageExamples).length).toBeGreaterThan(0);
      expect(benefits.length).toBeGreaterThan(0);
      expect(Object.keys(implementation).length).toBeGreaterThan(0);
    });
  });

  describe('message quality standards', () => {
    it('should have professional messaging tone', () => {
      const allMessages = [
        ...Object.values(messageExamples.old),
        ...Object.values(messageExamples.new)
      ];

      allMessages.forEach(message => {
        // Should not contain profanity or unprofessional language
        expect(message).not.toMatch(/\b(damn|hell|crap|stupid|dumb)\b/i);
        
        // Should be properly capitalized (use Array.from to properly handle multi-byte Unicode)
        const firstChar = Array.from(message)[0];
        expect(firstChar).toMatch(/[A-Z⏳🎫]/u);
        
        // Should not be too long
        expect(message.length).toBeLessThan(200);
      });
    });

    it('should maintain consistency in emoji usage', () => {
      const newMessages = Object.values(messageExamples.new);
      const emojiPattern = /^[⏳🎫]/u;
      
      newMessages.forEach(message => {
        expect(message).toMatch(emojiPattern);
      });
    });

    it('should use consistent terminology', () => {
      const newMessages = Object.values(messageExamples.new);
      const supportTerms = newMessages.filter(msg => msg.includes('support team'));
      
      expect(supportTerms.length).toBeGreaterThan(0);
      
      // Should consistently use "support team" not variations
      newMessages.forEach(message => {
        if (message.includes('support')) {
          expect(message).toContain('support team');
        }
      });
    });
  });
});