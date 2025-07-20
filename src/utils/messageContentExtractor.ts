/**
 * Message Content Extractor Utility
 * 
 * Provides unified functions to extract text content from Telegram messages,
 * handling both regular text messages and photo/document messages with captions.
 * 
 * When users send "text with image", Telegram treats it as a photo message with caption,
 * not a text message. This utility normalizes that behavior.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import type { BotContext } from '../types/index.js';

/**
 * Extracts text content from a Telegram message, checking both text and caption fields
 * 
 * @param ctx - Bot context containing the message
 * @returns The text content (from text field or caption) or empty string if none
 */
export function getMessageText(ctx: BotContext): string {
    if (!ctx.message) {
        return '';
    }

    // Check for regular text message
    if ('text' in ctx.message && ctx.message.text) {
        return ctx.message.text;
    }

    // Check for caption (photo with text, document with text, etc.)
    if ('caption' in ctx.message && ctx.message.caption) {
        return ctx.message.caption;
    }

    return '';
}

/**
 * Checks if a message contains a command (starts with /) in either text or caption
 * 
 * @param ctx - Bot context containing the message
 * @returns True if the message contains a command
 */
export function isCommand(ctx: BotContext): boolean {
    const messageText = getMessageText(ctx);
    return messageText.startsWith('/');
}

/**
 * Extracts the command from a message (first word starting with /)
 * 
 * @param ctx - Bot context containing the message
 * @returns The command string (e.g., "/support") or empty string if no command
 */
export function getCommand(ctx: BotContext): string {
    const messageText = getMessageText(ctx);
    if (!messageText.startsWith('/')) {
        return '';
    }
    
    return messageText.split(' ')[0] || '';
}

/**
 * Gets the arguments part of a command (everything after the command)
 * 
 * @param ctx - Bot context containing the message
 * @returns The arguments string or empty string if no arguments
 */
export function getCommandArgs(ctx: BotContext): string {
    const messageText = getMessageText(ctx);
    if (!messageText.startsWith('/')) {
        return '';
    }
    
    const parts = messageText.split(' ');
    return parts.slice(1).join(' ');
}

/**
 * Checks if the message has any text content (either text or caption)
 * 
 * @param ctx - Bot context containing the message
 * @returns True if the message has text content
 */
export function hasTextContent(ctx: BotContext): boolean {
    return getMessageText(ctx).length > 0;
}

/**
 * Gets message type information for debugging
 * 
 * @param ctx - Bot context containing the message
 * @returns Object with message type details
 */
export function getMessageTypeInfo(ctx: BotContext) {
    if (!ctx.message) {
        return { type: 'none', hasText: false, hasCaption: false, isCommand: false };
    }

    const hasText = 'text' in ctx.message && !!ctx.message.text;
    const hasCaption = 'caption' in ctx.message && !!ctx.message.caption;
    const hasPhoto = 'photo' in ctx.message && !!ctx.message.photo;
    const hasDocument = 'document' in ctx.message && !!ctx.message.document;
    const messageText = getMessageText(ctx);
    const isCmd = messageText.startsWith('/');

    let type = 'unknown';
    if (hasPhoto) {type = 'photo';}
    else if (hasDocument) {type = 'document';}
    else if (hasText) {type = 'text';}

    return {
        type,
        hasText,
        hasCaption,
        hasPhoto,
        hasDocument,
        isCommand: isCmd,
        command: isCmd ? getCommand(ctx) : undefined,
        textContent: messageText.substring(0, 50),
        textSource: hasText ? 'text' : (hasCaption ? 'caption' : 'none')
    };
}
