/**
 * Message Analyzer Test Suite
 * 
 * Comprehensive tests for message analysis functionality that categorizes
 * user messages and attachments for appropriate status notifications.
 */

import { describe, it, expect, vi } from 'vitest';
import { 
    analyzeMessage, 
    analyzeAttachments,
    generateStatusMessage,
    SmartMessageGenerator
} from '../utils/messageAnalyzer.js';
import type { BotContext } from '../types/index.js';

// Mock the dependencies
vi.mock('../utils/messageContentExtractor.js', () => ({
    getMessageText: vi.fn()
}));

vi.mock('../events/message.js', () => ({
    extractFileAttachments: vi.fn()
}));

import { getMessageText } from '../utils/messageContentExtractor.js';
import { extractFileAttachments } from '../events/message.js';

describe('messageAnalyzer', () => {
    describe('analyzeMessage', () => {
        it('should analyze text-only messages', () => {
            const mockContext = {} as BotContext;
            vi.mocked(getMessageText).mockReturnValue('Hello world');
            vi.mocked(extractFileAttachments).mockReturnValue([]);

            const result = analyzeMessage(mockContext);

            expect(result.hasText).toBe(true);
            expect(result.textLength).toBe(11);
            expect(result.hasAttachments).toBe(false);
            expect(result.messageType).toBe('text-only');
            expect(result.attachments.count).toBe(0);
        });

        it('should analyze attachments-only messages', () => {
            const mockContext = {
                message: {
                    photo: [{ file_id: 'photo1' }]
                }
            } as BotContext;
            vi.mocked(getMessageText).mockReturnValue('');
            vi.mocked(extractFileAttachments).mockReturnValue(['photo1']);

            const result = analyzeMessage(mockContext);

            expect(result.hasText).toBe(false);
            expect(result.textLength).toBe(0);
            expect(result.hasAttachments).toBe(true);
            expect(result.messageType).toBe('attachments-only');
            expect(result.attachments.count).toBe(1);
        });

        it('should analyze text with attachments messages', () => {
            const mockContext = {
                message: {
                    document: { file_id: 'doc1' }
                }
            } as BotContext;
            vi.mocked(getMessageText).mockReturnValue('Check this out!');
            vi.mocked(extractFileAttachments).mockReturnValue(['doc1']);

            const result = analyzeMessage(mockContext);

            expect(result.hasText).toBe(true);
            expect(result.textLength).toBe(15);
            expect(result.hasAttachments).toBe(true);
            expect(result.messageType).toBe('text-with-attachments');
            expect(result.attachments.count).toBe(1);
        });

        it('should handle empty text (whitespace only)', () => {
            const mockContext = {} as BotContext;
            vi.mocked(getMessageText).mockReturnValue('   \n\t  ');
            vi.mocked(extractFileAttachments).mockReturnValue([]);

            const result = analyzeMessage(mockContext);

            expect(result.hasText).toBe(false);
            expect(result.textLength).toBe(0); // Trimmed length
            expect(result.messageType).toBe('text-only');
        });
    });

    describe('analyzeAttachments', () => {
        it('should analyze photo attachments', () => {
            const mockContext = {
                message: {
                    photo: [{ file_id: 'photo1' }]
                }
            } as BotContext;

            const result = analyzeAttachments(mockContext);

            expect(result.count).toBe(1);
            expect(result.types.images).toBe(1);
            expect(result.types.documents).toBe(0);
            expect(result.types.videos).toBe(0);
            expect(result.types.audio).toBe(0);
            expect(result.types.other).toBe(0);
            expect(result.primaryType).toBe('images');
        });

        it('should analyze document attachments', () => {
            const mockContext = {
                message: {
                    document: { file_id: 'doc1' }
                }
            } as BotContext;

            const result = analyzeAttachments(mockContext);

            expect(result.count).toBe(1);
            expect(result.types.documents).toBe(1);
            expect(result.primaryType).toBe('documents');
        });

        it('should analyze video attachments', () => {
            const mockContext = {
                message: {
                    video: { file_id: 'video1' }
                }
            } as BotContext;

            const result = analyzeAttachments(mockContext);

            expect(result.count).toBe(1);
            expect(result.types.videos).toBe(1);
            expect(result.primaryType).toBe('videos');
        });

        it('should analyze video_note as video', () => {
            const mockContext = {
                message: {
                    video_note: { file_id: 'videonote1' }
                }
            } as BotContext;

            const result = analyzeAttachments(mockContext);

            expect(result.count).toBe(1);
            expect(result.types.videos).toBe(1);
            expect(result.primaryType).toBe('videos');
        });

        it('should analyze animation as video', () => {
            const mockContext = {
                message: {
                    animation: { file_id: 'animation1' }
                }
            } as BotContext;

            const result = analyzeAttachments(mockContext);

            expect(result.count).toBe(1);
            expect(result.types.videos).toBe(1);
            expect(result.primaryType).toBe('videos');
        });

        it('should analyze voice as audio', () => {
            const mockContext = {
                message: {
                    voice: { file_id: 'voice1' }
                }
            } as BotContext;

            const result = analyzeAttachments(mockContext);

            expect(result.count).toBe(1);
            expect(result.types.audio).toBe(1);
            expect(result.primaryType).toBe('audio');
        });

        it('should analyze audio attachments', () => {
            const mockContext = {
                message: {
                    audio: { file_id: 'audio1' }
                }
            } as BotContext;

            const result = analyzeAttachments(mockContext);

            expect(result.count).toBe(1);
            expect(result.types.audio).toBe(1);
            expect(result.primaryType).toBe('audio');
        });

        it('should handle no message', () => {
            const mockContext = {} as BotContext;

            const result = analyzeAttachments(mockContext);

            expect(result.count).toBe(0);
            expect(result.primaryType).toBe('files');
        });

        it('should prioritize images over other types', () => {
            // Note: Telegram doesn't allow multiple attachment types in one message
            // but we can test the priority logic
            const mockContext = {
                message: {
                    photo: [{ file_id: 'photo1' }]
                }
            } as BotContext;

            const result = analyzeAttachments(mockContext);

            expect(result.primaryType).toBe('images');
        });
    });

    describe('SmartMessageGenerator', () => {
        const createAnalysis = (type: 'text-only' | 'attachments-only' | 'text-with-attachments', count = 0) => ({
            hasText: type === 'text-only' || type === 'text-with-attachments',
            textLength: type === 'text-only' || type === 'text-with-attachments' ? 10 : 0,
            hasAttachments: type === 'attachments-only' || type === 'text-with-attachments',
            attachments: {
                count,
                types: { images: 0, documents: 0, videos: 0, audio: 0, other: 0 },
                primaryType: 'files' as const
            },
            messageType: type
        });

        describe('generateTicketCreationMessage', () => {
            it('should generate message for text-only', () => {
                const analysis = createAnalysis('text-only');
                const result = SmartMessageGenerator.generateTicketCreationMessage(analysis);
                
                expect(result).toContain('Creating Your Ticket');
                expect(result).toContain('Sending your message to our support team');
            });

            it('should generate message for attachments-only', () => {
                const analysis = createAnalysis('attachments-only', 1);
                const result = SmartMessageGenerator.generateTicketCreationMessage(analysis);
                
                expect(result).toContain('Creating Your Ticket');
                expect(result).toContain('Sending your file to our support team');
            });

            it('should generate message for text with attachments', () => {
                const analysis = createAnalysis('text-with-attachments', 2);
                const result = SmartMessageGenerator.generateTicketCreationMessage(analysis);
                
                expect(result).toContain('Creating Your Ticket');
                expect(result).toContain('Sending your message and 2 files to our support team');
            });
        });

        describe('generateTicketReplyMessage', () => {
            it('should generate message for text-only', () => {
                const analysis = createAnalysis('text-only');
                const result = SmartMessageGenerator.generateTicketReplyMessage(analysis);
                
                expect(result).toContain('Sending your message to support team');
            });

            it('should generate message for attachments-only', () => {
                const analysis = createAnalysis('attachments-only', 1);
                const result = SmartMessageGenerator.generateTicketReplyMessage(analysis);
                
                expect(result).toContain('Sending your file to support team');
            });

            it('should generate message for text with attachments', () => {
                const analysis = createAnalysis('text-with-attachments', 3);
                const result = SmartMessageGenerator.generateTicketReplyMessage(analysis);
                
                expect(result).toContain('Sending your message and 3 files to support team');
            });
        });

        describe('generateAgentReplyMessage', () => {
            it('should generate message for text-only', () => {
                const analysis = createAnalysis('text-only');
                const result = SmartMessageGenerator.generateAgentReplyMessage(analysis);
                
                expect(result).toContain('Sending your response');
            });

            it('should generate message for attachments-only', () => {
                const analysis = createAnalysis('attachments-only', 1);
                const result = SmartMessageGenerator.generateAgentReplyMessage(analysis);
                
                expect(result).toContain('Sending your file');
            });

            it('should generate message for text with attachments', () => {
                const analysis = createAnalysis('text-with-attachments', 2);
                const result = SmartMessageGenerator.generateAgentReplyMessage(analysis);
                
                expect(result).toContain('Sending your response with 2 files');
            });
        });
    });

    describe('generateStatusMessage', () => {
        it('should generate ticket creation message', () => {
            const mockContext = {} as BotContext;
            vi.mocked(getMessageText).mockReturnValue('Hello');
            vi.mocked(extractFileAttachments).mockReturnValue([]);

            const result = generateStatusMessage(mockContext, 'ticket-creation');

            expect(result).toContain('Creating Your Ticket');
        });

        it('should generate ticket reply message', () => {
            const mockContext = {} as BotContext;
            vi.mocked(getMessageText).mockReturnValue('Reply');
            vi.mocked(extractFileAttachments).mockReturnValue([]);

            const result = generateStatusMessage(mockContext, 'ticket-reply');

            expect(result).toContain('Sending your message to support team');
        });

        it('should generate agent reply message', () => {
            const mockContext = {} as BotContext;
            vi.mocked(getMessageText).mockReturnValue('Agent response');
            vi.mocked(extractFileAttachments).mockReturnValue([]);

            const result = generateStatusMessage(mockContext, 'agent-reply');

            expect(result).toContain('Sending your response');
        });

        it('should override file count when provided', () => {
            const mockContext = {} as BotContext;
            vi.mocked(getMessageText).mockReturnValue('');
            vi.mocked(extractFileAttachments).mockReturnValue([]);

            const result = generateStatusMessage(mockContext, 'ticket-creation', 5);

            expect(result).toContain('5 files');
        });

        it('should handle invalid context', () => {
            const mockContext = {} as BotContext;
            vi.mocked(getMessageText).mockReturnValue('Test');
            vi.mocked(extractFileAttachments).mockReturnValue([]);

            const result = generateStatusMessage(mockContext, 'invalid' as any);

            expect(result).toBe('⏳ Processing...');
        });
    });
});