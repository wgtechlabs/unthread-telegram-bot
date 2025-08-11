/**
 * Unit tests for uuidValidator utilities
 */
import { describe, expect, it } from 'vitest';
import {
  isValidUUID,
  validateAndSanitizeUUID,
  isUUID
} from '../commands/utils/uuidValidator';

describe('uuidValidator utilities', () => {
  describe('isValidUUID', () => {
    it('should return false for null/undefined/empty input', () => {
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID(null as any)).toBe(false);
      expect(isValidUUID(undefined as any)).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(isValidUUID(123 as any)).toBe(false);
      expect(isValidUUID({} as any)).toBe(false);
      expect(isValidUUID([] as any)).toBe(false);
      expect(isValidUUID(true as any)).toBe(false);
    });

    it('should return true for valid UUID v4 format', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '123e4567-e89b-42d3-a456-426614174000',
        '00000000-0000-4000-8000-000000000000', // edge case
        'FFFFFFFF-FFFF-4FFF-AFFF-FFFFFFFFFFFF'  // uppercase
      ];

      validUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it('should return true for valid UUID v4 format in lowercase', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        'aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa'
      ];

      validUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it('should return false for invalid UUID formats', () => {
      const invalidUUIDs = [
        '550e8400-e29b-41d4-a716',                    // too short
        '550e8400-e29b-41d4-a716-446655440000-extra', // too long
        '550e8400-e29b-41d4-a716-44665544000',        // wrong segment length
        '550e8400e29b41d4a716446655440000',            // no hyphens
        '550e8400-e29b-41d4-a716-44665544000g',       // invalid hex char
        'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',       // invalid chars
        '550e8400-e29b-31d4-a716-446655440000',       // wrong version (3 instead of 4)
        '550e8400-e29b-51d4-a716-446655440000',       // wrong version (5 instead of 4)
        '550e8400-e29b-41d4-c716-446655440000',       // wrong variant (c instead of 8/9/a/b)
        '550e8400-e29b-41d4-0716-446655440000',       // wrong variant (0 instead of 8/9/a/b)
        '123',                                         // too short
        '',                                            // empty
        '12345678-1234-1234-1234-123456789012',      // all numbers but wrong format
      ];

      invalidUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(false);
      });
    });

    it('should enforce UUID v4 specific format requirements', () => {
      // Test version digit (must be 4)
      expect(isValidUUID('550e8400-e29b-11d4-a716-446655440000')).toBe(false); // version 1
      expect(isValidUUID('550e8400-e29b-21d4-a716-446655440000')).toBe(false); // version 2
      expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(false); // version 3
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);  // version 4 ✓
      expect(isValidUUID('550e8400-e29b-51d4-a716-446655440000')).toBe(false); // version 5

      // Test variant bits (first char of 4th segment must be 8, 9, a, or b)
      expect(isValidUUID('550e8400-e29b-41d4-8716-446655440000')).toBe(true);  // variant 8 ✓
      expect(isValidUUID('550e8400-e29b-41d4-9716-446655440000')).toBe(true);  // variant 9 ✓
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);  // variant a ✓
      expect(isValidUUID('550e8400-e29b-41d4-b716-446655440000')).toBe(true);  // variant b ✓
      expect(isValidUUID('550e8400-e29b-41d4-c716-446655440000')).toBe(false); // variant c ✗
      expect(isValidUUID('550e8400-e29b-41d4-0716-446655440000')).toBe(false); // variant 0 ✗
      expect(isValidUUID('550e8400-e29b-41d4-f716-446655440000')).toBe(false); // variant f ✗
    });

    it('should be case insensitive', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const upperUuid = uuid.toUpperCase();
      const mixedUuid = '550E8400-e29b-41D4-A716-446655440000';

      expect(isValidUUID(uuid)).toBe(true);
      expect(isValidUUID(upperUuid)).toBe(true);
      expect(isValidUUID(mixedUuid)).toBe(true);
    });
  });

  describe('validateAndSanitizeUUID', () => {
    it('should return lowercase UUID for valid input', () => {
      const uuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = validateAndSanitizeUUID(uuid);
      
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return same string if already lowercase', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = validateAndSanitizeUUID(uuid);
      
      expect(result).toBe(uuid);
    });

    it('should throw error for invalid UUID with default context', () => {
      const invalidUuid = 'invalid-uuid';
      
      expect(() => validateAndSanitizeUUID(invalidUuid)).toThrow(
        'Invalid UUID format: Expected valid UUID v4 format'
      );
    });

    it('should throw error for invalid UUID with custom context', () => {
      const invalidUuid = 'invalid-uuid';
      const context = 'Conversation ID';
      
      expect(() => validateAndSanitizeUUID(invalidUuid, context)).toThrow(
        'Invalid Conversation ID format: Expected valid UUID v4 format'
      );
    });

    it('should throw error for null/undefined input', () => {
      expect(() => validateAndSanitizeUUID(null as any)).toThrow(
        'Invalid UUID format: Expected valid UUID v4 format'
      );
      
      expect(() => validateAndSanitizeUUID(undefined as any)).toThrow(
        'Invalid UUID format: Expected valid UUID v4 format'
      );
    });

    it('should throw error for empty string', () => {
      expect(() => validateAndSanitizeUUID('')).toThrow(
        'Invalid UUID format: Expected valid UUID v4 format'
      );
    });

    it('should throw error for non-string input', () => {
      expect(() => validateAndSanitizeUUID(123 as any)).toThrow(
        'Invalid UUID format: Expected valid UUID v4 format'
      );
      
      expect(() => validateAndSanitizeUUID({} as any)).toThrow(
        'Invalid UUID format: Expected valid UUID v4 format'
      );
    });

    it('should handle various valid UUID formats', () => {
      const testCases = [
        { input: 'AAAAAAAA-AAAA-4AAA-BAAA-AAAAAAAAAAAA', expected: 'aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa' },
        { input: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', expected: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' },
        { input: 'F47AC10B-58CC-4372-A567-0E02B2C3D479', expected: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(validateAndSanitizeUUID(input)).toBe(expected);
      });
    });
  });

  describe('isUUID (type guard)', () => {
    it('should return true for valid UUID strings', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'F47AC10B-58CC-4372-A567-0E02B2C3D479',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      ];

      validUUIDs.forEach(uuid => {
        expect(isUUID(uuid)).toBe(true);
      });
    });

    it('should return false for invalid strings', () => {
      const invalidValues = [
        'invalid-uuid',
        '550e8400-e29b-41d4-a716', // too short
        '550e8400-e29b-31d4-a716-446655440000', // wrong version
        ''
      ];

      invalidValues.forEach(value => {
        expect(isUUID(value)).toBe(false);
      });
    });

    it('should return false for non-string values', () => {
      const nonStringValues = [
        null,
        undefined,
        123,
        {},
        [],
        true,
        false,
        Symbol('test')
      ];

      nonStringValues.forEach(value => {
        expect(isUUID(value)).toBe(false);
      });
    });

    it('should act as proper type guard', () => {
      function testTypeGuard(value: unknown) {
        if (isUUID(value)) {
          // TypeScript should now know that 'value' is a string
          return value.toLowerCase(); // This should not cause TS error
        }
        return null;
      }

      const validUuid = '550E8400-E29B-41D4-A716-446655440000';
      const result = testTypeGuard(validUuid);
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');

      expect(testTypeGuard(null)).toBe(null);
      expect(testTypeGuard(123)).toBe(null);
      expect(testTypeGuard('invalid')).toBe(null);
    });
  });
});