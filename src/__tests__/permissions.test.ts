/**
 * Permissions Module Test Suite
 * 
 * Comprehensive tests for permission management functionality including
 * admin validation, bot permissions, and access control.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { clearAllMocks, createMock, restoreAllMocks } from './_helpers/mockLifecycle';
import { validateAdminAccess } from '../utils/permissions.js';
import type { BotContext } from '../types/index.js';

// Mock dependencies
mock.module('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    info: createMock(),
    error: createMock(),
    warn: createMock(),
    debug: createMock()
  }
}));

mock.module('../config/env.js', () => ({
  isAdminUser: createMock()
}));

mock.module('../bot.js', () => ({
  safeReply: createMock()
}));

describe('Permissions Module', () => {
  let mockContext: Partial<BotContext>;

  beforeEach(() => {
    clearAllMocks();
    
    mockContext = {
      from: {
        id: 12345,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser'
      },
      chat: {
        id: -67890,
        type: 'group'
      },
      reply: mock(),
      replyWithMarkdown: mock(),
      replyWithHTML: mock()
    };
  });

  afterEach(() => {
    restoreAllMocks();
  });

  describe('validateAdminAccess', () => {
    it('should return true for authorized admin users', async () => {
      const { isAdminUser } = await import('../config/env.js');
      (isAdminUser as any).mockReturnValue(true);

      const result = await validateAdminAccess(mockContext as BotContext);
      
      expect(result).toBe(true);
      expect(isAdminUser).toHaveBeenCalledWith(12345);
    });

    it('should return false for non-admin users', async () => {
      const { isAdminUser } = await import('../config/env.js');
      const { safeReply } = await import('../bot.js');
      
      (isAdminUser as any).mockReturnValue(false);

      const result = await validateAdminAccess(mockContext as BotContext);
      
      expect(result).toBe(false);
      expect(isAdminUser).toHaveBeenCalledWith(12345);
      expect(safeReply).toHaveBeenCalled();
    });

    it('should return false when user context is missing', async () => {
      const { safeReply } = await import('../bot.js');
      
      const contextWithoutUser = {
        ...mockContext,
        from: undefined
      };

      const result = await validateAdminAccess(contextWithoutUser as BotContext);
      
      expect(result).toBe(false);
      expect(safeReply).toHaveBeenCalled();
    });

    it('should return false when user ID is missing', async () => {
      const { safeReply } = await import('../bot.js');
      
      const contextWithoutUserId = {
        ...mockContext,
        from: {
          ...mockContext.from!,
          id: undefined as any
        }
      };

      const result = await validateAdminAccess(contextWithoutUserId as BotContext);
      
      expect(result).toBe(false);
      expect(safeReply).toHaveBeenCalled();
    });

    it('should handle bot users', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const botContext = {
        ...mockContext,
        from: {
          ...mockContext.from!,
          is_bot: true
        }
      };

      (isAdminUser as any).mockReturnValue(true);

      const result = await validateAdminAccess(botContext as BotContext);
      
      expect(result).toBe(true);
      expect(isAdminUser).toHaveBeenCalledWith(12345);
    });

    it('should handle private chat context', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const privateChatContext = {
        ...mockContext,
        chat: {
          id: 12345,
          type: 'private'
        }
      };

      (isAdminUser as any).mockReturnValue(true);

      const result = await validateAdminAccess(privateChatContext as BotContext);
      
      expect(result).toBe(true);
      expect(isAdminUser).toHaveBeenCalledWith(12345);
    });

    it('should handle supergroup context', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const supergroupContext = {
        ...mockContext,
        chat: {
          id: -100123456789,
          type: 'supergroup'
        }
      };

      (isAdminUser as any).mockReturnValue(true);

      const result = await validateAdminAccess(supergroupContext as BotContext);
      
      expect(result).toBe(true);
      expect(isAdminUser).toHaveBeenCalledWith(12345);
    });

    it('should handle channel context', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const channelContext = {
        ...mockContext,
        chat: {
          id: -100987654321,
          type: 'channel'
        }
      };

      (isAdminUser as any).mockReturnValue(false);

      const result = await validateAdminAccess(channelContext as BotContext);
      
      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle isAdminUser throwing an error', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      (isAdminUser as any).mockImplementation(() => {
        throw new Error('Configuration error');
      });

      await expect(validateAdminAccess(mockContext as BotContext)).rejects.toThrow('Configuration error');
    });

    it('should handle safeReply throwing an error', async () => {
      const { isAdminUser } = await import('../config/env.js');
      const { safeReply } = await import('../bot.js');
      
      (isAdminUser as any).mockReturnValue(false);
      (safeReply as any).mockImplementation(async () => {
        throw new Error('Reply failed');
      });

      // Since safeReply throws, validateAdminAccess should also throw
      await expect(validateAdminAccess(mockContext as BotContext)).rejects.toThrow('Reply failed');
    });
  });

  describe('Context Variations', () => {
    it('should handle context with extra properties', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const extendedContext = {
        ...mockContext,
        message: {
          message_id: 123,
          date: Date.now(),
          text: '/admin'
        },
        callbackQuery: {
          id: 'callback_123',
          data: 'admin_action'
        }
      };

      (isAdminUser as any).mockReturnValue(true);

      const result = await validateAdminAccess(extendedContext as BotContext);
      
      expect(result).toBe(true);
    });

    it('should handle numeric user IDs as strings', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const contextWithStringId = {
        ...mockContext,
        from: {
          ...mockContext.from!,
          id: '12345' as any
        }
      };

      (isAdminUser as any).mockImplementation((id) => {
        return id === '12345' || id === 12345;
      });

      const result = await validateAdminAccess(contextWithStringId as BotContext);
      
      expect(result).toBe(true);
    });

    it('should handle user with no username', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const noUsernameContext = {
        ...mockContext,
        from: {
          ...mockContext.from!,
          username: undefined
        }
      };

      (isAdminUser as any).mockReturnValue(true);

      const result = await validateAdminAccess(noUsernameContext as BotContext);
      
      expect(result).toBe(true);
    });

    it('should handle user with no first name', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const noFirstNameContext = {
        ...mockContext,
        from: {
          ...mockContext.from!,
          first_name: undefined as any
        }
      };

      (isAdminUser as any).mockReturnValue(true);

      const result = await validateAdminAccess(noFirstNameContext as BotContext);
      
      expect(result).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero user ID', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const zeroIdContext = {
        ...mockContext,
        from: {
          ...mockContext.from!,
          id: 0
        }
      };

      (isAdminUser as any).mockReturnValue(false);

      const result = await validateAdminAccess(zeroIdContext as BotContext);
      
      expect(result).toBe(false);
    });

    it('should handle negative user ID', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const negativeIdContext = {
        ...mockContext,
        from: {
          ...mockContext.from!,
          id: -123
        }
      };

      (isAdminUser as any).mockReturnValue(false);

      const result = await validateAdminAccess(negativeIdContext as BotContext);
      
      expect(result).toBe(false);
    });

    it('should handle very large user ID', async () => {
      const { isAdminUser } = await import('../config/env.js');
      
      const largeIdContext = {
        ...mockContext,
        from: {
          ...mockContext.from!,
          id: 9999999999999
        }
      };

      (isAdminUser as any).mockReturnValue(true);

      const result = await validateAdminAccess(largeIdContext as BotContext);
      
      expect(result).toBe(true);
      expect(isAdminUser).toHaveBeenCalledWith(9999999999999);
    });
  });
});
