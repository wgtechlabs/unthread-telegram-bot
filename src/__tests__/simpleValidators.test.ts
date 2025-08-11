/**
 * Unit tests for simpleValidators utilities
 */
import { describe, expect, it } from 'vitest';
import { SimpleInputValidator } from '../utils/simpleValidators';

describe('SimpleInputValidator', () => {
  describe('validateSummary', () => {
    it('should validate a good summary', () => {
      const result = SimpleInputValidator.validateSummary('This is a detailed description of my issue with the system');
      
      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
      expect(result.suggestion).toBeUndefined();
    });

    it('should reject empty input', () => {
      const result = SimpleInputValidator.validateSummary('');
      
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Please provide a description of your issue');
      expect(result.suggestion).toBe('Tell us what problem you\'re experiencing');
    });

    it('should reject whitespace-only input', () => {
      const result = SimpleInputValidator.validateSummary('   \n\t  ');
      
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Please provide a description of your issue');
      expect(result.suggestion).toBe('Tell us what problem you\'re experiencing');
    });

    it('should reject input that is too short', () => {
      const result = SimpleInputValidator.validateSummary('Too short');
      
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Description too brief (9 characters)');
      expect(result.suggestion).toBe('Please provide at least 10 characters with more details about the issue');
    });

    it('should handle input at minimum length', () => {
      const result = SimpleInputValidator.validateSummary('1234567890'); // exactly 10 chars
      
      expect(result.isValid).toBe(true);
    });

    it('should reject input that is too long', () => {
      const longText = 'a'.repeat(5000); // Exceeds 4096 char limit
      const result = SimpleInputValidator.validateSummary(longText);
      
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Description too long (5000 characters)');
      expect(result.suggestion).toBe('Please keep it under 4096 characters. Break it into smaller parts if needed.');
    });

    it('should handle input at maximum length', () => {
      const maxText = 'a'.repeat(4096); // exactly at limit
      const result = SimpleInputValidator.validateSummary(maxText);
      
      expect(result.isValid).toBe(true);
    });

    it('should trim input before validation', () => {
      const result = SimpleInputValidator.validateSummary('   This is a good description with proper length   ');
      
      expect(result.isValid).toBe(true);
    });

    it('should count trimmed length for validation', () => {
      const result = SimpleInputValidator.validateSummary('   short   '); // only 5 chars after trim
      
      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Description too brief (5 characters)');
    });
  });

  describe('getStats', () => {
    it('should count characters and words correctly', () => {
      const stats = SimpleInputValidator.getStats('This is a test message');
      
      expect(stats).toBe('22 characters, 5 words');
    });

    it('should handle single word', () => {
      const stats = SimpleInputValidator.getStats('Hello');
      
      expect(stats).toBe('5 characters, 1 word');
    });

    it('should handle empty string', () => {
      const stats = SimpleInputValidator.getStats('');
      
      expect(stats).toBe('0 characters, 0 words');
    });

    it('should handle whitespace-only string', () => {
      const stats = SimpleInputValidator.getStats('   \n\t  ');
      
      expect(stats).toBe('0 characters, 0 words'); // Should be trimmed
    });

    it('should handle multiple spaces between words', () => {
      const stats = SimpleInputValidator.getStats('Hello    world    test');
      
      expect(stats).toBe('22 characters, 3 words');
    });

    it('should trim input before counting', () => {
      const stats = SimpleInputValidator.getStats('   Hello world   ');
      
      expect(stats).toBe('11 characters, 2 words');
    });

    it('should handle newlines and tabs in word counting', () => {
      const stats = SimpleInputValidator.getStats('Word1\nWord2\tWord3');
      
      expect(stats).toBe('17 characters, 3 words');
    });

    it('should filter out empty words from splits', () => {
      const stats = SimpleInputValidator.getStats('a  b   c    d');
      
      expect(stats).toBe('13 characters, 4 words');
    });
  });
});