/**
 * Unit tests for markdownEscape utilities
 */
import { describe, expect, it } from 'vitest';
import {
  escapeMarkdown,
  escapeMarkdownCode,
  truncateText,
  createSafeMarkdownMessage,
  formatEmailForDisplay,
  lightEscapeMarkdown
} from '../utils/markdownEscape';

describe('markdownEscape utilities', () => {
  describe('escapeMarkdown', () => {
    it('should return empty string for null/undefined input', () => {
      expect(escapeMarkdown('')).toBe('');
      expect(escapeMarkdown(null as any)).toBe('');
      expect(escapeMarkdown(undefined as any)).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(escapeMarkdown(123 as any)).toBe('');
      expect(escapeMarkdown({} as any)).toBe('');
      expect(escapeMarkdown([] as any)).toBe('');
    });

    it('should escape all special markdown characters', () => {
      const specialChars = '*_`[]()~>#+=|{}.!-\\';
      const escaped = escapeMarkdown(specialChars);
      
      expect(escaped).toBe('\\*\\_\\`\\[\\]\\(\\)\\~\\>\\#\\+\\=\\|\\{\\}\\.\\!\\-\\\\');
    });

    it('should not modify text without special characters', () => {
      const plainText = 'Hello world 123 ABC xyz';
      expect(escapeMarkdown(plainText)).toBe(plainText);
    });

    it('should handle mixed content with special characters', () => {
      const text = 'User has *bold* text and [links]';
      const escaped = escapeMarkdown(text);
      
      expect(escaped).toBe('User has \\*bold\\* text and \\[links\\]');
    });

    it('should handle text with multiple instances of same character', () => {
      const text = '***Important*** message!!!';
      const escaped = escapeMarkdown(text);
      
      expect(escaped).toBe('\\*\\*\\*Important\\*\\*\\* message\\!\\!\\!');
    });
  });

  describe('escapeMarkdownCode', () => {
    it('should return empty string for null/undefined input', () => {
      expect(escapeMarkdownCode('')).toBe('');
      expect(escapeMarkdownCode(null as any)).toBe('');
      expect(escapeMarkdownCode(undefined as any)).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(escapeMarkdownCode(123 as any)).toBe('');
      expect(escapeMarkdownCode({} as any)).toBe('');
    });

    it('should escape backticks only', () => {
      const text = 'const code = `value`;';
      expect(escapeMarkdownCode(text)).toBe('const code = \\`value\\`;');
    });

    it('should not escape other markdown characters', () => {
      const text = '*bold* and [link] but `code`';
      expect(escapeMarkdownCode(text)).toBe('*bold* and [link] but \\`code\\`');
    });

    it('should handle multiple backticks', () => {
      const text = '```javascript\nconst x = `template`;\n```';
      expect(escapeMarkdownCode(text)).toBe('\\`\\`\\`javascript\nconst x = \\`template\\`;\n\\`\\`\\`');
    });

    it('should handle text without backticks', () => {
      const text = 'No backticks here';
      expect(escapeMarkdownCode(text)).toBe(text);
    });
  });

  describe('truncateText', () => {
    it('should return empty string for null/undefined input', () => {
      expect(truncateText('')).toBe('');
      expect(truncateText(null as any)).toBe('');
      expect(truncateText(undefined as any)).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(truncateText(123 as any)).toBe('');
      expect(truncateText({} as any)).toBe('');
    });

    it('should return original text if within length limit', () => {
      const text = 'Short text';
      expect(truncateText(text, 100)).toBe(text);
      expect(truncateText(text, 10)).toBe(text);
    });

    it('should truncate text longer than default limit (100)', () => {
      const longText = 'A'.repeat(150);
      const truncated = truncateText(longText);
      
      expect(truncated).toBe('A'.repeat(97) + '...');
      expect(truncated.length).toBe(100);
    });

    it('should truncate text longer than custom limit', () => {
      const text = 'This is a longer text that needs truncation';
      const truncated = truncateText(text, 20);
      
      expect(truncated).toBe('This is a longer ...'); // 17 chars + "..." = 20
      expect(truncated.length).toBe(20);
    });

    it('should handle edge case of very short maxLength', () => {
      const text = 'Hello world';
      const truncated = truncateText(text, 5);
      
      expect(truncated).toBe('He...'); // 2 chars + "..." = 5
      expect(truncated.length).toBe(5);
    });

    it('should handle maxLength of 3 or less', () => {
      const text = 'Hello';
      expect(truncateText(text, 3)).toBe('...');
      expect(truncateText(text, 2)).toBe('...');
      expect(truncateText(text, 1)).toBe('...');
    });
  });

  describe('createSafeMarkdownMessage', () => {
    it('should replace placeholders with escaped values', () => {
      const template = '**Name:** {name}\n**Email:** {email}';
      const replacements = {
        name: 'John *Bold* Doe',
        email: 'john@example.com'
      };

      const result = createSafeMarkdownMessage(template, replacements);
      expect(result).toBe('**Name:** John \\*Bold\\* Doe\n**Email:** john@example\\.com');
    });

    it('should handle missing values by using empty string', () => {
      const template = '**Name:** {name}\n**Status:** {status}';
      const replacements = {
        name: 'John Doe'
        // status is missing
      };

      const result = createSafeMarkdownMessage(template, replacements);
      expect(result).toBe('**Name:** John Doe\n**Status:** {status}');
    });

    it('should handle null/undefined values safely', () => {
      const template = '**Info:** {info}';
      const replacements = {
        info: null as any
      };

      const result = createSafeMarkdownMessage(template, replacements);
      expect(result).toBe('**Info:** ');
    });

    it('should handle multiple instances of same placeholder', () => {
      const template = '{greeting} {name}! Welcome {name} to our service.';
      const replacements = {
        greeting: 'Hello',
        name: 'John [User]'
      };

      const result = createSafeMarkdownMessage(template, replacements);
      expect(result).toBe('Hello John \\[User\\]! Welcome John \\[User\\] to our service.');
    });

    it('should handle special regex characters in placeholder keys', () => {
      const template = 'Value: {user.name} and {user-email}';
      const replacements = {
        'user.name': 'John*Doe',
        'user-email': 'john@test.com'
      };

      const result = createSafeMarkdownMessage(template, replacements);
      expect(result).toBe('Value: John\\*Doe and john@test\\.com');
    });

    it('should handle empty template', () => {
      const result = createSafeMarkdownMessage('', { name: 'John' });
      expect(result).toBe('');
    });

    it('should handle template with no placeholders', () => {
      const template = 'Static message with no placeholders';
      const result = createSafeMarkdownMessage(template, { name: 'John' });
      expect(result).toBe(template);
    });
  });

  describe('formatEmailForDisplay', () => {
    it('should return "Not provided" for empty/null input', () => {
      expect(formatEmailForDisplay('')).toBe('`Not provided`');
      expect(formatEmailForDisplay(null as any)).toBe('`Not provided`');
      expect(formatEmailForDisplay(undefined as any)).toBe('`Not provided`');
    });

    it('should return "Not provided" for non-string input', () => {
      expect(formatEmailForDisplay(123 as any)).toBe('`Not provided`');
      expect(formatEmailForDisplay({} as any)).toBe('`Not provided`');
    });

    it('should format valid email with backticks', () => {
      const email = 'user@example.com';
      expect(formatEmailForDisplay(email)).toBe('`user@example.com`');
    });

    it('should format email with special characters', () => {
      const email = 'user+test@sub.domain.com';
      expect(formatEmailForDisplay(email)).toBe('`user+test@sub.domain.com`');
    });

    it('should handle email with spaces (invalid but defensive)', () => {
      const email = 'user @example.com';
      expect(formatEmailForDisplay(email)).toBe('`user @example.com`');
    });
  });

  describe('lightEscapeMarkdown', () => {
    it('should return empty string for null/undefined input', () => {
      expect(lightEscapeMarkdown('')).toBe('');
      expect(lightEscapeMarkdown(null as any)).toBe('');
      expect(lightEscapeMarkdown(undefined as any)).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(lightEscapeMarkdown(123 as any)).toBe('');
      expect(lightEscapeMarkdown({} as any)).toBe('');
    });

    it('should only escape critical characters (brackets and backticks)', () => {
      const text = 'Check [link] and `code` but *bold* is fine';
      const escaped = lightEscapeMarkdown(text);
      
      expect(escaped).toBe('Check \\[link\\] and \\`code\\` but *bold* is fine');
    });

    it('should not escape other markdown characters', () => {
      const text = '*bold* _italic_ ~strike~ >quote #header +list -list =underline |table {braces} .dot !exclaim';
      const escaped = lightEscapeMarkdown(text);
      
      expect(escaped).toBe('*bold* _italic_ ~strike~ >quote #header +list -list =underline |table {braces} .dot !exclaim');
    });

    it('should handle multiple instances of critical characters', () => {
      const text = '[link1] and [link2] with `code1` and `code2`';
      const escaped = lightEscapeMarkdown(text);
      
      expect(escaped).toBe('\\[link1\\] and \\[link2\\] with \\`code1\\` and \\`code2\\`');
    });

    it('should handle text without critical characters', () => {
      const text = 'Plain text with no special formatting';
      expect(lightEscapeMarkdown(text)).toBe(text);
    });
  });
});