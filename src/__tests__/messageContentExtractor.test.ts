/**
 * Unit tests for messageContentExtractor utilities
 */
import { describe, expect, it } from '@jest/globals';
import {
  getCommand,
  getCommandArgs,
  getMessageText,
  getMessageTypeInfo,
  hasTextContent,
  isCommand
} from '../utils/messageContentExtractor';
import type { BotContext } from '../types/index';

// Type for message objects that our extractor functions expect
type TestMessage = 
  | { text: string }
  | { caption: string }
  | { photo: unknown; caption?: string }
  | { document: unknown; caption?: string }
  | undefined;

// Mock BotContext for testing  
const createMockContext = (message: TestMessage): BotContext => ({
  message,
  // Add minimal required properties for BotContext
  chat: { id: 123, type: 'private' },
  from: { id: 456 }
} as BotContext);

describe('messageContentExtractor', () => {
  describe('getMessageText', () => {
    it('should return empty string when no message', () => {
      const ctx = createMockContext(undefined);
      expect(getMessageText(ctx)).toBe('');
    });

    it('should extract text from text message', () => {
      const ctx = createMockContext({ text: 'Hello world' });
      expect(getMessageText(ctx)).toBe('Hello world');
    });

    it('should extract text from caption (photo with text)', () => {
      const ctx = createMockContext({ 
        photo: [{}], 
        caption: 'Photo caption text' 
      });
      expect(getMessageText(ctx)).toBe('Photo caption text');
    });

    it('should prefer text over caption when both exist', () => {
      const ctx = createMockContext({ 
        text: 'Text message',
        caption: 'Caption text' 
      });
      expect(getMessageText(ctx)).toBe('Text message');
    });

    it('should return empty string when no text or caption', () => {
      const ctx = createMockContext({ photo: [{}] });
      expect(getMessageText(ctx)).toBe('');
    });
  });

  describe('isCommand', () => {
    it('should return true for text starting with /', () => {
      const ctx = createMockContext({ text: '/start' });
      expect(isCommand(ctx)).toBe(true);
    });

    it('should return true for caption starting with /', () => {
      const ctx = createMockContext({ 
        photo: [{}], 
        caption: '/support help me' 
      });
      expect(isCommand(ctx)).toBe(true);
    });

    it('should return false for text not starting with /', () => {
      const ctx = createMockContext({ text: 'Hello world' });
      expect(isCommand(ctx)).toBe(false);
    });

    it('should return false when no text content', () => {
      const ctx = createMockContext({ photo: [{}] });
      expect(isCommand(ctx)).toBe(false);
    });
  });

  describe('getCommand', () => {
    it('should extract command from text', () => {
      const ctx = createMockContext({ text: '/start arg1 arg2' });
      expect(getCommand(ctx)).toBe('/start');
    });

    it('should extract command from caption', () => {
      const ctx = createMockContext({ 
        photo: [{}], 
        caption: '/support urgent issue' 
      });
      expect(getCommand(ctx)).toBe('/support');
    });

    it('should return empty string for non-command text', () => {
      const ctx = createMockContext({ text: 'Hello world' });
      expect(getCommand(ctx)).toBe('');
    });

    it('should handle command without arguments', () => {
      const ctx = createMockContext({ text: '/help' });
      expect(getCommand(ctx)).toBe('/help');
    });
  });

  describe('getCommandArgs', () => {
    it('should extract arguments from command', () => {
      const ctx = createMockContext({ text: '/start arg1 arg2 arg3' });
      expect(getCommandArgs(ctx)).toBe('arg1 arg2 arg3');
    });

    it('should extract arguments from caption command', () => {
      const ctx = createMockContext({ 
        photo: [{}], 
        caption: '/support my urgent issue description' 
      });
      expect(getCommandArgs(ctx)).toBe('my urgent issue description');
    });

    it('should return empty string for command without arguments', () => {
      const ctx = createMockContext({ text: '/help' });
      expect(getCommandArgs(ctx)).toBe('');
    });

    it('should return empty string for non-command', () => {
      const ctx = createMockContext({ text: 'Hello world' });
      expect(getCommandArgs(ctx)).toBe('');
    });
  });

  describe('hasTextContent', () => {
    it('should return true when message has text', () => {
      const ctx = createMockContext({ text: 'Hello' });
      expect(hasTextContent(ctx)).toBe(true);
    });

    it('should return true when message has caption', () => {
      const ctx = createMockContext({ 
        photo: [{}], 
        caption: 'Caption text' 
      });
      expect(hasTextContent(ctx)).toBe(true);
    });

    it('should return false when no text content', () => {
      const ctx = createMockContext({ photo: [{}] });
      expect(hasTextContent(ctx)).toBe(false);
    });

    it('should return false when no message', () => {
      const ctx = createMockContext(undefined);
      expect(hasTextContent(ctx)).toBe(false);
    });
  });

  describe('getMessageTypeInfo', () => {
    it('should identify text message type', () => {
      const ctx = createMockContext({ text: 'Hello world' });
      const info = getMessageTypeInfo(ctx);
      
      expect(info.type).toBe('text');
      expect(info.hasText).toBe(true);
      expect(info.hasCaption).toBe(false);
      expect(info.isCommand).toBe(false);
      expect(info.textSource).toBe('text');
    });

    it('should identify photo message type', () => {
      const ctx = createMockContext({ 
        photo: [{}], 
        caption: 'Photo description' 
      });
      const info = getMessageTypeInfo(ctx);
      
      expect(info.type).toBe('photo');
      expect(info.hasPhoto).toBe(true);
      expect(info.hasCaption).toBe(true);
      expect(info.textSource).toBe('caption');
    });

    it('should identify command in text', () => {
      const ctx = createMockContext({ text: '/start welcome' });
      const info = getMessageTypeInfo(ctx);
      
      expect(info.isCommand).toBe(true);
      expect(info.command).toBe('/start');
    });

    it('should handle message with no content', () => {
      const ctx = createMockContext(undefined);
      const info = getMessageTypeInfo(ctx);
      
      expect(info.type).toBe('none');
      expect(info.hasText).toBe(false);
      expect(info.hasCaption).toBe(false);
      expect(info.isCommand).toBe(false);
    });
  });
});