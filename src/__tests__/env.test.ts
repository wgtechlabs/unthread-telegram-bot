/**
 * Unit tests for env utilities
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCompanyName,
  getConfiguredBotUsername,
  getDefaultTicketPriority,
  getEnvVar,
  isDevelopment,
  isProduction
} from '../config/env';

describe('env utilities', () => {
  // Store original env vars to restore after tests
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a fresh copy of environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getEnvVar', () => {
    it('should return environment variable value when set', () => {
      process.env.TEST_VAR = 'test_value';
      
      expect(getEnvVar('TEST_VAR')).toBe('test_value');
    });

    it('should return default value when env var not set', () => {
      delete process.env.TEST_VAR;
      
      expect(getEnvVar('TEST_VAR', 'default')).toBe('default');
    });

    it('should return empty string as default when not provided', () => {
      delete process.env.TEST_VAR;
      
      expect(getEnvVar('TEST_VAR')).toBe('');
    });

    it('should handle empty string env var', () => {
      process.env.TEST_VAR = '';
      
      expect(getEnvVar('TEST_VAR', 'default')).toBe('default');
    });
  });

  describe('isProduction', () => {
    it('should return true when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      
      expect(isProduction()).toBe(true);
    });

    it('should return false when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      
      expect(isProduction()).toBe(false);
    });

    it('should return false when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      
      expect(isProduction()).toBe(false);
    });

    it('should return false for other NODE_ENV values', () => {
      process.env.NODE_ENV = 'test';
      
      expect(isProduction()).toBe(false);
    });
  });

  describe('isDevelopment', () => {
    it('should return true when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      
      expect(isDevelopment()).toBe(true);
    });

    it('should return true when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      
      expect(isDevelopment()).toBe(true);
    });

    it('should return true when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      
      expect(isDevelopment()).toBe(true);
    });

    it('should return false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      
      expect(isDevelopment()).toBe(false);
    });

    it('should return false for staging environment', () => {
      process.env.NODE_ENV = 'staging';
      
      expect(isDevelopment()).toBe(false);
    });
  });

  describe('getDefaultTicketPriority', () => {
    it('should return valid priority numbers', () => {
      const validPriorities = [3, 5, 7, 9];
      
      for (const priority of validPriorities) {
        process.env.UNTHREAD_DEFAULT_PRIORITY = priority.toString();
        expect(getDefaultTicketPriority()).toBe(priority);
      }
    });

    it('should return undefined when not set', () => {
      delete process.env.UNTHREAD_DEFAULT_PRIORITY;
      
      expect(getDefaultTicketPriority()).toBeUndefined();
    });

    it('should return undefined for invalid priority values', () => {
      const invalidPriorities = ['1', '2', '4', '6', '8', '10', 'invalid', ''];
      
      for (const priority of invalidPriorities) {
        process.env.UNTHREAD_DEFAULT_PRIORITY = priority;
        expect(getDefaultTicketPriority()).toBeUndefined();
      }
    });

    it('should handle string numbers correctly', () => {
      process.env.UNTHREAD_DEFAULT_PRIORITY = '5';
      
      expect(getDefaultTicketPriority()).toBe(5);
    });
  });

  describe('getCompanyName', () => {
    it('should return company name when properly set', () => {
      process.env.MY_COMPANY_NAME = 'Acme Corp';
      
      expect(getCompanyName()).toBe('Acme Corp');
    });

    it('should return null when not set', () => {
      delete process.env.MY_COMPANY_NAME;
      
      expect(getCompanyName()).toBeNull();
    });

    it('should return null for placeholder values', () => {
      const placeholders = [
        'your_company_name_here',
        'your_company_name',
        'company_name_here',
        'placeholder',
        'change_me',
        'replace_me'
      ];
      
      for (const placeholder of placeholders) {
        process.env.MY_COMPANY_NAME = placeholder;
        expect(getCompanyName()).toBeNull();
      }
    });

    it('should handle case insensitive placeholder detection', () => {
      process.env.MY_COMPANY_NAME = 'YOUR_COMPANY_NAME_HERE';
      
      expect(getCompanyName()).toBeNull();
    });

    it('should trim whitespace', () => {
      process.env.MY_COMPANY_NAME = '  Acme Corp  ';
      
      expect(getCompanyName()).toBe('Acme Corp');
    });

    it('should return null for empty string after trim', () => {
      process.env.MY_COMPANY_NAME = '   ';
      
      expect(getCompanyName()).toBeNull();
    });
  });

  describe('getConfiguredBotUsername', () => {
    it('should return valid bot username', () => {
      process.env.BOT_USERNAME = 'my_support_bot';
      
      expect(getConfiguredBotUsername()).toBe('my_support_bot');
    });

    it('should return null when not set', () => {
      delete process.env.BOT_USERNAME;
      
      expect(getConfiguredBotUsername()).toBeNull();
    });

    it('should return null for placeholder values', () => {
      const placeholders = [
        'your_bot_username_here',
        'your_bot_username',
        'bot_username_here',
        'placeholder',
        'change_me',
        'replace_me'
      ];
      
      for (const placeholder of placeholders) {
        process.env.BOT_USERNAME = placeholder;
        expect(getConfiguredBotUsername()).toBeNull();
      }
    });

    it('should validate username format and return null for invalid', () => {
      const invalidUsernames = [
        'ab', // too short
        'a'.repeat(40), // too long
        'invalid-bot!', // invalid characters
        'invalid@bot', // invalid characters
        'invalid bot', // spaces not allowed
      ];
      
      for (const invalid of invalidUsernames) {
        process.env.BOT_USERNAME = invalid;
        expect(getConfiguredBotUsername()).toBeNull();
      }
    });

    it('should accept valid usernames', () => {
      const validUsernames = [
        'bot_1',
        'my_support_bot',
        'Bot123',
        'a'.repeat(32), // max length
        'a'.repeat(5) // min length
      ];
      
      for (const valid of validUsernames) {
        process.env.BOT_USERNAME = valid;
        expect(getConfiguredBotUsername()).toBe(valid);
      }
    });

    it('should trim whitespace', () => {
      process.env.BOT_USERNAME = '  my_bot  ';
      
      expect(getConfiguredBotUsername()).toBe('my_bot');
    });
  });
});