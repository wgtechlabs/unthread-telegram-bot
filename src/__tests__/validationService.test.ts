/**
 * Unit tests for services/validationService.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../types/index.js';
import { 
  type ValidationCheck,
  type ValidationResult,
  ValidationService
} from '../services/validationService.js';

describe('ValidationService', () => {
  let mockCtx: BotContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCtx = {
      from: { id: 123, first_name: 'Test', is_bot: false },
      chat: { id: 456, type: 'private' },
      message: { text: '/test', message_id: 789 },
      reply: vi.fn(),
      telegram: {
        getMe: vi.fn(),
        getChatMember: vi.fn(),
        sendChatAction: vi.fn()
      }
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('performSetupValidation', () => {
    const groupChatId = -1001234567890;
    const groupTitle = 'Test Support Group';

    it('should return successful validation when all checks pass', async () => {
      // Mock successful bot admin check
      vi.mocked(mockCtx.telegram.getMe).mockResolvedValue({ id: 999, is_bot: true, first_name: 'TestBot' } as any);
      vi.mocked(mockCtx.telegram.getChatMember).mockResolvedValue({ status: 'administrator' } as any);
      vi.mocked(mockCtx.telegram.sendChatAction).mockResolvedValue(true as any);

      const result = await ValidationService.performSetupValidation(mockCtx, groupChatId, groupTitle);

      expect(result.allPassed).toBe(true);
      expect(result.checks).toHaveLength(2);
      
      // Check bot admin status
      expect(result.checks[0].name).toBe('Bot Admin Status');
      expect(result.checks[0].passed).toBe(true);
      expect(result.checks[0].details).toBe('Bot has admin privileges');
      
      // Check message sending capability
      expect(result.checks[1].name).toBe('Message Sending');
      expect(result.checks[1].passed).toBe(true);
      expect(result.checks[1].details).toBe('Bot can send messages to group');

      // Check message content
      expect(result.message).toContain('🔍 **Setup Validation Results**');
      expect(result.message).toContain(groupTitle);
      expect(result.message).toContain(`${groupChatId}`);
      expect(result.message).toContain('🎉 **All Checks Passed!**');
      expect(result.message).toContain('Ready to proceed with customer configuration');
    });

    it('should handle bot admin check failure', async () => {
      // Mock failed bot admin check
      vi.mocked(mockCtx.telegram.getMe).mockResolvedValue({ id: 999, is_bot: true, first_name: 'TestBot' } as any);
      vi.mocked(mockCtx.telegram.getChatMember).mockResolvedValue({ status: 'member' } as any);
      vi.mocked(mockCtx.telegram.sendChatAction).mockResolvedValue(true as any);

      const result = await ValidationService.performSetupValidation(mockCtx, groupChatId, groupTitle);

      expect(result.allPassed).toBe(false);
      expect(result.checks[0].passed).toBe(false);
      expect(result.checks[0].details).toBe('Bot needs admin privileges');
      expect(result.message).toContain('❌ **Setup Requirements Not Met**');
      expect(result.message).toContain('Make the bot an administrator in the group');
    });

    it('should handle bot admin check error', async () => {
      // Mock error in bot admin check
      vi.mocked(mockCtx.telegram.getMe).mockRejectedValue(new Error('API Error'));
      vi.mocked(mockCtx.telegram.sendChatAction).mockResolvedValue(true as any);

      const result = await ValidationService.performSetupValidation(mockCtx, groupChatId, groupTitle);

      expect(result.allPassed).toBe(false);
      expect(result.checks[0].passed).toBe(false);
      expect(result.checks[0].details).toBe('Unable to check bot permissions');
    });

    it('should handle message sending failure', async () => {
      // Mock successful admin check but failed message sending
      vi.mocked(mockCtx.telegram.getMe).mockResolvedValue({ id: 999, is_bot: true, first_name: 'TestBot' } as any);
      vi.mocked(mockCtx.telegram.getChatMember).mockResolvedValue({ status: 'administrator' } as any);
      vi.mocked(mockCtx.telegram.sendChatAction).mockRejectedValue(new Error('Cannot send message'));

      const result = await ValidationService.performSetupValidation(mockCtx, groupChatId, groupTitle);

      expect(result.allPassed).toBe(false);
      expect(result.checks[1].passed).toBe(false);
      expect(result.checks[1].details).toBe('Bot cannot send messages to group');
    });

    it('should handle bot creator status as admin', async () => {
      // Mock bot as creator (should pass admin check)
      vi.mocked(mockCtx.telegram.getMe).mockResolvedValue({ id: 999, is_bot: true, first_name: 'TestBot' } as any);
      vi.mocked(mockCtx.telegram.getChatMember).mockResolvedValue({ status: 'creator' } as any);
      vi.mocked(mockCtx.telegram.sendChatAction).mockResolvedValue(true as any);

      const result = await ValidationService.performSetupValidation(mockCtx, groupChatId, groupTitle);

      expect(result.checks[0].passed).toBe(true);
      expect(result.checks[0].details).toBe('Bot has admin privileges');
    });

    it('should handle multiple failures', async () => {
      // Mock both checks failing
      vi.mocked(mockCtx.telegram.getMe).mockRejectedValue(new Error('Bot check failed'));
      vi.mocked(mockCtx.telegram.sendChatAction).mockRejectedValue(new Error('Cannot send'));

      const result = await ValidationService.performSetupValidation(mockCtx, groupChatId, groupTitle);

      expect(result.allPassed).toBe(false);
      expect(result.checks).toHaveLength(2);
      expect(result.checks[0].passed).toBe(false);
      expect(result.checks[1].passed).toBe(false);
      expect(result.message).toContain('❌ **Setup Requirements Not Met**');
    });
  });

  describe('buildValidationMessage', () => {
    it('should build message for successful validation', () => {
      const checks: ValidationCheck[] = [
        { name: 'Check 1', passed: true, details: 'Success detail 1' },
        { name: 'Check 2', passed: true, details: 'Success detail 2' }
      ];

      // Access private method through the class
      const result = (ValidationService as any).buildValidationMessage(
        'Test Group',
        -123456,
        checks,
        true
      );

      expect(result).toContain('🔍 **Setup Validation Results**');
      expect(result).toContain('**Group:** Test Group');
      expect(result).toContain('**Chat ID:** `-123456`');
      expect(result).toContain('✅ **Check 1**');
      expect(result).toContain('Success detail 1');
      expect(result).toContain('✅ **Check 2**');
      expect(result).toContain('Success detail 2');
      expect(result).toContain('🎉 **All Checks Passed!**');
      expect(result).toContain('Ready to proceed with customer configuration');
    });

    it('should build message for failed validation', () => {
      const checks: ValidationCheck[] = [
        { name: 'Check 1', passed: false, details: 'Failure detail 1' },
        { name: 'Check 2', passed: true, details: 'Success detail 2' }
      ];

      const result = (ValidationService as any).buildValidationMessage(
        'Test Group',
        -123456,
        checks,
        false
      );

      expect(result).toContain('❌ **Check 1**');
      expect(result).toContain('Failure detail 1');
      expect(result).toContain('✅ **Check 2**');
      expect(result).toContain('❌ **Setup Requirements Not Met**');
      expect(result).toContain('Make the bot an administrator in the group');
      expect(result).toContain('🔄 **Retry Validation**');
    });

    it('should build message for warnings only', () => {
      const checks: ValidationCheck[] = [
        { name: 'Check 1', passed: true, details: 'Success detail 1' },
        { name: 'Check 2', passed: false, details: 'Warning detail 2', warning: true }
      ];

      const result = (ValidationService as any).buildValidationMessage(
        'Test Group',
        -123456,
        checks,
        false
      );

      expect(result).toContain('⚠️ **Minor Issues Detected**');
      expect(result).toContain('Setup can proceed, but some optimizations are recommended');
      expect(result).toContain("won't prevent functionality but may affect performance");
    });

    it('should handle empty checks array', () => {
      const checks: ValidationCheck[] = [];

      const result = (ValidationService as any).buildValidationMessage(
        'Empty Group',
        -999999,
        checks,
        true
      );

      expect(result).toContain('🔍 **Setup Validation Results**');
      expect(result).toContain('**Group:** Empty Group');
      expect(result).toContain('🎉 **All Checks Passed!**');
    });

    it('should format check details correctly', () => {
      const checks: ValidationCheck[] = [
        { name: 'Special Check', passed: true, details: 'Very detailed success message' },
        { name: 'Another Check', passed: false, details: 'Very detailed failure message' }
      ];

      const result = (ValidationService as any).buildValidationMessage(
        'Test Group',
        -123456,
        checks,
        false
      );

      expect(result).toContain('✅ **Special Check**');
      expect(result).toContain('   Very detailed success message');
      expect(result).toContain('❌ **Another Check**');
      expect(result).toContain('   Very detailed failure message');
    });
  });

  describe('ValidationCheck interface', () => {
    it('should support all required properties', () => {
      const check: ValidationCheck = {
        name: 'Test Check',
        passed: true,
        details: 'Test details'
      };

      expect(check.name).toBe('Test Check');
      expect(check.passed).toBe(true);
      expect(check.details).toBe('Test details');
      expect(check.warning).toBeUndefined();
    });

    it('should support optional warning property', () => {
      const check: ValidationCheck = {
        name: 'Warning Check',
        passed: false,
        details: 'Warning details',
        warning: true
      };

      expect(check.warning).toBe(true);
    });
  });

  describe('ValidationResult interface', () => {
    it('should support all required properties', () => {
      const result: ValidationResult = {
        checks: [],
        allPassed: true,
        message: 'Test message'
      };

      expect(result.checks).toEqual([]);
      expect(result.allPassed).toBe(true);
      expect(result.message).toBe('Test message');
    });
  });
});