/**
 * Unit tests for commands/basic/ViewEmailCommand.ts
 */
import { afterEach, beforeEach, describe, expect, it , mock} from 'bun:test';
import { clearAllMocks, createMock, restoreAllMocks } from './_helpers/mockLifecycle';
import type { BotContext } from '../types/index.js';
import { ViewEmailCommand } from '../commands/basic/ViewEmailCommand.js';

// Mock dependencies
mock.module('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    info: createMock(),
    error: createMock()
  }
}));

mock.module('../utils/emailManager.js', () => ({
  getUserEmailPreferences: createMock()
}));

mock.module('../utils/markdownEscape.js', () => ({
  formatEmailForDisplay: createMock((email: string) => email)
}));

import { LogEngine } from '@wgtechlabs/log-engine';
import { getUserEmailPreferences } from '../utils/emailManager.js';
import { formatEmailForDisplay } from '../utils/markdownEscape.js';

describe('ViewEmailCommand', () => {
  let viewEmailCommand: ViewEmailCommand;
  let mockCtx: BotContext;

  beforeEach(() => {
    clearAllMocks();
    
    viewEmailCommand = new ViewEmailCommand();
    
    mockCtx = {
      from: { id: 123, first_name: 'Test', is_bot: false },
      chat: { id: 456, type: 'private' },
      message: { text: '/viewemail', message_id: 789 },
      reply: mock()
    } as BotContext;
  });

  afterEach(() => {
    restoreAllMocks();
  });

  describe('metadata', () => {
    it('should have correct metadata', () => {
      expect(viewEmailCommand.metadata.name).toBe('viewemail');
      expect(viewEmailCommand.metadata.description).toBe('View your current email settings');
      expect(viewEmailCommand.metadata.usage).toBe('/viewemail');
      expect(viewEmailCommand.metadata.examples).toContain('/viewemail - Show current email settings');
      expect(viewEmailCommand.metadata.requiresSetup).toBe(false);
    });
  });

  describe('execute', () => {
    it('should handle missing from context', async () => {
      const ctxWithoutFrom = {
        ...mockCtx,
        from: undefined
      } as BotContext;

      await viewEmailCommand.execute(ctxWithoutFrom);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        "❌ Invalid command context. Please try again."
      );
      expect(getUserEmailPreferences).not.toHaveBeenCalled();
    });

    it('should show no email message when no preferences exist', async () => {
      (getUserEmailPreferences as any).mockResolvedValue(null);

      await viewEmailCommand.execute(mockCtx);

      expect(getUserEmailPreferences).toHaveBeenCalledWith(123);
      expect(LogEngine.info).toHaveBeenCalledWith('ViewEmailCommand executed', { userId: 123 });
      expect(LogEngine.info).toHaveBeenCalledWith('Email preferences retrieved', {
        userId: 123,
        hasPrefs: false,
        email: undefined,
        isDummy: undefined
      });

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      expect(replyCall[0]).toContain('📧 **Email Settings**');
      expect(replyCall[0]).toContain('❌ **No email address set**');
      expect(replyCall[0]).toContain('/setemail');
      expect(replyCall[1]).toEqual({ parse_mode: 'Markdown' });

      expect(LogEngine.info).toHaveBeenCalledWith('Showed no email message to user', { userId: 123 });
    });

    it('should show temporary email settings', async () => {
      const mockEmailPrefs = {
        email: 'temp123@example.com',
        setAt: '2024-01-01T00:00:00.000Z',
        isDummy: true
      };
      (getUserEmailPreferences as any).mockResolvedValue(mockEmailPrefs);

      await viewEmailCommand.execute(mockCtx);

      expect(formatEmailForDisplay).toHaveBeenCalledWith('temp123@example.com');
      
      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      
      expect(message).toContain('📧 **Email Settings**');
      expect(message).toContain('temp123@example.com');
      expect(message).toContain('🏷️ **Type:** Temporary email');
      expect(message).toContain('💡 **About temporary emails:**');
      expect(message).toContain('You can upgrade to a real email anytime');
      expect(replyCall[1]).toEqual({ parse_mode: 'Markdown' });

      expect(LogEngine.info).toHaveBeenCalledWith('User viewed email settings', {
        userId: 123,
        hasRealEmail: false,
        emailDomain: 'example.com'
      });
    });

    it('should show real email settings', async () => {
      const mockEmailPrefs = {
        email: 'user@real.com',
        setAt: '2024-01-01T00:00:00.000Z',
        isDummy: false
      };
      (getUserEmailPreferences as any).mockResolvedValue(mockEmailPrefs);

      await viewEmailCommand.execute(mockCtx);

      expect(formatEmailForDisplay).toHaveBeenCalledWith('user@real.com');
      
      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      
      expect(message).toContain('📧 **Email Settings**');
      expect(message).toContain('user@real.com');
      expect(message).toContain('🏷️ **Type:** Personal email');
      expect(message).toContain('✅ **Benefits of having a real email:**');
      expect(message).toContain('Direct communication with support team');
      expect(replyCall[1]).toEqual({ parse_mode: 'Markdown' });

      expect(LogEngine.info).toHaveBeenCalledWith('User viewed email settings', {
        userId: 123,
        hasRealEmail: true,
        emailDomain: 'real.com'
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      (getUserEmailPreferences as any).mockRejectedValue(error);

      await viewEmailCommand.execute(mockCtx);

      expect(LogEngine.error).toHaveBeenCalledWith('Error in view email command', {
        error: 'Database error',
        userId: 123
      });

      expect(mockCtx.reply).toHaveBeenCalledWith(
        "❌ **Error retrieving email settings**\n\nPlease try again later.",
        { parse_mode: 'Markdown' }
      );
    });

    it('should handle non-Error exceptions', async () => {
      (getUserEmailPreferences as any).mockRejectedValue('String error');

      await viewEmailCommand.execute(mockCtx);

      expect(LogEngine.error).toHaveBeenCalledWith('Error in view email command', {
        error: 'Unknown error',
        userId: 123
      });
    });

    it('should format date correctly for email settings', async () => {
      const mockEmailPrefs = {
        email: 'test@example.com',
        setAt: '2024-01-15T10:30:00.000Z',
        isDummy: false
      };
      (getUserEmailPreferences as any).mockResolvedValue(mockEmailPrefs);

      await viewEmailCommand.execute(mockCtx);

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      
      // Check that date is formatted and included
      expect(message).toContain('📅 **Set on:**');
      // The exact date format depends on locale, so we just check it's there
      expect(message.match(/📅 \*\*Set on:\*\* \d+\/\d+\/\d+/)).toBeTruthy();
    });

    it('should include setup instructions in no email message', async () => {
      (getUserEmailPreferences as any).mockResolvedValue(null);

      await viewEmailCommand.execute(mockCtx);

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      
      expect(message).toContain('**Available actions:**');
      expect(message).toContain('`/setemail` - Start interactive email setup');
      expect(message).toContain('`/setemail waren@wgtechlabs.com` - Set email directly');
      expect(message).toContain('`/support` - Create a ticket');
      expect(message).toContain('💡 *Setting a real email helps our support team contact you directly and improves your support experience.*');
    });

    it('should include different actions for temporary vs real email', async () => {
      // Test temporary email actions
      const tempEmailPrefs = {
        email: 'temp@example.com',
        setAt: '2024-01-01T00:00:00.000Z',
        isDummy: true
      };
      (getUserEmailPreferences as any).mockResolvedValue(tempEmailPrefs);

      await viewEmailCommand.execute(mockCtx);

      let replyCall = (mockCtx.reply as any).mock.calls[0];
      expect(replyCall[0]).toContain('**Recommended actions:**');
      expect(replyCall[0]).toContain('Keep temporary email if you prefer privacy');

      clearAllMocks();

      // Test real email actions
      const realEmailPrefs = {
        email: 'real@example.com',
        setAt: '2024-01-01T00:00:00.000Z',
        isDummy: false
      };
      (getUserEmailPreferences as any).mockResolvedValue(realEmailPrefs);

      await viewEmailCommand.execute(mockCtx);

      replyCall = (mockCtx.reply as any).mock.calls.at(-1);
      expect(replyCall[0]).toContain('**Available actions:**');
      expect(replyCall[0]).toContain('Email is automatically used in new tickets');
    });
  });

  describe('inheritance', () => {
    it('should extend BaseCommand', () => {
      expect(viewEmailCommand).toHaveProperty('execute');
      expect(viewEmailCommand).toHaveProperty('generateHelp');
      expect(typeof viewEmailCommand.execute).toBe('function');
      expect(typeof viewEmailCommand.generateHelp).toBe('function');
    });

    it('should generate help text', () => {
      const help = viewEmailCommand.generateHelp();
      
      expect(help).toContain('viewemail');
      expect(help).toContain('/viewemail');
      expect(help).toContain('View your current email settings');
      expect(help).toContain('/viewemail - Show current email settings');
    });
  });
});
