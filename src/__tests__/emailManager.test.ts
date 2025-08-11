/**
 * Unit tests for emailManager utilities
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  validateEmail,
  generateDummyEmail,
  type EmailValidationResult
} from '../utils/emailManager';

describe('emailManager utilities', () => {
  // Store original env to restore after tests
  const originalEnv = process.env;

  beforeEach(() => {
    // Create fresh env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('validateEmail', () => {
    it('should return valid result for good email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.email@domain.co.uk',
        'user+tag@gmail.com',
        'firstname.lastname@company.org',
        'user123@test-domain.com',
        'a@b.co'
      ];

      validEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(email.toLowerCase());
        expect(result.error).toBeUndefined();
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
        expect(result.error).toBe('Email address is required');
        expect(result.sanitizedValue).toBeUndefined();
      });
    });

    it('should reject non-string input', () => {
      const nonStringInputs = [123, {}, [], true];

      nonStringInputs.forEach(input => {
        const result = validateEmail(input as any);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Email address is required');
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain',
        'user name@domain.com'  // spaces not allowed
      ];

      invalidEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.error).toMatch(/valid email address|Email address format is invalid/);
      });
    });

    it('should reject emails with consecutive dots', () => {
      const result = validateEmail('user..name@domain.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Email address format is invalid');
    });

    it('should reject emails starting with dot', () => {
      const result = validateEmail('.user@domain.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Email address format is invalid');
    });

    it('should reject emails ending with dot', () => {
      const result = validateEmail('user@domain.com.');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Please enter a valid email address (e.g., user@example.com)');
    });

    it('should reject emails that are too long', () => {
      // Create an email longer than 254 characters
      const longLocalPart = 'a'.repeat(240);
      const longEmail = `${longLocalPart}@verylongdomainname.com`;
      
      const result = validateEmail(longEmail);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Email address is too long (maximum 254 characters)');
    });

    it('should accept emails at maximum length', () => {
      // Create an email that's close to but under 254 characters
      const localPart = 'a'.repeat(230);
      const email = `${localPart}@example.com`; // 230 + 1 + 11 = 242 chars
      
      const result = validateEmail(email);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(email);
    });

    it('should handle emails with special characters', () => {
      const specialCharEmails = [
        'user.name@example.com',
        'user+tag@example.com',
        'user-name@example.com',
        'user_name@example.com',
        'user123@example.com',
        'test!#$%&@example.com'
      ];

      specialCharEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedValue).toBe(email.toLowerCase());
      });
    });

    it('should validate domain requirements', () => {
      const validDomainEmails = [
        'user@example.co',          // 2-char TLD
        'user@example.info',        // longer TLD
        'user@sub.domain.com',      // subdomain
        'user@test-domain.com'      // hyphen in domain
      ];

      validDomainEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject invalid domain formats', () => {
      const invalidDomainEmails = [
        'user@domain',              // no TLD
        'user@domain.a'             // TLD too short
      ];

      invalidDomainEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('generateDummyEmail', () => {
    it('should generate dummy email for user with username', () => {
      const userId = 12345;
      const username = 'johndoe';
      
      const email = generateDummyEmail(userId, username);
      
      expect(email).toMatch(/^johndoe_12345@telegram\.user$/);
    });

    it('should generate dummy email for user without username', () => {
      const userId = 67890;
      
      const email = generateDummyEmail(userId);
      
      expect(email).toMatch(/^user67890_67890@telegram\.user$/);
    });

    it('should clean usernames to be email-safe', () => {
      const testCases = [
        { username: 'John-Doe_123', userId: 111, expected: /^johndoe123_111@telegram\.user$/ },
        { username: 'user@domain', userId: 222, expected: /^userdomain_222@telegram\.user$/ },
        { username: 'test.user!', userId: 333, expected: /^testuser_333@telegram\.user$/ },
        { username: 'User With Spaces', userId: 444, expected: /^userwithspaces_444@telegram\.user$/ }
      ];

      testCases.forEach(({ username, userId, expected }) => {
        const email = generateDummyEmail(userId, username);
        expect(email).toMatch(expected);
      });
    });

    it('should handle very long usernames by truncating', () => {
      const longUsername = 'a'.repeat(50); // Very long username
      const userId = 555;
      
      const email = generateDummyEmail(userId, longUsername);
      
      // Should be truncated to 20 characters plus _555@domain
      expect(email).toMatch(/^a{20}_555@telegram\.user$/);
    });

    it('should handle empty username gracefully', () => {
      const userId = 666;
      
      const email = generateDummyEmail(userId, '');
      
      // Empty username should fallback to user{id} pattern
      expect(email).toMatch(/^user666_666@telegram\.user$/);
    });

    it('should handle username with only special characters', () => {
      const specialUsername = '!@#$%^&*()';
      const userId = 777;
      
      const email = generateDummyEmail(userId, specialUsername);
      
      // All special chars should be removed, resulting in empty identifier + userId
      expect(email).toMatch(/^_777@telegram\.user$/);
    });

    it('should generate unique emails for different users', () => {
      const users = [
        { userId: 1001, username: 'user1' },
        { userId: 1002, username: 'user2' },
        { userId: 1003, username: 'user3' }
      ];

      const emails = users.map(({ userId, username }) => 
        generateDummyEmail(userId, username)
      );

      // All emails should be unique
      const uniqueEmails = new Set(emails);
      expect(uniqueEmails.size).toBe(emails.length);
    });

    it('should handle numeric usernames', () => {
      const userId = 1234;
      const username = '12345';
      
      const email = generateDummyEmail(userId, username);
      
      expect(email).toMatch(/^12345_1234@telegram\.user$/);
    });

    it('should handle mixed case usernames', () => {
      const userId = 5678;
      const username = 'JohnDoe123';
      
      const email = generateDummyEmail(userId, username);
      
      expect(email).toMatch(/^johndoe123_5678@telegram\.user$/);
    });

    it('should always include user ID for uniqueness', () => {
      const sameUsername = 'testuser';
      const userId1 = 1111;
      const userId2 = 2222;
      
      const email1 = generateDummyEmail(userId1, sameUsername);
      const email2 = generateDummyEmail(userId2, sameUsername);
      
      expect(email1).toMatch(/^testuser_1111@telegram\.user$/);
      expect(email2).toMatch(/^testuser_2222@telegram\.user$/);
      expect(email1).not.toBe(email2);
    });
  });

  describe('EmailValidationResult interface', () => {
    it('should have correct structure for valid results', () => {
      const result = validateEmail('test@example.com');
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('sanitizedValue');
      expect(result.isValid).toBe(true);
      expect(typeof result.sanitizedValue).toBe('string');
      expect(result.error).toBeUndefined();
    });

    it('should have correct structure for invalid results', () => {
      const result = validateEmail('invalid-email');
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('error');
      expect(result.isValid).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(result.sanitizedValue).toBeUndefined();
    });
  });
});