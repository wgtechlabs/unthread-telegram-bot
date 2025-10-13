/**
 * Error Context Builder Test Suite
 * 
 * Comprehensive tests for the ErrorContextBuilder utility that provides
 * standardized error handling across the application.
 */

import { describe, expect, it } from 'vitest';
import { ErrorContextBuilder } from '../utils/errorContextBuilder.js';
import type { BotContext } from '../types/index.js';

describe('ErrorContextBuilder', () => {
    describe('constructor and error normalization', () => {
        it('should normalize Error objects to their message', () => {
            const error = new Error('Test error message');
            const builder = new ErrorContextBuilder(error);
            const context = builder.build();
            
            expect(context.error).toBe('Test error message');
            expect(context.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
        });

        it('should handle string errors directly', () => {
            const builder = new ErrorContextBuilder('Simple error string');
            const context = builder.build();
            
            expect(context.error).toBe('Simple error string');
        });

        it('should extract message from error-like objects', () => {
            const errorObj = { message: 'Object error message' };
            const builder = new ErrorContextBuilder(errorObj);
            const context = builder.build();
            
            expect(context.error).toBe('Object error message');
        });

        it('should extract error property from error-like objects', () => {
            const errorObj = { error: 'Error property message' };
            const builder = new ErrorContextBuilder(errorObj);
            const context = builder.build();
            
            expect(context.error).toBe('Error property message');
        });

        it('should stringify unknown error types', () => {
            const builder = new ErrorContextBuilder(42);
            const context = builder.build();
            
            expect(context.error).toBe('42');
        });

        it('should handle null and undefined errors', () => {
            const nullBuilder = new ErrorContextBuilder(null);
            const undefinedBuilder = new ErrorContextBuilder(undefined);
            
            expect(nullBuilder.build().error).toBe('null');
            expect(undefinedBuilder.build().error).toBe('undefined');
        });

        it('should handle complex objects without message/error properties', () => {
            const complexObj = { data: 'test', code: 500 };
            const builder = new ErrorContextBuilder(complexObj);
            const context = builder.build();
            
            expect(context.error).toBe('[object Object]');
        });
    });

    describe('withBotContext', () => {
        it('should add user ID and chat ID from bot context', () => {
            const mockContext: Partial<BotContext> = {
                from: { id: 12345, is_bot: false, first_name: 'Test' },
                chat: { id: -67890, type: 'group' }
            };

            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withBotContext(mockContext as BotContext).build();
            
            expect(context.userId).toBe(12345);
            expect(context.chatId).toBe(-67890);
        });

        it('should handle missing user information gracefully', () => {
            const mockContext: Partial<BotContext> = {
                chat: { id: -67890, type: 'group' }
            };

            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withBotContext(mockContext as BotContext).build();
            
            expect(context.userId).toBeUndefined();
            expect(context.chatId).toBe(-67890);
        });

        it('should handle missing chat information gracefully', () => {
            const mockContext: Partial<BotContext> = {
                from: { id: 12345, is_bot: false, first_name: 'Test' }
            };

            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withBotContext(mockContext as BotContext).build();
            
            expect(context.userId).toBe(12345);
            expect(context.chatId).toBeUndefined();
        });

        it('should handle completely empty context', () => {
            const mockContext: Partial<BotContext> = {};

            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withBotContext(mockContext as BotContext).build();
            
            expect(context.userId).toBeUndefined();
            expect(context.chatId).toBeUndefined();
        });
    });

    describe('withCommand', () => {
        it('should add command name to context', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withCommand('test-command').build();
            
            expect(context.commandName).toBe('test-command');
        });

        it('should handle empty command name', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withCommand('').build();
            
            expect(context.commandName).toBe('');
        });
    });

    describe('withAttachment', () => {
        it('should add attachment count to context', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withAttachment(3).build();
            
            expect(context.attachmentCount).toBe(3);
        });

        it('should handle zero attachments', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withAttachment(0).build();
            
            expect(context.attachmentCount).toBe(0);
        });

        it('should handle negative attachment count', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withAttachment(-1).build();
            
            expect(context.attachmentCount).toBe(-1);
        });
    });

    describe('withFile', () => {
        it('should add file name and size to context', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withFile('test.txt', 1024).build();
            
            expect(context.fileName).toBe('test.txt');
            expect(context.fileSize).toBe(1024);
        });

        it('should add file name without size', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withFile('test.txt').build();
            
            expect(context.fileName).toBe('test.txt');
            expect(context.fileSize).toBeUndefined();
        });

        it('should handle empty file name', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withFile('', 0).build();
            
            expect(context.fileName).toBe('');
            expect(context.fileSize).toBe(0);
        });
    });

    describe('withWebhook', () => {
        it('should add webhook type and event ID to context', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withWebhook('message', 'evt_123').build();
            
            expect(context.webhookType).toBe('message');
            expect(context.eventId).toBe('evt_123');
        });

        it('should handle empty webhook values', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withWebhook('', '').build();
            
            expect(context.webhookType).toBe('');
            expect(context.eventId).toBeUndefined(); // Empty string is falsy, so eventId won't be set
        });
    });

    describe('withCustom', () => {
        it('should add custom property to context', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withCustom('customProp', 'value').build();
            
            expect(context.customProp).toBe('value');
        });

        it('should handle numeric values', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withCustom('number', 42).build();
            
            expect(context.number).toBe(42);
        });

        it('should reject dangerous prototype keys', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder
                .withCustom('__proto__', 'malicious')
                .withCustom('constructor', 'malicious')
                .withCustom('prototype', 'malicious')
                .build();
            
            // These properties should not have been set to 'malicious'
            // The original properties should remain unchanged
            expect(Object.prototype.hasOwnProperty.call(context, '__proto__')).toBe(false);
            expect(context.constructor).not.toBe('malicious');
            expect(Object.prototype.hasOwnProperty.call(context, 'prototype')).toBe(false);
        });

        it('should reject keys starting and ending with double underscores', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder
                .withCustom('__dangerous__', 'value')
                .withCustom('__start_dangerous', 'value')
                .withCustom('dangerous_end__', 'value')
                .build();
            
            expect(Object.prototype.hasOwnProperty.call(context, '__dangerous__')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(context, '__start_dangerous')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(context, 'dangerous_end__')).toBe(false);
        });

        it('should reject empty string keys', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withCustom('', 'value').build();
            
            expect(context['']).toBeUndefined();
        });

        it('should accept safe keys', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder
                .withCustom('safeKey', 'value')
                .withCustom('another_safe_key', 'value2')
                .build();
            
            expect(context.safeKey).toBe('value');
            expect(context.another_safe_key).toBe('value2');
        });
    });

    describe('withProperties', () => {
        it('should add multiple custom properties to context', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withProperties({ 
                customProp: 'value', 
                number: 42 
            }).build();
            
            expect(context.customProp).toBe('value');
            expect(context.number).toBe(42);
        });

        it('should handle empty properties object', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withProperties({}).build();
            
            // Should not add any new properties
            const keys = Object.keys(context);
            expect(keys).toContain('error');
            expect(keys).toContain('timestamp');
        });

        it('should filter out dangerous keys from properties', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context = builder.withProperties({ 
                safeKey: 'safe',
                __proto__: 'dangerous',
                constructor: 'dangerous',
                validProp: 'valid'
            }).build();
            
            expect(context.safeKey).toBe('safe');
            expect(context.validProp).toBe('valid');
            expect(Object.prototype.hasOwnProperty.call(context, '__proto__')).toBe(false);
            expect(context.constructor).not.toBe('dangerous');
        });
    });

    describe('method chaining', () => {
        it('should support chaining all methods', () => {
            const mockContext: Partial<BotContext> = {
                from: { id: 12345, is_bot: false, first_name: 'Test' },
                chat: { id: -67890, type: 'group' }
            };

            const builder = new ErrorContextBuilder('Chain test error');
            const context = builder
                .withBotContext(mockContext as BotContext)
                .withCommand('chain-command')
                .withAttachment(2)
                .withFile('chain.txt', 512)
                .withWebhook('message', 'chain_123')
                .withCustom('custom', 'chain-value')
                .withProperties({ prop1: 'value1', prop2: 42 })
                .build();
            
            expect(context.error).toBe('Chain test error');
            expect(context.userId).toBe(12345);
            expect(context.chatId).toBe(-67890);
            expect(context.commandName).toBe('chain-command');
            expect(context.attachmentCount).toBe(2);
            expect(context.fileName).toBe('chain.txt');
            expect(context.fileSize).toBe(512);
            expect(context.webhookType).toBe('message');
            expect(context.eventId).toBe('chain_123');
            expect(context.custom).toBe('chain-value');
            expect(context.prop1).toBe('value1');
            expect(context.prop2).toBe(42);
            expect(context.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
        });
    });

    describe('build', () => {
        it('should return a copy of the context object', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context1 = builder.build();
            const context2 = builder.build();
            
            expect(context1).toEqual(context2);
            expect(context1).not.toBe(context2); // Different objects
        });

        it('should not affect previous builds when builder is modified', () => {
            const builder = new ErrorContextBuilder('Test error');
            const context1 = builder.build();
            
            builder.withCommand('new-command');
            const context2 = builder.build();
            
            expect(context1.commandName).toBeUndefined();
            expect(context2.commandName).toBe('new-command');
        });
    });

    describe('static convenience methods', () => {
        const mockContext: Partial<BotContext> = {
            from: { id: 12345, is_bot: false, first_name: 'Test' },
            chat: { id: -67890, type: 'group' }
        };

        describe('forCommand', () => {
            it('should create error context for command failures', () => {
                const error = new Error('Command failed');
                const context = ErrorContextBuilder.forCommand(error, mockContext as BotContext, 'test-command');
                
                expect(context.error).toBe('Command failed');
                expect(context.userId).toBe(12345);
                expect(context.chatId).toBe(-67890);
                expect(context.commandName).toBe('test-command');
                expect(context.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
            });
        });

        describe('forAttachment', () => {
            it('should create error context for attachment failures', () => {
                const error = 'Attachment processing failed';
                const context = ErrorContextBuilder.forAttachment(error, mockContext as BotContext, 3);
                
                expect(context.error).toBe('Attachment processing failed');
                expect(context.userId).toBe(12345);
                expect(context.chatId).toBe(-67890);
                expect(context.attachmentCount).toBe(3);
                expect(context.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
            });
        });

        describe('forFile', () => {
            it('should create error context for file failures with size', () => {
                const error = { message: 'File processing failed' };
                const context = ErrorContextBuilder.forFile(error, mockContext as BotContext, 'test.pdf', 2048);
                
                expect(context.error).toBe('File processing failed');
                expect(context.userId).toBe(12345);
                expect(context.chatId).toBe(-67890);
                expect(context.fileName).toBe('test.pdf');
                expect(context.fileSize).toBe(2048);
                expect(context.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
            });

            it('should create error context for file failures without size', () => {
                const error = 'File processing failed';
                const context = ErrorContextBuilder.forFile(error, mockContext as BotContext, 'test.pdf');
                
                expect(context.error).toBe('File processing failed');
                expect(context.fileName).toBe('test.pdf');
                expect(context.fileSize).toBeUndefined();
            });
        });

        describe('forWebhook', () => {
            it('should create error context for webhook failures with event ID', () => {
                const error = new Error('Webhook processing failed');
                const context = ErrorContextBuilder.forWebhook(error, 'message', 'evt_123');
                
                expect(context.error).toBe('Webhook processing failed');
                expect(context.webhookType).toBe('message');
                expect(context.eventId).toBe('evt_123');
                expect(context.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
            });

            it('should create error context for webhook failures without event ID', () => {
                const error = 'Webhook failed';
                const context = ErrorContextBuilder.forWebhook(error, 'callback');
                
                expect(context.error).toBe('Webhook failed');
                expect(context.webhookType).toBe('callback');
                expect(context.eventId).toBeUndefined();
            });
        });

        describe('basic', () => {
            it('should create basic error context', () => {
                const error = new Error('Basic error');
                const context = ErrorContextBuilder.basic(error);
                
                expect(context.error).toBe('Basic error');
                expect(context.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
                expect(context.userId).toBeUndefined();
                expect(context.chatId).toBeUndefined();
                expect(context.commandName).toBeUndefined();
            });
        });
    });
});