/**
 * Message Analyzer Utility
 * 
 * Provides intelligent analysis of user messages to generate contextually appropriate
 * status notifications that focus on user intent rather than technical implementation.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0-rc2
 * @since 2025
 */

import type { BotContext } from '../types/index.js';
import { getMessageText } from './messageContentExtractor.js';
import { extractFileAttachments } from '../events/message.js';

/**
 * Attachment type categorization for user-friendly messaging
 */
export interface AttachmentAnalysis {
    count: number;
    types: {
        images: number;
        documents: number;
        videos: number;
        audio: number;
        other: number;
    };
    primaryType: 'images' | 'documents' | 'videos' | 'audio' | 'files';
}

/**
 * Message content analysis result
 */
export interface MessageAnalysis {
    hasText: boolean;
    textLength: number;
    hasAttachments: boolean;
    attachments: AttachmentAnalysis;
    messageType: 'text-only' | 'attachments-only' | 'text-with-attachments';
}

/**
 * Analyzes message content and attachments to determine appropriate user messaging
 * 
 * @param ctx - Bot context containing the message
 * @returns Analysis of the message content and attachments
 */
export function analyzeMessage(ctx: BotContext): MessageAnalysis {
    const text = getMessageText(ctx);
    const hasText = text.trim().length > 0;
    const textLength = text.trim().length;
    
    const fileIds = extractFileAttachments(ctx);
    const hasAttachments = fileIds.length > 0;
    
    const attachments = analyzeAttachments(ctx);
    
    let messageType: MessageAnalysis['messageType'];
    if (hasText && hasAttachments) {
        messageType = 'text-with-attachments';
    } else if (hasAttachments) {
        messageType = 'attachments-only';
    } else {
        messageType = 'text-only';
    }
    
    return {
        hasText,
        textLength,
        hasAttachments,
        attachments,
        messageType
    };
}

/**
 * Analyzes attachment types and counts for smart messaging
 * 
 * @param ctx - Bot context containing the message
 * @returns Detailed attachment analysis
 */
export function analyzeAttachments(ctx: BotContext): AttachmentAnalysis {
    const analysis: AttachmentAnalysis = {
        count: 0,
        types: {
            images: 0,
            documents: 0,
            videos: 0,
            audio: 0,
            other: 0
        },
        primaryType: 'files'
    };
    
    if (!ctx.message) {
        return analysis;
    }
    
    // Count different attachment types
    if ('photo' in ctx.message && ctx.message.photo) {
        analysis.types.images++;
        analysis.count++;
    }
    
    if ('document' in ctx.message && ctx.message.document) {
        analysis.types.documents++;
        analysis.count++;
    }
    
    if ('video' in ctx.message && ctx.message.video) {
        analysis.types.videos++;
        analysis.count++;
    }
    
    if ('video_note' in ctx.message && ctx.message.video_note) {
        analysis.types.videos++;
        analysis.count++;
    }
    
    if ('animation' in ctx.message && ctx.message.animation) {
        analysis.types.videos++; // Treat animations as videos for user messaging
        analysis.count++;
    }
    
    if ('voice' in ctx.message && ctx.message.voice) {
        analysis.types.audio++;
        analysis.count++;
    }
    
    if ('audio' in ctx.message && ctx.message.audio) {
        analysis.types.audio++;
        analysis.count++;
    }
    
    // Determine primary type for messaging
    if (analysis.types.images > 0) {
        analysis.primaryType = 'images';
    } else if (analysis.types.documents > 0) {
        analysis.primaryType = 'documents';
    } else if (analysis.types.videos > 0) {
        analysis.primaryType = 'videos';
    } else if (analysis.types.audio > 0) {
        analysis.primaryType = 'audio';
    } else {
        analysis.primaryType = 'files';
    }
    
    return analysis;
}

/**
 * Generates contextually appropriate status messages based on message analysis
 */
export class SmartMessageGenerator {
    
    /**
     * Generates status message for ticket creation
     * 
     * @param analysis - Message analysis result
     * @returns User-friendly status message
     */
    static generateTicketCreationMessage(analysis: MessageAnalysis): string {
        const baseMessage = "🎫 **Creating Your Ticket**\n\n";
        
        switch (analysis.messageType) {
            case 'text-only':
                return baseMessage + "⏳ Sending your message to our support team...";
                
            case 'attachments-only':
                return baseMessage + `⏳ Sending your ${this.getAttachmentDescription(analysis.attachments)} to our support team...`;
                
            case 'text-with-attachments':
                return baseMessage + `⏳ Sending your message and ${this.getAttachmentDescription(analysis.attachments)} to our support team...`;
                
            default:
                return baseMessage + "⏳ Creating your support ticket...";
        }
    }
    
    /**
     * Generates status message for ticket replies
     * 
     * @param analysis - Message analysis result
     * @returns User-friendly status message
     */
    static generateTicketReplyMessage(analysis: MessageAnalysis): string {
        switch (analysis.messageType) {
            case 'text-only':
                return "⏳ Sending your message to support team...";
                
            case 'attachments-only':
                return `⏳ Sending your ${this.getAttachmentDescription(analysis.attachments)} to support team...`;
                
            case 'text-with-attachments':
                return `⏳ Sending your message and ${this.getAttachmentDescription(analysis.attachments)} to support team...`;
                
            default:
                return "⏳ Adding to ticket...";
        }
    }
    
    /**
     * Generates status message for agent replies
     * 
     * @param analysis - Message analysis result
     * @returns User-friendly status message
     */
    static generateAgentReplyMessage(analysis: MessageAnalysis): string {
        switch (analysis.messageType) {
            case 'text-only':
                return "⏳ Sending your response...";
                
            case 'attachments-only':
                return `⏳ Sending your ${this.getAttachmentDescription(analysis.attachments)}...`;
                
            case 'text-with-attachments':
                return `⏳ Sending your response with ${this.getAttachmentDescription(analysis.attachments)}...`;
                
            default:
                return "⏳ Sending...";
        }
    }
    
    /**
     * Generates user-friendly attachment description
     * 
     * @param attachments - Attachment analysis
     * @returns Human-readable attachment description
     */
    private static getAttachmentDescription(attachments: AttachmentAnalysis): string {
        const { count } = attachments;
        
        if (count === 0) {
            return "";
        }
        
        if (count === 1) {
            return "file";
        }
        
        // Multiple files - always use generic "files" term
        return `${count} files`;
    }
}

/**
 * Convenience function to generate appropriate status message
 * 
 * @param ctx - Bot context
 * @param context - The context where the message will be used
 * @param fileCount - Optional explicit file count for media groups
 * @returns Contextually appropriate status message
 */
export function generateStatusMessage(
    ctx: BotContext, 
    context: 'ticket-creation' | 'ticket-reply' | 'agent-reply',
    fileCount?: number
): string {
    const analysis = analyzeMessage(ctx);
    
    // Override attachment count if explicitly provided (for media groups)
    if (fileCount !== undefined && fileCount > 0) {
        analysis.attachments.count = fileCount;
        analysis.hasAttachments = true;
        if (analysis.hasText) {
            analysis.messageType = 'text-with-attachments';
        } else {
            analysis.messageType = 'attachments-only';
        }
    }
    
    switch (context) {
        case 'ticket-creation':
            return SmartMessageGenerator.generateTicketCreationMessage(analysis);
        case 'ticket-reply':
            return SmartMessageGenerator.generateTicketReplyMessage(analysis);
        case 'agent-reply':
            return SmartMessageGenerator.generateAgentReplyMessage(analysis);
        default:
            return "⏳ Processing...";
    }
}
