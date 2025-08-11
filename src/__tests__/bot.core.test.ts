/**
 * Bot Core Utilities Test Suite
 * 
 * Comprehensive tests for bot lifecycle management, safe operations,
 * and error handling functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBot, startPolling, safeReply } from '../bot.js';
import type { BotContext, TelegramError } from '../types/index.js';

// Mock dependencies
vi.mock('telegraf', () => ({
  Telegraf: vi.fn().mockImplementation((token) => ({
    token,
    launch: vi.fn(),
    stop: vi.fn(),
    use: vi.fn(),
    command: vi.fn(),
    on: vi.fn()
  }))
}));

vi.mock('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('./sdk/bots-brain/index.js', () => ({
  BotsStore: {
    removeUser: vi.fn(),
    clearUserData: vi.fn(),
    getUserState: vi.fn()
  }
}));

describe('Bot Core Utilities', () => {
  let mockContext: Partial<BotContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    
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
      reply: vi.fn(),
      replyWithMarkdown: vi.fn(),
      replyWithHTML: vi.fn(),
      editMessageText: vi.fn(),
      deleteMessage: vi.fn()
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createBot', () => {
    it('should create bot instance with valid token', () => {
      const token = 'valid_bot_token';
      const bot = createBot(token);
      
      expect(bot).toBeDefined();
      expect(bot.token).toBe(token);
    });

    it('should throw error with empty token', () => {
      expect(() => createBot('')).toThrow('Telegram bot token is required');
    });

    it('should throw error with null token', () => {
      expect(() => createBot(null as any)).toThrow('Telegram bot token is required');
    });

    it('should throw error with undefined token', () => {
      expect(() => createBot(undefined as any)).toThrow('Telegram bot token is required');
    });

    it('should handle whitespace-only token', () => {
      expect(() => createBot('   ')).not.toThrow();
    });

    it('should handle very long token', () => {
      const longToken = 'a'.repeat(1000);
      expect(() => createBot(longToken)).not.toThrow();
    });
  });

  describe('startPolling', () => {
    it('should start bot polling', () => {
      const mockBot = {
        launch: vi.fn(),
        stop: vi.fn()
      };

      startPolling(mockBot as any);
      
      expect(mockBot.launch).toHaveBeenCalledOnce();
    });

    it('should handle launch errors gracefully', () => {
      const mockBot = {
        launch: vi.fn().mockRejectedValue(new Error('Network error'))
      };

      expect(() => startPolling(mockBot as any)).not.toThrow();
      expect(mockBot.launch).toHaveBeenCalledOnce();
    });
  });

  describe('safeReply', () => {
    it('should send reply successfully', async () => {
      const expectedMessage = { message_id: 123, text: 'Hello' };
      vi.mocked(mockContext.reply).mockResolvedValue(expectedMessage);

      const result = await safeReply(mockContext as BotContext, 'Hello');
      
      expect(result).toEqual(expectedMessage);
      expect(mockContext.reply).toHaveBeenCalledWith('Hello', {});
    });

    it('should send reply with options', async () => {
      const expectedMessage = { message_id: 123, text: 'Hello' };
      const options = { parse_mode: 'Markdown' as const };
      
      vi.mocked(mockContext.reply).mockResolvedValue(expectedMessage);

      const result = await safeReply(mockContext as BotContext, 'Hello', options);
      
      expect(result).toEqual(expectedMessage);
      expect(mockContext.reply).toHaveBeenCalledWith('Hello', options);
    });

    it('should handle bot blocked by user error', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const blockedError: TelegramError = {
        response: {
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user'
        }
      } as TelegramError;

      vi.mocked(mockContext.reply).mockRejectedValue(blockedError);

      const result = await safeReply(mockContext as BotContext, 'Hello');
      
      expect(result).toBeNull();
      expect(LogEngine.warn).toHaveBeenCalledWith(
        'Bot was blocked by user during reply - cleaning up user data',
        { chatId: -67890, userId: 12345 }
      );
    });

    it('should handle chat not found error', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const chatNotFoundError: TelegramError = {
        response: {
          error_code: 403,
          description: 'Forbidden: chat not found'
        }
      } as TelegramError;

      vi.mocked(mockContext.reply).mockRejectedValue(chatNotFoundError);

      const result = await safeReply(mockContext as BotContext, 'Hello');
      
      expect(result).toBeNull();
      expect(LogEngine.warn).toHaveBeenCalledWith(
        'Chat not found during reply - cleaning up chat data',
        { chatId: -67890 }
      );
    });

    it('should handle rate limit error', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const rateLimitError: TelegramError = {
        response: {
          error_code: 429,
          description: 'Too Many Requests: retry after 30'
        }
      } as TelegramError;

      vi.mocked(mockContext.reply).mockRejectedValue(rateLimitError);

      const result = await safeReply(mockContext as BotContext, 'Hello');
      
      expect(result).toBeNull();
      expect(LogEngine.warn).toHaveBeenCalledWith(
        'Rate limit exceeded during reply',
        { chatId: -67890, retryAfter: undefined }
      );
    });

    it('should handle other 403 errors', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const otherForbiddenError: TelegramError = {
        response: {
          error_code: 403,
          description: 'Forbidden: some other reason'
        }
      } as TelegramError;

      vi.mocked(mockContext.reply).mockRejectedValue(otherForbiddenError);

      await expect(safeReply(mockContext as BotContext, 'Hello')).rejects.toThrow();
      expect(LogEngine.error).toHaveBeenCalled();
    });

    it('should handle non-Telegram errors', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const networkError = new Error('Network timeout');
      vi.mocked(mockContext.reply).mockRejectedValue(networkError);

      await expect(safeReply(mockContext as BotContext, 'Hello')).rejects.toThrow('Network timeout');
      expect(LogEngine.error).toHaveBeenCalled();
    });

    it('should handle context without chat ID', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const contextWithoutChat = {
        ...mockContext,
        chat: undefined
      };

      const blockedError: TelegramError = {
        response: {
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user'
        }
      } as TelegramError;

      vi.mocked(contextWithoutChat.reply).mockRejectedValue(blockedError);

      const result = await safeReply(contextWithoutChat as BotContext, 'Hello');
      
      expect(result).toBeNull();
      expect(LogEngine.warn).toHaveBeenCalled();
    });

    it('should handle context without user ID', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const contextWithoutUser = {
        ...mockContext,
        from: undefined
      };

      const blockedError: TelegramError = {
        response: {
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user'
        }
      } as TelegramError;

      vi.mocked(contextWithoutUser.reply).mockRejectedValue(blockedError);

      const result = await safeReply(contextWithoutUser as BotContext, 'Hello');
      
      expect(result).toBeNull();
      expect(LogEngine.warn).toHaveBeenCalledWith(
        'Bot was blocked by user during reply - cleaning up user data',
        { chatId: -67890, userId: undefined }
      );
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle error without response property', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const errorWithoutResponse = new Error('Generic error');
      vi.mocked(mockContext.reply).mockRejectedValue(errorWithoutResponse);

      await expect(safeReply(mockContext as BotContext, 'Hello')).rejects.toThrow('Generic error');
      expect(LogEngine.error).toHaveBeenCalled();
    });

    it('should handle error with malformed response', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const malformedError = {
        response: {
          error_code: 'not_a_number',
          description: null
        }
      };

      vi.mocked(mockContext.reply).mockRejectedValue(malformedError);

      await expect(safeReply(mockContext as BotContext, 'Hello')).rejects.toThrow();
      expect(LogEngine.error).toHaveBeenCalled();
    });

    it('should handle 400 Bad Request errors', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const badRequestError: TelegramError = {
        response: {
          error_code: 400,
          description: 'Bad Request: message text is empty'
        }
      } as TelegramError;

      vi.mocked(mockContext.reply).mockRejectedValue(badRequestError);

      await expect(safeReply(mockContext as BotContext, 'Hello')).rejects.toThrow();
      expect(LogEngine.error).toHaveBeenCalled();
    });

    it('should handle 500 Internal Server errors', async () => {
      const { LogEngine } = await import('@wgtechlabs/log-engine');
      
      const serverError: TelegramError = {
        response: {
          error_code: 500,
          description: 'Internal Server Error'
        }
      } as TelegramError;

      vi.mocked(mockContext.reply).mockRejectedValue(serverError);

      await expect(safeReply(mockContext as BotContext, 'Hello')).rejects.toThrow();
      expect(LogEngine.error).toHaveBeenCalled();
    });
  });

  describe('Message Content Handling', () => {
    it('should handle empty message text', async () => {
      const expectedMessage = { message_id: 123, text: '' };
      vi.mocked(mockContext.reply).mockResolvedValue(expectedMessage);

      const result = await safeReply(mockContext as BotContext, '');
      
      expect(result).toEqual(expectedMessage);
      expect(mockContext.reply).toHaveBeenCalledWith('', {});
    });

    it('should handle very long message text', async () => {
      const longText = 'a'.repeat(5000);
      const expectedMessage = { message_id: 123, text: longText };
      
      vi.mocked(mockContext.reply).mockResolvedValue(expectedMessage);

      const result = await safeReply(mockContext as BotContext, longText);
      
      expect(result).toEqual(expectedMessage);
      expect(mockContext.reply).toHaveBeenCalledWith(longText, {});
    });

    it('should handle message with special characters', async () => {
      const specialText = '🎉 Hello *World* _test_ `code` [link](url)';
      const expectedMessage = { message_id: 123, text: specialText };
      
      vi.mocked(mockContext.reply).mockResolvedValue(expectedMessage);

      const result = await safeReply(mockContext as BotContext, specialText);
      
      expect(result).toEqual(expectedMessage);
      expect(mockContext.reply).toHaveBeenCalledWith(specialText, {});
    });

    it('should handle message with HTML entities', async () => {
      const htmlText = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      const expectedMessage = { message_id: 123, text: htmlText };
      
      vi.mocked(mockContext.reply).mockResolvedValue(expectedMessage);

      const result = await safeReply(mockContext as BotContext, htmlText);
      
      expect(result).toEqual(expectedMessage);
      expect(mockContext.reply).toHaveBeenCalledWith(htmlText, {});
    });
  });

  describe('Context Types', () => {
    it('should handle private chat context', async () => {
      const privateChatContext = {
        ...mockContext,
        chat: {
          id: 12345,
          type: 'private'
        }
      };

      const expectedMessage = { message_id: 123, text: 'Hello' };
      vi.mocked(privateChatContext.reply).mockResolvedValue(expectedMessage);

      const result = await safeReply(privateChatContext as BotContext, 'Hello');
      
      expect(result).toEqual(expectedMessage);
    });

    it('should handle supergroup context', async () => {
      const supergroupContext = {
        ...mockContext,
        chat: {
          id: -100123456789,
          type: 'supergroup'
        }
      };

      const expectedMessage = { message_id: 123, text: 'Hello' };
      vi.mocked(supergroupContext.reply).mockResolvedValue(expectedMessage);

      const result = await safeReply(supergroupContext as BotContext, 'Hello');
      
      expect(result).toEqual(expectedMessage);
    });

    it('should handle channel context', async () => {
      const channelContext = {
        ...mockContext,
        chat: {
          id: -100987654321,
          type: 'channel'
        }
      };

      const expectedMessage = { message_id: 123, text: 'Hello' };
      vi.mocked(channelContext.reply).mockResolvedValue(expectedMessage);

      const result = await safeReply(channelContext as BotContext, 'Hello');
      
      expect(result).toEqual(expectedMessage);
    });
  });
});