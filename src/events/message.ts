/**
 * Unthread Telegram Bot - Message Event Handlers Module
 * 
 * Handles incoming message events from Telegram and processes them according to
 * chat type and content. This module serves as the main message router for the
 * Unthread Telegram Bot, directing conversations to appropriate handlers.
 * 
 * Message Processing:
 * - Chat type detection (private, group, supergroup, channel)
 * - Pattern matching for specific message content
 * - Support conversation flow management
 * - Automatic ticket creation for group messages
 * - Smart routing based on user intent and context
 * 
 * Supported Chat Types:
 * - Private chats: D                // Process attachments using the buffer-only approach
                const attachmentSuccess = await attachmentHandler.processAttachments(
                    attachmentFileIds,
                    agentMessageInfo.conversationId,
                    message || 'Customer reply with attachments via Telegram'
                );support form collection and ticket creation
 * - Group chats: Automatic ticket creation for all messages
 * - Supergroups: Enhanced group message handling with threading
 * - Channels: Read-only message monitoring (if applicable)
 * 
 * Features:
 * - Context-aware message processing
 * - Automatic support ticket generation
 * - Integration with Unthread API for message routing
 * - State-aware conversation management * - Error handling and user feedback
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import { processConversation, aboutCommand } from '../commands/index.js';
import * as unthreadService from '../services/unthread.js';
import { safeReply, safeEditMessageText } from '../bot.js';
import { BotsStore } from '../sdk/bots-brain/BotsStore.js';
import { attachmentHandler } from '../utils/attachmentHandler.js';
import { getMessageText, isCommand, getCommand, hasTextContent, getMessageTypeInfo } from '../utils/messageContentExtractor.js';
import type { BotContext } from '../types/index.js';

/**
 * Returns true if the message originates from a group or supergroup chat.
 *
 * @returns True if the chat type is 'group' or 'supergroup'; otherwise, false.
 */
export function isGroupChat(ctx: BotContext): boolean {
    return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}

/**
 * Determines whether the current chat is a private chat.
 *
 * @returns True if the chat type is 'private'; otherwise, false.
 */
export function isPrivateChat(ctx: BotContext): boolean {
    return ctx.chat?.type === 'private';
}

/**
 * Detects and extracts file attachments from Telegram messages
 * 
 * @param ctx - Bot context containing the message
 * @returns Array of file IDs that can be processed by AttachmentHandler
 */
export function extractFileAttachments(ctx: BotContext): string[] {
    const fileIds: string[] = [];
    
    if (!ctx.message) {
        return fileIds;
    }
    
    try {
        // Handle different types of file attachments
        
        // Photo attachments (multiple sizes, we want the largest)
        if ('photo' in ctx.message && ctx.message.photo) {
            const largestPhoto = ctx.message.photo[ctx.message.photo.length - 1];
            if (largestPhoto?.file_id) {
                fileIds.push(largestPhoto.file_id);
                LogEngine.debug('Detected photo attachment', {
                    fileId: largestPhoto.file_id,
                    fileSize: largestPhoto.file_size,
                    width: largestPhoto.width,
                    height: largestPhoto.height
                });
            }
        }
        
        // Document attachments (files uploaded as documents)
        if ('document' in ctx.message && ctx.message.document) {
            const document = ctx.message.document;
            if (document.file_id) {
                fileIds.push(document.file_id);
                LogEngine.debug('Detected document attachment', {
                    fileId: document.file_id,
                    fileName: document.file_name,
                    fileSize: document.file_size,
                    mimeType: document.mime_type
                });
            }
        }
        
        // Video attachments
        if ('video' in ctx.message && ctx.message.video) {
            const video = ctx.message.video;
            if (video.file_id) {
                fileIds.push(video.file_id);
                LogEngine.debug('Detected video attachment', {
                    fileId: video.file_id,
                    fileName: video.file_name,
                    fileSize: video.file_size,
                    mimeType: video.mime_type,
                    duration: video.duration
                });
            }
        }
        
        // Voice messages
        if ('voice' in ctx.message && ctx.message.voice) {
            const voice = ctx.message.voice;
            if (voice.file_id) {
                fileIds.push(voice.file_id);
                LogEngine.debug('Detected voice attachment', {
                    fileId: voice.file_id,
                    fileSize: voice.file_size,
                    mimeType: voice.mime_type,
                    duration: voice.duration
                });
            }
        }
        
        // Audio files
        if ('audio' in ctx.message && ctx.message.audio) {
            const audio = ctx.message.audio;
            if (audio.file_id) {
                fileIds.push(audio.file_id);
                LogEngine.debug('Detected audio attachment', {
                    fileId: audio.file_id,
                    fileName: audio.file_name,
                    fileSize: audio.file_size,
                    mimeType: audio.mime_type,
                    duration: audio.duration
                });
            }
        }
        
        // Video notes (circular videos)
        if ('video_note' in ctx.message && ctx.message.video_note) {
            const videoNote = ctx.message.video_note;
            if (videoNote.file_id) {
                fileIds.push(videoNote.file_id);
                LogEngine.debug('Detected video note attachment', {
                    fileId: videoNote.file_id,
                    fileSize: videoNote.file_size,
                    duration: videoNote.duration
                });
            }
        }
        
        // Animation/GIF files
        if ('animation' in ctx.message && ctx.message.animation) {
            const animation = ctx.message.animation;
            if (animation.file_id) {
                fileIds.push(animation.file_id);
                LogEngine.debug('Detected animation attachment', {
                    fileId: animation.file_id,
                    fileName: animation.file_name,
                    fileSize: animation.file_size,
                    mimeType: animation.mime_type
                });
            }
        }
        
        LogEngine.info('File attachment detection completed', {
            totalFiles: fileIds.length,
            fileIds: fileIds
        });
        
    } catch (error) {
        LogEngine.error('Error detecting file attachments', {
            error: error instanceof Error ? error.message : String(error),
            messageType: Object.keys(ctx.message).filter(key => key !== 'message_id' && key !== 'date' && key !== 'chat' && key !== 'from')
        });
    }
    
    return fileIds;
}

/**
 * Handles incoming Telegram messages and routes them to the appropriate processor based on chat type and message context.
 *
 * Determines whether the message should be handled as a command, setup wizard input, conversation flow, ticket reply, private chat, or group chat, and delegates processing accordingly. Prevents automatic responses in group chats and ensures only relevant handlers are invoked for each message type. Continues the middleware chain for private chats not handled by earlier steps.
 */
export async function handleMessage(ctx: BotContext, next: () => Promise<void>): Promise<void> {
    try {
        // Skip if there's no message or chat
        if (!ctx.message || !ctx.chat) {
            return await next();
        }

        // Log basic information about the message - Enhanced with unified text detection
        const messageTypeInfo = getMessageTypeInfo(ctx);
        LogEngine.debug('Processing message with unified text detection', {
            chatType: ctx.chat.type,
            chatId: ctx.chat.id,
            userId: ctx.from?.id,
            messageTypeInfo,
            hasFromUser: !!ctx.from
        });
        
        // Detect file attachments early in the process
        const attachmentFileIds = extractFileAttachments(ctx);
        const hasAttachments = attachmentFileIds.length > 0;
        
        if (hasAttachments) {
            LogEngine.info('Message contains file attachments', {
                chatType: ctx.chat.type,
                chatId: ctx.chat.id,
                userId: ctx.from?.id,
                attachmentCount: attachmentFileIds.length,
                fileIds: attachmentFileIds
            });
        }
        
        // If this is a command, let Telegraf handle it and don't process further
        // Now properly detects commands in both text messages and photo/document captions
        if (isCommand(ctx)) {
            LogEngine.debug('Command detected in message (text or caption), passing to command handlers', {
                command: getCommand(ctx),
                chatType: ctx.chat.type,
                textSource: messageTypeInfo.textSource
            });
            return;  // Don't call next() for commands, let Telegraf handle them
        }
        
        // Check if this is part of any conversation flow (setup, support, templates, etc.)
        const isConversationMessage = await processConversation(ctx);
        
        if (isConversationMessage) {
            // Skip other handlers if this was processed by any conversation processor
            LogEngine.debug('Message processed by conversation processor');
            return;  // Don't call next() for conversation messages, we're done
        }
        
        // Check if this is a reply to a ticket confirmation - Enhanced with unified text detection
        if ('reply_to_message' in ctx.message && ctx.message.reply_to_message && hasTextContent(ctx)) {
            const handled = await handleTicketReply(ctx);
            if (handled) {
                // Skip other handlers if this was a ticket reply
                LogEngine.debug('Message processed as ticket reply');
                return;  // Don't call next() for ticket replies, we're done
            }
        }

        // Handle different chat types - only if not handled by conversation processors
        if (isPrivateChat(ctx)) {
            LogEngine.debug('Processing as private message (no conversation processor handled it)');
            // Only send about message if no conversation processor handled it
            await handlePrivateMessage(ctx);
        } else if (isGroupChat(ctx)) {
            LogEngine.debug('Processing as group message - NO AUTO RESPONSES');
            await handleGroupMessage(ctx);
            // For group chats, DO NOT continue processing to prevent auto-responses
            LogEngine.debug('Stopping processing for group message to prevent auto-responses');
            return;
        }

        // Continue processing with other handlers (only for private chats)
        return await next();
    } catch (error) {
        const err = error as Error;
        LogEngine.error(`Error handling message: ${err.message}`);
        return await next();
    }
}

/**
 * Processes replies to ticket confirmation or agent messages and routes them for handling.
 *
 * Checks if the incoming message is a reply to a ticket confirmation or agent message, and if so, processes the reply accordingly. Returns true if the reply was handled, or false otherwise.
 *
 * @returns True if the reply was processed as a ticket or agent message reply; false otherwise.
 */
async function handleTicketReply(ctx: BotContext): Promise<boolean> {
    try {
        if (!ctx.message || !('reply_to_message' in ctx.message) || !ctx.message.reply_to_message) {
            return false;
        }

        // Get the ID of the message being replied to
        const replyToMessageId = ctx.message.reply_to_message.message_id;
        
        LogEngine.info('Processing potential ticket reply', {
            replyToMessageId,
            messageText: getMessageText(ctx).substring(0, 100),
            chatId: ctx.chat?.id,
            userId: ctx.from?.id
        });
        
        // Check if this is a reply to a ticket confirmation
        const ticketInfo = await unthreadService.getTicketFromReply(replyToMessageId);
        if (ticketInfo) {
            LogEngine.info('Found ticket for reply', {
                ticketId: ticketInfo.ticketId,
                friendlyId: ticketInfo.friendlyId,
                replyToMessageId
            });
            return await handleTicketConfirmationReply(ctx, ticketInfo);
        }
        
        // Check if this is a reply to an agent message
        const agentMessageInfo = await unthreadService.getAgentMessageFromReply(replyToMessageId);
        if (agentMessageInfo) {
            LogEngine.info('Found agent message for reply', {
                conversationId: agentMessageInfo.conversationId,
                friendlyId: agentMessageInfo.friendlyId,
                replyToMessageId
            });
            return await handleAgentMessageReply(ctx, agentMessageInfo);
        }
        
        LogEngine.debug('No ticket or agent message found for reply', {
            replyToMessageId,
            chatId: ctx.chat?.id
        });
        
        return false;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleTicketReply', {
            error: err.message,
            chatId: ctx.chat?.id
        });
        return false;
    }
}

/**
 * Processes a reply to a ticket confirmation message by validating the reply, sending the message to the ticket conversation, and updating the user with a status message.
 *
 * @param ctx - The Telegram bot context for the incoming message
 * @param ticketInfo - Information about the ticket to which the reply is associated
 * @returns True if the reply was processed (successfully or with an error status message), or false if validation failed or an unexpected error occurred
 */
async function handleTicketConfirmationReply(ctx: BotContext, ticketInfo: any): Promise<boolean> {
    try {
        // Validate the reply context and ticket information
        const validation = await validateTicketReply(ctx, ticketInfo);
        if (!validation.isValid) {
            return false;
        }
        
        const { telegramUserId, username, firstName, lastName, message } = validation;
        
        // Detect file attachments in the reply
        const attachmentFileIds = extractFileAttachments(ctx);
        const hasAttachments = attachmentFileIds.length > 0;
        
        LogEngine.info('Processing ticket reply with potential attachments', {
            ticketId: ticketInfo.ticketId,
            hasMessage: !!message,
            hasAttachments,
            attachmentCount: attachmentFileIds.length
        });
        
        // Send a minimal status message
        const statusMsg = await safeReply(ctx, hasAttachments ? '⏳ Processing files and adding to ticket...' : '⏳ Adding to ticket...', {
            reply_parameters: { message_id: ctx.message!.message_id }
        });

        if (!statusMsg) {
            return false;
        }
        
        try {
            // Process and send the ticket message to Unthread (with attachments if present)
            await processTicketMessage(ticketInfo, telegramUserId, username, message, firstName, lastName, attachmentFileIds);
            
            // Update status message to success
            await updateStatusMessage(ctx, statusMsg, true, hasAttachments);
            return true;
            
        } catch (error) {
            const err = error as Error;
            // Handle API errors
            LogEngine.error('Error adding message to ticket', {
                error: err.message,
                stack: err.stack,
                conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
                telegramUserId,
                username,
                hasAttachments,
                attachmentCount: attachmentFileIds.length
            });
            
            // Update status message to error
            await updateStatusMessage(ctx, statusMsg, false, hasAttachments);
            return true;
        }
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleTicketReply', {
            error: err.message,
            stack: err.stack,
            chatId: ctx.chat?.id
        });
        return false;
    }
}

/**
 * Validates that the reply message and sender information are present and extracts user and message details for ticket processing.
 *
 * @returns An object indicating whether the reply is valid. If valid, includes the sender's Telegram user ID, username, first name, last name, and message text.
 */
async function validateTicketReply(ctx: BotContext, ticketInfo: any): Promise<{ isValid: false } | { isValid: true; telegramUserId: number; username: string | undefined; firstName: string | undefined; lastName: string | undefined; message: string }> {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) {
        return { isValid: false };
    }
    
    const telegramUserId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;
    const lastName = ctx.from.last_name;
    const message = getMessageText(ctx);
    
    LogEngine.info('Processing ticket confirmation reply', {
        conversationId: ticketInfo.conversationId,
        ticketId: ticketInfo.ticketId,
        friendlyId: ticketInfo.friendlyId,
        telegramUserId,
        username,
        firstName,
        lastName,
        messageLength: message?.length
    });
    
    return {
        isValid: true,
        telegramUserId,
        username,
        firstName,
        lastName,
        message
    };
}

/**
 * Sends a user's message to the specified ticket conversation in Unthread.
 *
 * Retrieves or creates user data based on the Telegram user ID and username, then sends the provided message to the ticket conversation identified by the ticket information. Supports file attachments.
 */
async function processTicketMessage(ticketInfo: any, telegramUserId: number, username: string | undefined, message: string, firstName?: string, lastName?: string, attachmentFileIds?: string[]): Promise<void> {
    // Get user information from database
    const userData = await unthreadService.getOrCreateUser(telegramUserId, username, firstName, lastName);
    
    LogEngine.info('Retrieved user data for ticket reply', {
        userData: JSON.stringify(userData),
        hasName: !!userData.name,
        hasEmail: !!userData.email,
        hasAttachments: !!(attachmentFileIds && attachmentFileIds.length > 0),
        attachmentCount: attachmentFileIds?.length || 0
    });
    
    // Handle file attachments if present
    if (attachmentFileIds && attachmentFileIds.length > 0) {
        LogEngine.info('Processing file attachments for ticket reply', {
            conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
            attachmentCount: attachmentFileIds.length,
            fileIds: attachmentFileIds
        });
        
        // Process attachments using the buffer-only approach
        const attachmentSuccess = await attachmentHandler.processAttachments(
            attachmentFileIds,
            ticketInfo.conversationId || ticketInfo.ticketId,
            message || 'Customer reply with attachments via Telegram'
        );
        
        if (!attachmentSuccess) {
            throw new Error('Failed to process file attachments using enhanced processing');
        }
        
        LogEngine.info('File attachments processed successfully for ticket reply using enhanced processing', {
            ticketNumber: ticketInfo.friendlyId,
            conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
            attachmentCount: attachmentFileIds.length,
            processingMethod: 'enhanced_buffer_or_stream'
        });
    } else {
        // Send text-only message if no attachments
        await unthreadService.sendMessage({
            conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
            message: message || 'No message content',
            onBehalfOf: userData
        });
        
        LogEngine.info('Added text message to ticket', {
            ticketNumber: ticketInfo.friendlyId,
            conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
            telegramUserId,
            username,
            messageLength: message?.length
        });
    }
}

/**
 * Updates a status message to indicate success or error, then deletes it after a short delay.
 *
 * The message is updated to show a checkmark for success or an error icon for failure, and is automatically removed after 3 seconds (success) or 5 seconds (error).
 */
async function updateStatusMessage(ctx: BotContext, statusMsg: any, isSuccess: boolean, hasAttachments?: boolean): Promise<void> {
    if (isSuccess) {
        // Update status message to success
        const successMessage = hasAttachments ? '✅ Files uploaded and added!' : '✅ Added!';
        await safeEditMessageText(
            ctx,
            ctx.chat!.id,
            statusMsg.message_id,
            undefined,
            successMessage
        );

        // Delete status message after 3 seconds
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
        }, 3000);
    } else {
        // Update status message to error
        const errorMessage = hasAttachments ? '❌ Error uploading files!' : '❌ Error!';
        await safeEditMessageText(
            ctx,
            ctx.chat!.id,
            statusMsg.message_id,
            undefined,
            errorMessage
        );

        // Delete status message after 5 seconds
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
        }, 5000);
    }
}

/**
 * Processes a user's reply to an agent message by forwarding it to the corresponding Unthread conversation.
 *
 * Sends a status message indicating progress, updates it upon success or error, and deletes the status message after a delay. Returns true if the reply was processed, false otherwise.
 *
 * @returns True if the reply was handled (successfully sent or error occurred), false if the context was invalid.
 */
async function handleAgentMessageReply(ctx: BotContext, agentMessageInfo: any): Promise<boolean> {
    try {
        if (!ctx.from || !ctx.message) {
            return false;
        }

        // This is a reply to an agent message, send it back to Unthread
        const telegramUserId = ctx.from.id;
        const username = ctx.from.username;
        const message = getMessageText(ctx);
        
        // Detect file attachments in the reply
        const attachmentFileIds = extractFileAttachments(ctx);
        const hasAttachments = attachmentFileIds.length > 0;
        
        LogEngine.info('Processing agent message reply with potential attachments', {
            conversationId: agentMessageInfo.conversationId,
            hasMessage: !!message,
            hasAttachments,
            attachmentCount: attachmentFileIds.length
        });
        
        // Send a minimal status message
        const statusMsg = await safeReply(ctx, hasAttachments ? '⏳ Processing files and sending...' : '⏳ Sending...', {
            reply_parameters: { message_id: ctx.message.message_id }
        });

        if (!statusMsg) {
            return false;
        }
        
        try {
            // Check if user has a valid email address by getting full user data
            const fullUserData = await BotsStore.getUserByTelegramId(telegramUserId);
            
            // Only require email if user has no unthreadEmail set at all
            if (!fullUserData || !fullUserData.unthreadEmail) {
                LogEngine.info('User has no email - prompting for email before sending reply', {
                    telegramUserId,
                    conversationId: agentMessageInfo.conversationId,
                    friendlyId: agentMessageInfo.friendlyId,
                    hasUserData: !!fullUserData,
                    hasEmail: !!(fullUserData?.unthreadEmail)
                });
                
                // Update status message to prompt for email
                await safeEditMessageText(
                    ctx,
                    ctx.chat!.id,
                    statusMsg.message_id,
                    undefined,
                    '📧 **Email Required**\n\n' +
                    `To continue this conversation for ticket #${agentMessageInfo.friendlyId}, please set your email address:\n\n` +
                    '• Use `/setemail your@email.com`\n' +
                    '• Or reply with your email address\n\n' +
                    '_Your message will be sent after email setup._',
                    { parse_mode: 'Markdown' }
                );
                
                // Store the pending message for delivery after email collection
                const pendingMessageKey = `pending_reply_message:${agentMessageInfo.conversationId}:${Date.now()}`;
                const botsStoreInstance = BotsStore.getInstance();
                await botsStoreInstance.storage.set(pendingMessageKey, {
                    conversationId: agentMessageInfo.conversationId,
                    messageText: message,
                    agentMessageInfo: agentMessageInfo,
                    storedAt: new Date().toISOString(),
                    telegramUserId: telegramUserId,
                    username: username
                }, 24 * 60 * 60); // 24 hour TTL
                
                LogEngine.info('Stored pending reply message for email collection', {
                    conversationId: agentMessageInfo.conversationId,
                    telegramUserId: telegramUserId,
                    pendingMessageKey: pendingMessageKey
                });
                
                return true;
            }
            
            LogEngine.info('User has email - proceeding with reply', {
                telegramUserId,
                hasEmail: !!fullUserData.unthreadEmail,
                conversationId: agentMessageInfo.conversationId
            });
            
            // Get user information for proper onBehalfOf formatting
            const userData = await unthreadService.getOrCreateUser(telegramUserId, username, ctx.from?.first_name, ctx.from?.last_name);
            
            // Handle file attachments if present
            if (hasAttachments) {
                LogEngine.info('Processing file attachments for agent reply', {
                    conversationId: agentMessageInfo.conversationId,
                    attachmentCount: attachmentFileIds.length,
                    fileIds: attachmentFileIds
                });
                
                // Process attachments using the buffer-only approach
                const attachmentSuccess = await attachmentHandler.processAttachments(
                    attachmentFileIds,
                    agentMessageInfo.conversationId,
                    message || 'Customer reply with attachments via Telegram'
                );
                
                if (!attachmentSuccess) {
                    throw new Error('Failed to process file attachments using buffer processing');
                }
                
                LogEngine.info('File attachments processed successfully for agent reply using enhanced processing', {
                    conversationId: agentMessageInfo.conversationId,
                    attachmentCount: attachmentFileIds.length,
                    processingMethod: 'enhanced_buffer_or_stream'
                });
            } else {
                // Send text-only message if no attachments
                await unthreadService.sendMessage({
                    conversationId: agentMessageInfo.conversationId,
                    message: message || 'No message content',
                    onBehalfOf: userData
                });
            }
            
            // Update status message to success
            const successMessage = hasAttachments ? '✅ Files uploaded and sent!' : '✅ Sent!';
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                statusMsg.message_id,
                undefined,
                successMessage
            );

            // Delete status message after 3 seconds
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            }, 3000);

            LogEngine.info('Sent reply to agent', {
                ticketNumber: agentMessageInfo.friendlyId,
                conversationId: agentMessageInfo.conversationId,
                telegramUserId,
                username,
                messageLength: message?.length,
                hasAttachments,
                attachmentCount: attachmentFileIds.length,
                chatId: ctx.chat?.id
            });
            return true;
            
        } catch (error) {
            const err = error as Error;
            // Handle API errors
            LogEngine.error('Error sending reply to agent', {
                error: err.message,
                conversationId: agentMessageInfo.conversationId,
                hasAttachments,
                attachmentCount: attachmentFileIds.length
            });
            
            // Update status message to error
            const errorMessage = hasAttachments ? '❌ Error uploading files!' : '❌ Error!';
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                statusMsg.message_id,
                undefined,
                errorMessage
            );

            // Delete status message after 5 seconds
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            }, 5000);
            
            return true;
        }
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleAgentMessageReply', {
            error: err.message,
            conversationId: agentMessageInfo?.conversationId
        });
        return false;
    }
}

/**
 * Handles incoming messages from private chats, ignoring commands and non-conversation messages.
 *
 * Skips processing for command messages, allowing them to be handled by command-specific handlers. Non-command messages that are not part of an active conversation are ignored without response.
 */
export async function handlePrivateMessage(ctx: BotContext): Promise<void> {
    try {
        // Log information about the private message
        LogEngine.info('Processing private message with enhanced text detection', {
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            firstName: ctx.from?.first_name,
            lastName: ctx.from?.last_name,
            messageId: ctx.message?.message_id,
            messageTypeInfo: getMessageTypeInfo(ctx)
        });
        
        // Only respond to private messages if they're not commands
        // Commands should be handled by their respective handlers
        if (isCommand(ctx)) {
            LogEngine.debug('Skipping private message - it\'s a command', {
                command: getCommand(ctx)
            });
            return;
        }
        
        // Do nothing for non-command private messages
        // If someone sends a message and it's not a command and not handled by conversation processors,
        // we simply ignore it instead of sending the about message
        LogEngine.debug('Private message received but no action taken - not a command and not part of active conversation');
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handlePrivateMessage', {
            error: err.message,
            stack: err.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username
        });
    }
}

/**
 * Processes incoming messages from group chats without sending automatic responses.
 *
 * Logs detailed information about the group, sender, and message content for monitoring and debugging purposes.
 */
export async function handleGroupMessage(ctx: BotContext): Promise<void> {
    try {
        // Log more detailed information about the group message
        const chatTitle = ctx.chat && ('title' in ctx.chat) ? ctx.chat.title : 'Unknown';
        LogEngine.info(`Processing message from group: ${chatTitle} (ID: ${ctx.chat?.id})`);
        
        // Additional information about the sender if available
        if (ctx.from) {
            LogEngine.info(`Message sent by: ${ctx.from.first_name} ${ctx.from.last_name || ''} (ID: ${ctx.from.id})`);
        }
        
        // Log the message content for debugging with enhanced text detection
        const messageTypeInfo = getMessageTypeInfo(ctx);
        LogEngine.debug('Group message details with enhanced text detection', {
            messageId: ctx.message?.message_id,
            messageTypeInfo,
            hasReply: ctx.message && 'reply_to_message' in ctx.message && !!ctx.message.reply_to_message,
            replyToId: ctx.message && 'reply_to_message' in ctx.message ? ctx.message.reply_to_message?.message_id : undefined
        });
        
        LogEngine.debug('Group message processed - no automatic responses sent');
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error(`Error in handleGroupMessage: ${err.message}`);
    }
}
