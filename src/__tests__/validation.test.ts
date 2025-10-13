/**
 * Unit tests for validation utilities
 */
import { describe, expect, it } from 'vitest';
import {
  isValidUUID,
  validateCustomerId,
  validateCustomerName,
  validateEmail,
  validateSupportSummary
} from '../commands/utils/validation';

describe('validation utilities', () => {
  describe('isValidUUID', () => {
    it('should return true for valid UUID format', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
        'ffffffff-ffff-4fff-afff-ffffffffffff',
        '12345678-1234-1234-1234-123456789abc' // less strict validation
      ];

      validUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it('should return false for invalid UUID formats', () => {
      const invalidUUIDs = [
        '550e8400-e29b-41d4-a716',              // too short
        '550e8400-e29b-41d4-a716-446655440000-extra', // too long
        '550e8400e29b41d4a716446655440000',      // no hyphens
        'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',  // invalid chars
        '',                                      // empty
        'not-a-uuid'                            // completely invalid
      ];

      invalidUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(false);
      });
    });
  });

  describe('validateCustomerName', () => {
    it('should return valid result for good customer names', () => {
      const validNames = ['John Doe', 'Alice', 'Bob Smith Jr.', 'María González'];

      validNames.forEach(name => {
        const result = validateCustomerName(name);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(name.trim());
        expect(result.error).toBeUndefined();
      });
    });

    it('should trim whitespace and return sanitized value', () => {
      const result = validateCustomerName('  John Doe  ');
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('John Doe');
    });

    it('should reject null/undefined input', () => {
      const invalidInputs = [null, undefined, ''];

      invalidInputs.forEach(input => {
        const result = validateCustomerName(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Customer name is required');
        expect(result.details).toBe('Please provide a valid customer name');
      });
    });

    it('should reject non-string input', () => {
      const nonStringInputs = [123, {}, [], true];

      nonStringInputs.forEach(input => {
        const result = validateCustomerName(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Customer name is required');
      });
    });

    it('should reject empty string after trimming', () => {
      const result = validateCustomerName('   ');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Customer name cannot be empty');
      expect(result.details).toBe('Please provide a valid customer name');
    });

    it('should reject names too short (less than 2 characters)', () => {
      const result = validateCustomerName('A');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Customer name too short');
      expect(result.details).toBe('Customer name must be at least 2 characters long');
    });

    it('should accept minimum length names (2 characters)', () => {
      const result = validateCustomerName('Jo');
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('Jo');
    });

    it('should reject names too long (more than 100 characters)', () => {
      const longName = 'A'.repeat(101);
      const result = validateCustomerName(longName);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Customer name too long');
      expect(result.details).toBe('Customer name must be 100 characters or less');
    });

    it('should accept maximum length names (100 characters)', () => {
      const maxName = 'A'.repeat(100);
      const result = validateCustomerName(maxName);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(maxName);
    });

    it('should reject reserved words', () => {
      const reservedWords = ['admin', 'administrator', 'root', 'system', 'bot', 'null', 'undefined'];
      
      reservedWords.forEach(word => {
        const result = validateCustomerName(word);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Reserved name');
        expect(result.details).toBe(`'${word}' is a reserved name. Please choose a different name.`);
      });
    });

    it('should reject reserved words case-insensitively', () => {
      const caseVariants = ['ADMIN', 'Admin', 'aDmIn', 'ROOT', 'Root', 'BOT', 'Bot'];
      
      caseVariants.forEach(word => {
        const result = validateCustomerName(word);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Reserved name');
        expect(result.details).toContain('is a reserved name');
      });
    });

    it('should allow names that contain reserved words but are not exact matches', () => {
      const validNames = ['Administrator John', 'Bot Master', 'System Admin', 'Johnny Admin'];
      
      validNames.forEach(name => {
        const result = validateCustomerName(name);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(name);
      });
    });
  });

  describe('validateEmail', () => {
    it('should return valid result for good email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.email@domain.co.uk',
        'user+tag@gmail.com',
        'firstname.lastname@company.org'
      ];

      validEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(email.toLowerCase());
      });
    });

    it('should trim whitespace and convert to lowercase', () => {
      const result = validateEmail('  USER@EXAMPLE.COM  ');
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('user@example.com');
    });

    it('should reject null/undefined input', () => {
      const invalidInputs = [null, undefined, ''];

      invalidInputs.forEach(input => {
        const result = validateEmail(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Email is required');
        expect(result.details).toBe('Please provide a valid email address');
      });
    });

    it('should reject non-string input', () => {
      const nonStringInputs = [123, {}, [], true];

      nonStringInputs.forEach(input => {
        const result = validateEmail(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Email is required');
      });
    });

    it('should reject empty string after trimming', () => {
      const result = validateEmail('   ');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Email cannot be empty');
      expect(result.details).toBe('Please provide a valid email address');
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain',
        'user name@domain.com',
        'user@domain .com'
      ];

      invalidEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid email format');
        expect(result.details).toBe('Please provide a valid email address (e.g., user@example.com)');
      });
    });

    it('should reject emails that are too long (more than 254 characters)', () => {
      const longEmail = 'a'.repeat(250) + '@example.com'; // Creates an email > 254 chars
      const result = validateEmail(longEmail);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Email too long');
      expect(result.details).toBe('Email address must be 254 characters or less');
    });

    it('should accept emails at maximum length (254 characters)', () => {
      // Create an email that's exactly 254 characters
      const localPart = 'a'.repeat(240); // 240 chars
      const email = `${localPart}@example.com`; // 240 + 1 + 11 + 1 + 3 = 254 chars
      
      const result = validateEmail(email);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateCustomerId', () => {
    it('should return valid result for good UUID customer IDs', () => {
      const validIds = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      ];

      validIds.forEach(id => {
        const result = validateCustomerId(id);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(id.toLowerCase());
      });
    });

    it('should trim whitespace and convert to lowercase', () => {
      const result = validateCustomerId('  550E8400-E29B-41D4-A716-446655440000  ');
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should reject null/undefined input', () => {
      const invalidInputs = [null, undefined, ''];

      invalidInputs.forEach(input => {
        const result = validateCustomerId(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Customer ID is required');
        expect(result.details).toBe('Please provide a valid customer ID');
      });
    });

    it('should reject non-string input', () => {
      const nonStringInputs = [123, {}, [], true];

      nonStringInputs.forEach(input => {
        const result = validateCustomerId(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Customer ID is required');
      });
    });

    it('should reject empty string after trimming', () => {
      const result = validateCustomerId('   ');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Customer ID cannot be empty');
      expect(result.details).toBe('Please provide a valid customer ID');
    });

    it('should reject invalid UUID formats', () => {
      const invalidIds = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',              // too short
        'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'   // invalid chars
      ];

      invalidIds.forEach(id => {
        const result = validateCustomerId(id);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid customer ID format');
        expect(result.details).toBe('Customer ID must be in UUID format (e.g., ee19d165-a170-4261-8a4b-569c6a1bbcb7)');
      });
    });
  });

  describe('validateSupportSummary', () => {
    it('should return valid result for good summaries', () => {
      const validSummaries = [
        'Login issue with mobile app',
        'Payment not processing correctly',
        'Unable to access dashboard features',
        'A'.repeat(500) // max length
      ];

      validSummaries.forEach(summary => {
        const result = validateSupportSummary(summary);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(summary.trim());
      });
    });

    it('should trim whitespace and return sanitized value', () => {
      const result = validateSupportSummary('  Login issue  ');
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('Login issue');
    });

    it('should reject null/undefined input', () => {
      const invalidInputs = [null, undefined, ''];

      invalidInputs.forEach(input => {
        const result = validateSupportSummary(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Summary is required');
        expect(result.details).toBe('Please provide a brief summary of your issue');
      });
    });

    it('should reject non-string input', () => {
      const nonStringInputs = [123, {}, [], true];

      nonStringInputs.forEach(input => {
        const result = validateSupportSummary(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Summary is required');
      });
    });

    it('should reject empty string after trimming', () => {
      const result = validateSupportSummary('   ');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Summary cannot be empty');
      expect(result.details).toBe('Please provide a brief summary of your issue');
    });

    it('should reject summaries too short (less than 5 characters)', () => {
      const shortSummaries = ['Help', 'Fix', 'Bug', 'Err'];

      shortSummaries.forEach(summary => {
        const result = validateSupportSummary(summary);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Summary too short');
        expect(result.details).toBe('Please provide at least 5 characters for the summary');
      });
    });

    it('should accept minimum length summaries (5 characters)', () => {
      const result = validateSupportSummary('Issue');
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('Issue');
    });

    it('should reject summaries too long (more than 500 characters)', () => {
      const longSummary = 'A'.repeat(501);
      const result = validateSupportSummary(longSummary);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Summary too long');
      expect(result.details).toBe('Summary must be 500 characters or less');
    });

    it('should accept maximum length summaries (500 characters)', () => {
      const maxSummary = 'A'.repeat(500);
      const result = validateSupportSummary(maxSummary);
      
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(maxSummary);
    });

    it('should handle summaries with special characters', () => {
      const summariesWithSpecialChars = [
        'Issue with @mentions not working',
        'Payment failed with $100 transaction',
        'Error: 404 not found',
        'Can\'t login with email@domain.com'
      ];

      summariesWithSpecialChars.forEach(summary => {
        const result = validateSupportSummary(summary);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(summary);
      });
    });
  });

  describe('ValidationResult interface', () => {
    it('should have correct structure for valid results', () => {
      const result = validateCustomerName('John Doe');
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('sanitizedValue');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('John Doe');
      expect(result.error).toBeUndefined();
      expect(result.details).toBeUndefined();
    });

    it('should have correct structure for invalid results', () => {
      const result = validateCustomerName('');
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('details');
      expect(result.isValid).toBe(false);
      expect(result.sanitizedValue).toBeUndefined();
      expect(typeof result.error).toBe('string');
      expect(typeof result.details).toBe('string');
    });
  });
});