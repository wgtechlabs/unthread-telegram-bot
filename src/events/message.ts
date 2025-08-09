/**
 * Message Event Handlers - Routes Telegram messages based on chat type
 * 
 * Key Features:
 * - Private chat support form collection
 * - Group chat automatic ticket creation  
 * - Message routing to Unthread API
 * - Media group batch processing with proper notifications
 * - Unified attachment handling for single and multiple files
 * 
 * @author Waren Gonzaga, WG Technology Labs

 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import { processConversation } from '../commands/index.js';
import * as unthreadService from '../services/unthread.js';
import { safeEditMessageText, safeReply } from '../bot.js';
import { BotsStore } from '../sdk/bots-brain/BotsStore.js';
import { attachmentHandler } from '../utils/attachmentHandler.js';
import { getCommand, getMessageText, getMessageTypeInfo, isCommand } from '../utils/messageContentExtractor.js';
import { generateStatusMessage } from '../utils/messageAnalyzer.js';
import type { BotContext } from '../types/index.js';

/**
 * Media group item interface for batch processing
 */
interface MediaGroupItem {
    fileId: string;
    messageId: number;
    caption?: string;
    timestamp: number;
    userId: number;
    chatId: number;
    replyToMessageId?: number;
}

/**
 * Media group collection for batch processing
 */
interface MediaGroupCollection {
    groupId: string;
    items: MediaGroupItem[];
    firstMessageTimestamp: number;
    timeoutId: NodeJS.Timeout;
    isReply: boolean;
    replyToMessageId?: number;
    userId: number;
    chatId: number;
    ctx?: BotContext;
}

/**
 * Ticket information interface
 */
interface TicketInfo {
    ticketId: string;
    friendlyId: string;
    conversationId?: string;
}

/**
 * Agent message information interface
 */
interface AgentMessageInfo {
    conversationId: string;
    friendlyId: string;
}

/**
 * Status message interface for Telegram responses
 */
interface StatusMessage {
    message_id: number;
}

/**
 * Global media group collector
 * Stores media groups temporarily for batch processing
 */
const mediaGroupCollector = new Map<string, MediaGroupCollection>();

/**
 * Configuration for media group handling
 */
const MEDIA_GROUP_CONFIG = {
    collectionTimeoutMs: 2000, // 2 seconds to collect all items in group
    maxItemsPerGroup: 10,       // Maximum items per media group
    cleanupIntervalMs: 60000    // Clean up old entries every minute
};

/**
 * Extract media group ID from Telegram message
 */
function getMediaGroupId(ctx: BotContext): string | undefined {
    if (!ctx.message) {
        return undefined;
    }
    
    // Check if message has media_group_id
    if ('media_group_id' in ctx.message && ctx.message.media_group_id) {
        return ctx.message.media_group_id;
    }
    
    return undefined;
}

/**
 * Process media group item and either add to collection or process immediately
 */
async function handleMediaGroupMessage(ctx: BotContext): Promise<boolean> {
    const mediaGroupId = getMediaGroupId(ctx);
    
    // If no media group ID, process as individual file
    if (!mediaGroupId) {
        return false; // Let normal processing handle it
    }
    
    if (!ctx.message || !ctx.from || !ctx.chat) {
        return false;
    }
    
    const fileIds = extractFileAttachments(ctx);
    if (fileIds.length === 0 || !fileIds[0]) {
        return false; // No attachments to process
    }
    
    LogEngine.debug('📎 Media group message detected', {
        mediaGroupId,
        fileCount: fileIds.length,
        messageId: ctx.message.message_id,
        userId: ctx.from.id,
        chatId: ctx.chat.id,
        isReply: 'reply_to_message' in ctx.message && !!ctx.message.reply_to_message,
        replyToMessageId: 'reply_to_message' in ctx.message && ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined
    });
    
    // Create media group item
    const replyToId = 'reply_to_message' in ctx.message && ctx.message.reply_to_message 
        ? ctx.message.reply_to_message.message_id 
        : undefined;
        
    const item: MediaGroupItem = {
        fileId: fileIds[0], // Safe: validated above that array has valid first element
        messageId: ctx.message.message_id,
        caption: getMessageText(ctx),
        timestamp: Date.now(),
        userId: ctx.from.id,
        chatId: ctx.chat.id,
        ...(replyToId !== undefined && { replyToMessageId: replyToId })
    };
    
    // Check if collection already exists for this group
    const collection = mediaGroupCollector.get(mediaGroupId);
    
    if (!collection) {
        // Create new collection
        const newCollection: MediaGroupCollection = {
            groupId: mediaGroupId,
            items: [item],
            firstMessageTimestamp: item.timestamp,
            timeoutId: setTimeout(() => processMediaGroupCollection(mediaGroupId), MEDIA_GROUP_CONFIG.collectionTimeoutMs),
            isReply: !!item.replyToMessageId,
            userId: item.userId,
            chatId: item.chatId,
            ctx: ctx, // Store context for notifications
            ...(item.replyToMessageId !== undefined && { replyToMessageId: item.replyToMessageId })
        };
        
        mediaGroupCollector.set(mediaGroupId, newCollection);
        
        LogEngine.debug('📦 Created new media group collection', {
            mediaGroupId,
            timeoutMs: MEDIA_GROUP_CONFIG.collectionTimeoutMs,
            isReply: newCollection.isReply,
            replyToMessageId: newCollection.replyToMessageId
        });
    } else {
        // Add to existing collection
        collection.items.push(item);
        
        // Update reply information if this item has reply info and collection doesn't
        if (item.replyToMessageId && !collection.replyToMessageId) {
            collection.isReply = true;
            collection.replyToMessageId = item.replyToMessageId;
            LogEngine.debug('📝 Updated media group collection with reply information', {
                mediaGroupId,
                replyToMessageId: item.replyToMessageId,
                fromMessageId: item.messageId
            });
        }
        
        LogEngine.debug('➕ Added item to existing media group collection', {
            mediaGroupId,
            currentItemCount: collection.items.length,
            maxItems: MEDIA_GROUP_CONFIG.maxItemsPerGroup,
            isReply: collection.isReply,
            replyToMessageId: collection.replyToMessageId
        });
        
        // If we've reached max items, process immediately
        if (collection.items.length >= MEDIA_GROUP_CONFIG.maxItemsPerGroup) {
            clearTimeout(collection.timeoutId);
            await processMediaGroupCollection(mediaGroupId);
        }
    }
    
    return true; // Handled by media group processor
}

/**
 * Process collected media group items as a batch
 */
async function processMediaGroupCollection(mediaGroupId: string): Promise<void> {
    const collection = mediaGroupCollector.get(mediaGroupId);
    if (!collection) {
        LogEngine.warn('⚠️ Media group collection not found for processing', { mediaGroupId });
        return;
    }
    
    // Clean up the collection
    mediaGroupCollector.delete(mediaGroupId);
    clearTimeout(collection.timeoutId);
    
    LogEngine.debug('🔄 Processing media group collection as batch', {
        mediaGroupId,
        itemCount: collection.items.length,
        isReply: collection.isReply,
        replyToMessageId: collection.replyToMessageId,
        collectionTimeMs: Date.now() - collection.firstMessageTimestamp
    });
    
    try {
        // Combine all file IDs from the collection
        const allFileIds = collection.items.map(item => item.fileId);
        
        // Combine all captions with line breaks
        const combinedMessage = collection.items
            .map(item => item.caption)
            .filter(caption => caption && caption.trim())
            .join('\n\n') || 'Media group attachments';
        
        if (collection.isReply && collection.replyToMessageId) {
            // First check if this is a reply during active support conversation (ticket creation)
            LogEngine.info('🔍 Checking if reply is during active support conversation', {
                mediaGroupId,
                replyToMessageId: collection.replyToMessageId,
                userId: collection.userId
            });
            
            // Check user state for active support conversation
            const userState = await BotsStore.getUserState(collection.userId);
            
            LogEngine.info('🔍 Media group user state check results', {
                mediaGroupId,
                replyToMessageId: collection.replyToMessageId,
                userId: collection.userId,
                hasUserState: !!userState,
                userStateField: userState?.field || 'none',
                userStateProcessor: userState?.processor || 'none',
                userStateStep: userState?.step || 'none',
                isExpectedSummaryState: !!(userState && userState.field === 'summary' && userState.processor === 'support')
            });
            
            if (userState && userState.field === 'summary' && userState.processor === 'support') {
                // User is in active support conversation - this is a reply to summary request, not ticket confirmation
                LogEngine.info('🎯 Media group is reply during ticket creation - processing as summary input', {
                    mediaGroupId,
                    replyToMessageId: collection.replyToMessageId,
                    userStateField: userState.field,
                    userStateProcessor: userState.processor
                });
                
                // Process as ticket creation, not ticket reply
                await processMediaGroupTicketCreation(collection, allFileIds, combinedMessage);
                return;
            } else {
                LogEngine.warn('❌ Media group user state does not match expected summary state', {
                    mediaGroupId,
                    replyToMessageId: collection.replyToMessageId,
                    userId: collection.userId,
                    userStateField: userState?.field || 'none',
                    userStateProcessor: userState?.processor || 'none',
                    expectedField: 'summary',
                    expectedProcessor: 'support',
                    reason: 'proceeding_with_ticket_agent_lookup'
                });
            }
            
            // Handle as reply to existing ticket/agent message
            LogEngine.info('🎯 Media group identified as reply to existing ticket/agent', {
                mediaGroupId,
                replyToMessageId: collection.replyToMessageId,
                itemCount: collection.items.length
            });
            await handleMediaGroupReply(collection, allFileIds, combinedMessage);
        } else {
            // Handle as regular group message (if needed in future)
            LogEngine.warn('📋 Media group in non-reply context - no action taken', {
                mediaGroupId,
                itemCount: collection.items.length,
                isReply: collection.isReply,
                replyToMessageId: collection.replyToMessageId,
                itemsWithReply: collection.items.filter(item => item.replyToMessageId).length,
                firstItemReplyId: collection.items[0]?.replyToMessageId,
                allItemReplyIds: collection.items.map(item => item.replyToMessageId)
            });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        LogEngine.error('❌ Error processing media group collection', {
            mediaGroupId,
            error: errorMessage,
            itemCount: collection.items.length
        });
        
        // Handle specific error types with user feedback
        if (errorMessage === 'UNSUPPORTED_FILE_TYPES_MEDIA_GROUP') {
            LogEngine.info('🚫 Providing user feedback for unsupported media group file types', {
                mediaGroupId,
                chatId: collection.chatId,
                userId: collection.userId
            });
            
            // Provide user-friendly feedback about unsupported file types
            if (collection.ctx && collection.chatId) {
                try {
                    const messageOptions: Record<string, unknown> = { 
                        parse_mode: 'Markdown' as const
                    };
                    
                    // Add reply parameters if we have a message to reply to
                    if (collection.replyToMessageId) {
                        messageOptions.reply_parameters = {
                            message_id: collection.replyToMessageId
                        };
                    }
                    
                    await collection.ctx.telegram.sendMessage(
                        collection.chatId,
                        '🚫 **Files Not Supported**\n\n' +
                        'Some files in your media group are not supported. ' +
                        'Only image files are currently supported:\n' +
                        '• JPEG (.jpg, .jpeg)\n' +
                        '• PNG (.png)\n' +
                        '• GIF (.gif)\n' +
                        '• WebP (.webp)\n\n' +
                        'Please send your message again with supported image files only.',
                        messageOptions
                    );
                } catch (notifyError) {
                    LogEngine.error('Failed to send unsupported file type notification', {
                        mediaGroupId,
                        chatId: collection.chatId,
                        notifyError: notifyError instanceof Error ? notifyError.message : String(notifyError)
                    });
                }
            }
        }
    }
}

/**
 * Handle media group as reply to ticket/agent message
 */
async function handleMediaGroupReply(collection: MediaGroupCollection, fileIds: string[], message: string): Promise<void> {
    // Check if this is a reply to an existing ticket/agent message
    if (collection.replyToMessageId) {
        LogEngine.info('🎯 Processing media group as ticket/agent reply', {
            mediaGroupId: collection.groupId,
            replyToMessageId: collection.replyToMessageId,
            fileCount: fileIds.length,
            userId: collection.userId
        });
        
        // Check if this is a reply to a ticket confirmation
        LogEngine.info('🔍 Looking up ticket for reply', {
            mediaGroupId: collection.groupId,
            replyToMessageId: collection.replyToMessageId,
            fileCount: fileIds.length
        });
        
        const ticketInfo = await unthreadService.getTicketFromReply(collection.replyToMessageId);
        if (ticketInfo) {
            LogEngine.info('📋 Media group reply to ticket confirmation', {
                ticketId: ticketInfo.ticketId,
                friendlyId: ticketInfo.friendlyId,
                mediaGroupId: collection.groupId,
                fileCount: fileIds.length
            });
            
            await processMediaGroupTicketReply(collection, ticketInfo, fileIds, message);
            return;
        } else {
            LogEngine.warn('❌ No ticket found for media group reply', {
                mediaGroupId: collection.groupId,
                replyToMessageId: collection.replyToMessageId,
                fileCount: fileIds.length,
                message: 'Media group reply to unknown message - not a registered ticket confirmation'
            });
        }
        
        // Check if this is a reply to an agent message
        LogEngine.info('🔍 Looking up agent message for reply', {
            mediaGroupId: collection.groupId,
            replyToMessageId: collection.replyToMessageId,
            fileCount: fileIds.length
        });
        
        const agentMessageInfo = await unthreadService.getAgentMessageFromReply(collection.replyToMessageId);
        if (agentMessageInfo) {
            LogEngine.info('💬 Media group reply to agent message', {
                conversationId: agentMessageInfo.conversationId,
                friendlyId: agentMessageInfo.friendlyId,
                mediaGroupId: collection.groupId,
                fileCount: fileIds.length
            });
            
            await processMediaGroupAgentReply(collection, agentMessageInfo, fileIds, message);
            return;
        } else {
            LogEngine.warn('❌ No agent message found for media group reply', {
                mediaGroupId: collection.groupId,
                replyToMessageId: collection.replyToMessageId,
                fileCount: fileIds.length,
                message: 'Media group reply to unknown message - not a registered agent message'
            });
        }
        
        LogEngine.debug('ℹ️ Media group reply not related to ticket/agent message', {
            mediaGroupId: collection.groupId,
            replyToMessageId: collection.replyToMessageId
        });
        return;
    }
    
    // Check if this is initial ticket creation with attachments
    LogEngine.info('🎫 Processing media group for potential initial ticket creation', {
        mediaGroupId: collection.groupId,
        fileCount: fileIds.length,
        userId: collection.userId,
        hasReplyTo: !!collection.replyToMessageId
    });
    
    // Store the media group files for the support conversation processor to use
    await processMediaGroupTicketCreation(collection, fileIds, message);
}

/**
 * Process media group for initial ticket creation (not a reply)
 * This triggers the proper confirmation flow when media groups are used with captions
 */
async function processMediaGroupTicketCreation(collection: MediaGroupCollection, fileIds: string[], message: string): Promise<void> {
    try {
        LogEngine.info('🎫 Processing media group for initial ticket creation', {
            mediaGroupId: collection.groupId,
            fileCount: fileIds.length,
            userId: collection.userId,
            messageText: message?.substring(0, 100) || '[no text]'
        });
        
        // Import SupportConversationProcessor dependency
        const { SupportConversationProcessor } = await import('../commands/processors/ConversationProcessors.js');
        
        // Check if user has an active support conversation state
        const userState = await BotsStore.getUserState(collection.userId);
        if (userState && userState.field === 'summary' && userState.processor === 'support') {
            // User is actively in support flow - process media group as summary + attachments
            LogEngine.info('🎯 Media group with caption triggers confirmation flow', {
                userId: collection.userId,
                fileCount: fileIds.length,
                messageLength: message.length,
                userStateField: userState.field,
                currentProcessor: userState.processor
            });
            
            // Ensure we have a meaningful summary from the media group caption
            const summaryText = message && message.trim() ? message.trim() : 'Media group attachments';
            
            if (!collection.ctx) {
                LogEngine.error('❌ No context available for media group summary processing', {
                    mediaGroupId: collection.groupId,
                    userId: collection.userId
                });
                return;
            }
            
            // Create instance of SupportConversationProcessor and trigger summary handling
            const supportProcessor = new SupportConversationProcessor();
            
            // Call handleSummaryInput with the media group caption as summary and pre-detected attachments
            await supportProcessor.handleSummaryInput(
                collection.ctx, 
                summaryText, 
                userState, 
                fileIds  // Pre-detected attachments from media group
            );
            
            LogEngine.info('✅ Media group processed through confirmation flow', {
                mediaGroupId: collection.groupId,
                userId: collection.userId,
                summaryText: summaryText.substring(0, 100),
                attachmentCount: fileIds.length,
                triggeredConfirmationFlow: true
            });
            
        } else {
            // No active support conversation - store files and prompt user to continue
            LogEngine.info('📂 No active support conversation, storing media group for later use', {
                userId: collection.userId,
                fileCount: fileIds.length,
                userStateField: userState?.field || 'none',
                userStateProcessor: userState?.processor || 'none'
            });
            
            if (userState) {
                userState.attachmentIds = fileIds;
                userState.hasAttachments = fileIds.length > 0;
                userState.mediaGroupMessage = message;
                
                LogEngine.info('📂 Stored media group files for future ticket creation', {
                    userId: collection.userId,
                    fileCount: fileIds.length,
                    conversationField: userState.field,
                    processor: userState.processor
                });
            }
            
            // Send status notification if we have context
            if (collection.ctx?.telegram && collection.ctx.chat) {
                const statusMsg = await collection.ctx.reply(
                    `📎 ${fileIds.length} files received! Use \`/support\` to create a ticket with these attachments.`,
                    { 
                        parse_mode: 'Markdown',
                        reply_parameters: { message_id: collection.ctx.message?.message_id || 0 } 
                    }
                ).catch(() => null);
                
                // Auto-delete after 10 seconds
                if (statusMsg) {
                    setTimeout(() => {
                        if (collection.ctx?.chat) {
                            collection.ctx.telegram.deleteMessage(collection.ctx.chat.id, statusMsg.message_id).catch(() => {});
                        }
                    }, 10000);
                }
            }
        }
        
    } catch (error) {
        LogEngine.error('❌ Error processing media group for ticket creation', {
            mediaGroupId: collection.groupId,
            userId: collection.userId,
            error: error instanceof Error ? error.message : String(error),
            fileCount: fileIds.length
        });
        
        // Send error notification if we have context
        if (collection.ctx?.telegram && collection.ctx.chat) {
            await collection.ctx.reply(
                `❌ Error processing ${fileIds.length} files. Please try again or create ticket without attachments.`
            ).catch(() => {});
        }
    }
}

/**
 * Process media group reply to ticket confirmation with status notifications
 */
async function processMediaGroupTicketReply(collection: MediaGroupCollection, ticketInfo: TicketInfo, fileIds: string[], message: string): Promise<void> {
    let statusMsg: StatusMessage | null = null;
    const ctx = collection.ctx;
    
    try {
        // Send initial status notification if context is available
        if (ctx?.telegram && ctx.chat) {
            // Get the first message in the collection for reply context
            const firstItem = collection.items[0];
            if (firstItem) {
                const statusMessage = generateStatusMessage(ctx, 'ticket-reply', fileIds.length);
                statusMsg = await safeReply(ctx, statusMessage, {
                    reply_parameters: { message_id: firstItem.messageId }
                });
                
                LogEngine.info('📱 Media group ticket reply status notification sent', {
                    mediaGroupId: collection.groupId,
                    statusMessageId: statusMsg?.message_id,
                    fileCount: fileIds.length,
                    ticketId: ticketInfo.ticketId,
                    chatId: ctx.chat.id
                });
            }
        }
        
        // Get user information
        const userData = await unthreadService.getOrCreateUser(
            collection.userId, 
            undefined, // username not available in collection
            undefined, // firstName not available
            undefined  // lastName not available
        );
        
        LogEngine.info('🔄 Processing media group attachments for ticket reply', {
            ticketId: ticketInfo.ticketId,
            friendlyId: ticketInfo.friendlyId,
            mediaGroupId: collection.groupId,
            fileCount: fileIds.length,
            messageLength: message.length
        });
        
        // Process all attachments as a batch
        const attachmentSuccess = await attachmentHandler.processAttachments(
            fileIds,
            ticketInfo.conversationId || ticketInfo.ticketId,
            message || 'Media group attachments via Telegram',
            {
                name: userData.name,
                email: userData.email
            }
        );
        
        if (!attachmentSuccess) {
            // Log the attachment failure and throw special error for unsupported files
            LogEngine.warn('Media group attachment processing failed for ticket reply', {
                mediaGroupId: collection.groupId,
                ticketId: ticketInfo.ticketId,
                fileCount: fileIds.length,
                reason: 'unsupported_file_types_or_processing_error'
            });
            
            throw new Error('UNSUPPORTED_FILE_TYPES_MEDIA_GROUP');
        }
        
        // Update status message to success
        if (statusMsg && ctx && ctx.telegram && ctx.chat) {
            await safeEditMessageText(
                ctx,
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `✅ ${fileIds.length} files uploaded and added to ticket!`
            );
            
            // Delete status message after 3 seconds
            setTimeout(() => {
                if (ctx.chat && statusMsg) {
                    ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                }
            }, 3000);
            
            LogEngine.info('📱 Media group ticket reply success notification updated', {
                mediaGroupId: collection.groupId,
                statusMessageId: statusMsg.message_id,
                fileCount: fileIds.length,
                ticketId: ticketInfo.ticketId
            });
        }
        
        LogEngine.info('✅ Media group attachments processed successfully for ticket', {
            ticketId: ticketInfo.ticketId,
            friendlyId: ticketInfo.friendlyId,
            mediaGroupId: collection.groupId,
            fileCount: fileIds.length,
            processingMethod: 'media_group_batch'
        });
        
    } catch (error) {
        // Update status message to error
        if (statusMsg && ctx && ctx.telegram && ctx.chat) {
            await safeEditMessageText(
                ctx,
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `❌ Error uploading ${fileIds.length} files to ticket!`
            ).catch(() => {}); // Ignore errors in error handling
            
            // Delete error message after 5 seconds
            setTimeout(() => {
                if (ctx.chat && statusMsg) {
                    ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                }
            }, 5000);
        }
        
        LogEngine.error('❌ Error processing media group ticket reply', {
            ticketId: ticketInfo.ticketId,
            mediaGroupId: collection.groupId,
            error: error instanceof Error ? error.message : String(error),
            fileCount: fileIds.length,
            hasStatusMessage: !!statusMsg
        });
        
        throw error; // Re-throw to handle upstream
    }
}

/**
 * Process media group reply to agent message with status notifications
 */
async function processMediaGroupAgentReply(collection: MediaGroupCollection, agentMessageInfo: AgentMessageInfo, fileIds: string[], message: string): Promise<void> {
    let statusMsg: StatusMessage | null = null;
    const ctx = collection.ctx;
    
    try {
        // Send initial status notification if context is available
        if (ctx && ctx.telegram && ctx.chat) {
            // Get the first message in the collection for reply context
            const firstItem = collection.items[0];
            if (firstItem) {
                const statusMessage = generateStatusMessage(ctx, 'agent-reply', fileIds.length);
                statusMsg = await safeReply(ctx, statusMessage, {
                    reply_parameters: { message_id: firstItem.messageId }
                });
                
                LogEngine.info('📱 Media group status notification sent', {
                    mediaGroupId: collection.groupId,
                    statusMessageId: statusMsg?.message_id,
                    fileCount: fileIds.length,
                    chatId: ctx.chat.id
                });
            }
        }
        
        // Get user information
        const userData = await unthreadService.getOrCreateUser(
            collection.userId,
            undefined, // username not available in collection
            undefined, // firstName not available
            undefined  // lastName not available
        );
        
        LogEngine.info('🔄 Processing media group attachments for agent reply', {
            conversationId: agentMessageInfo.conversationId,
            friendlyId: agentMessageInfo.friendlyId,
            mediaGroupId: collection.groupId,
            fileCount: fileIds.length,
            messageLength: message.length
        });
        
        // Process all attachments as a batch
        const attachmentSuccess = await attachmentHandler.processAttachments(
            fileIds,
            agentMessageInfo.conversationId,
            message || 'Media group attachments via Telegram',
            {
                name: userData.name,
                email: userData.email
            }
        );
        
        if (!attachmentSuccess) {
            throw new Error('Failed to process media group attachments');
        }
        
        // Update status message to success
        if (statusMsg && ctx && ctx.telegram && ctx.chat) {
            await safeEditMessageText(
                ctx,
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `✅ ${fileIds.length} files uploaded and sent!`
            );
            
            // Delete status message after 3 seconds
            setTimeout(() => {
                if (ctx.chat && statusMsg) {
                    ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                }
            }, 3000);
            
            LogEngine.info('📱 Media group success notification updated', {
                mediaGroupId: collection.groupId,
                statusMessageId: statusMsg.message_id,
                fileCount: fileIds.length
            });
        }
        
        LogEngine.info('✅ Media group attachments processed successfully for agent reply', {
            conversationId: agentMessageInfo.conversationId,
            friendlyId: agentMessageInfo.friendlyId,
            mediaGroupId: collection.groupId,
            fileCount: fileIds.length,
            processingMethod: 'media_group_batch'
        });
        
    } catch (error) {
        // Update status message to error
        if (statusMsg && ctx && ctx.telegram && ctx.chat) {
            await safeEditMessageText(
                ctx,
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `❌ Error uploading ${fileIds.length} files!`
            ).catch(() => {}); // Ignore errors in error handling
            
            // Delete error message after 5 seconds
            setTimeout(() => {
                if (ctx.chat && statusMsg) {
                    ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                }
            }, 5000);
        }
        
        LogEngine.error('❌ Error processing media group agent reply', {
            conversationId: agentMessageInfo.conversationId,
            mediaGroupId: collection.groupId,
            error: error instanceof Error ? error.message : String(error),
            fileCount: fileIds.length,
            hasStatusMessage: !!statusMsg
        });
        
        throw error; // Re-throw to handle upstream
    }
}

/**
 * Cleanup old media group collections
 */
function cleanupOldMediaGroups(): void {
    const now = Date.now();
    const cutoff = now - MEDIA_GROUP_CONFIG.cleanupIntervalMs;
    
    for (const [groupId, collection] of mediaGroupCollector.entries()) {
        if (collection.firstMessageTimestamp < cutoff) {
            LogEngine.debug('🧹 Cleaning up old media group collection', {
                mediaGroupId: groupId,
                age: now - collection.firstMessageTimestamp
            });
            
            clearTimeout(collection.timeoutId);
            mediaGroupCollector.delete(groupId);
        }
    }
}

// Store the cleanup interval ID for proper cleanup during shutdown
let mediaGroupCleanupInterval: NodeJS.Timeout | null = null;

// Set up periodic cleanup
mediaGroupCleanupInterval = setInterval(cleanupOldMediaGroups, MEDIA_GROUP_CONFIG.cleanupIntervalMs);

/**
 * Cleanup function to clear the media group cleanup interval.
 * Should be called during application shutdown to prevent memory leaks.
 */
export function cleanupMessageEventHandlers(): void {
    if (mediaGroupCleanupInterval) {
        clearInterval(mediaGroupCleanupInterval);
        mediaGroupCleanupInterval = null;
        LogEngine.info('Media group cleanup interval cleared');
    }
}

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
        
        // Check for media group messages and handle them specially
        if (hasAttachments) {
            const handledAsMediaGroup = await handleMediaGroupMessage(ctx);
            if (handledAsMediaGroup) {
                LogEngine.info('✅ Message handled by media group processor - stopping further processing', {
                    mediaGroupId: getMediaGroupId(ctx),
                    attachmentCount: attachmentFileIds.length
                });
                return; // Don't call next() - media group processor handles everything
            }
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
        
        // Check if this is a reply to a ticket confirmation - Support attachment-only replies
        if ('reply_to_message' in ctx.message && ctx.message.reply_to_message) {
            LogEngine.info('Reply message detected - checking for ticket/agent context', {
                replyToMessageId: ctx.message.reply_to_message.message_id,
                hasText: !!getMessageText(ctx),
                hasAttachments: extractFileAttachments(ctx).length > 0,
                attachmentCount: extractFileAttachments(ctx).length,
                chatId: ctx.chat?.id,
                userId: ctx.from?.id
            });
            
            const handled = await handleTicketReply(ctx);
            if (handled) {
                // Skip other handlers if this was a ticket reply
                LogEngine.info('✅ Message processed as ticket/agent reply successfully', {
                    replyToMessageId: ctx.message.reply_to_message.message_id,
                    hasAttachments: extractFileAttachments(ctx).length > 0
                });
                return;  // Don't call next() for ticket replies, we're done
            } else {
                LogEngine.debug('Reply not handled as ticket/agent reply - continuing with normal processing', {
                    replyToMessageId: ctx.message.reply_to_message.message_id
                });
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
async function handleTicketConfirmationReply(ctx: BotContext, ticketInfo: TicketInfo): Promise<boolean> {
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
        
        // Send a minimal status message with smart content detection
        const statusMessage = generateStatusMessage(ctx, 'ticket-reply');
        const statusMsg = await safeReply(ctx, statusMessage, {
            reply_parameters: { message_id: ctx.message?.message_id || 0 }
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
            
            // Check if this is an unsupported file type error
            if (err.message === 'UNSUPPORTED_FILE_TYPES') {
                LogEngine.warn('Ticket reply failed due to unsupported file types', {
                    conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
                    telegramUserId,
                    hasAttachments,
                    attachmentCount: attachmentFileIds.length
                });
                
                // Show user-friendly error message for unsupported files
                if (ctx.chat && statusMsg) {
                    await safeEditMessageText(
                        ctx,
                        ctx.chat.id,
                        statusMsg.message_id,
                        undefined,
                        '🚫 **File Not Supported**\n\n' +
                        'Only image files are currently supported:\n' +
                        '• JPEG (.jpg, .jpeg)\n' +
                        '• PNG (.png)\n' +
                        '• GIF (.gif)\n' +
                        '• WebP (.webp)\n\n' +
                        'Please send your message again with supported image files only.',
                        { parse_mode: 'Markdown' }
                    );
                    
                    // Delete error message after 10 seconds (longer for user to read)
                    setTimeout(() => {
                        if (ctx.chat && statusMsg) {
                            ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                        }
                    }, 10000);
                }
                
                return true; // Message handled (with error), don't process further
            }
            
            // Handle other API errors
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
 * Updated to support attachment-only messages without requiring text content.
 *
 * @returns An object indicating whether the reply is valid. If valid, includes the sender's Telegram user ID, username, first name, last name, and message text.
 */
async function validateTicketReply(ctx: BotContext, ticketInfo: TicketInfo): Promise<{ isValid: false } | { isValid: true; telegramUserId: number; username: string | undefined; firstName: string | undefined; lastName: string | undefined; message: string }> {
    // Only require basic message and sender info - allow attachment-only messages
    if (!ctx.from || !ctx.message) {
        LogEngine.warn('❌ Ticket reply validation failed - missing basic context', {
            hasFrom: !!ctx.from,
            hasMessage: !!ctx.message,
            ticketId: ticketInfo?.ticketId,
            friendlyId: ticketInfo?.friendlyId
        });
        return { isValid: false };
    }
    
    const telegramUserId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;
    const lastName = ctx.from.last_name;
    const message = getMessageText(ctx); // This handles both text and caption
    const hasAttachments = extractFileAttachments(ctx).length > 0;
    
    LogEngine.info('✅ Ticket reply validation successful - processing reply', {
        conversationId: ticketInfo.conversationId,
        ticketId: ticketInfo.ticketId,
        friendlyId: ticketInfo.friendlyId,
        telegramUserId,
        username,
        firstName,
        lastName,
        messageLength: message?.length || 0,
        hasText: !!message,
        hasAttachments,
        attachmentCount: extractFileAttachments(ctx).length,
        validationType: 'supports_attachment_only_messages'
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
async function processTicketMessage(ticketInfo: TicketInfo, telegramUserId: number, username: string | undefined, message: string, firstName?: string, lastName?: string, attachmentFileIds?: string[]): Promise<void> {
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
            message || 'Customer reply with attachments via Telegram',
            {
                name: userData.name,
                email: userData.email
            }
        );
        
        if (!attachmentSuccess) {
            // Simple approach: Show error message and don't send text message
            LogEngine.warn('Attachment processing failed - unsupported file types', {
                ticketNumber: ticketInfo.friendlyId,
                conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
                attachmentCount: attachmentFileIds.length,
                reason: 'unsupported_file_types'
            });
            
            throw new Error('UNSUPPORTED_FILE_TYPES'); // Special error code for unsupported files
        }
        
        LogEngine.info('File attachments processed successfully for ticket reply using enhanced processing', {
            ticketNumber: ticketInfo.friendlyId,
            conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
            attachmentCount: attachmentFileIds.length,
            processingMethod: 'pure_buffer'
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
async function updateStatusMessage(ctx: BotContext, statusMsg: StatusMessage, isSuccess: boolean, hasAttachments?: boolean): Promise<void> {
    if (!ctx.chat) {
        LogEngine.error('Chat context is null during status message update');
        return;
    }
    
    if (isSuccess) {
        // Update status message to success
        const successMessage = hasAttachments ? '✅ Files uploaded and added!' : '✅ Added!';
        await safeEditMessageText(
            ctx,
            ctx.chat.id,
            statusMsg.message_id,
            undefined,
            successMessage
        );

        // Delete status message after 3 seconds
        setTimeout(() => {
            if (ctx.chat) {
                ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
            }
        }, 3000);
    } else {
        // Update status message to error
        const errorMessage = hasAttachments ? '❌ Error uploading files!' : '❌ Error!';
        await safeEditMessageText(
            ctx,
            ctx.chat.id,
            statusMsg.message_id,
            undefined,
            errorMessage
        );

        // Delete status message after 5 seconds
        setTimeout(() => {
            if (ctx.chat) {
                ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
            }
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
async function handleAgentMessageReply(ctx: BotContext, agentMessageInfo: AgentMessageInfo): Promise<boolean> {
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
        
        // Send a minimal status message with smart content detection
        const statusMessage = generateStatusMessage(ctx, 'agent-reply');
        const statusMsg = await safeReply(ctx, statusMessage, {
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
                if (!ctx.chat) {
                    LogEngine.error('Chat context is null during email required message update');
                    return true;
                }
                await safeEditMessageText(
                    ctx,
                    ctx.chat.id,
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
                    message || 'Customer reply with attachments via Telegram',
                    {
                        name: userData.name,
                        email: userData.email
                    }
                );
                
                if (!attachmentSuccess) {
                    // Simple approach: Show error message and don't send text message
                    LogEngine.warn('Attachment processing failed - unsupported file types', {
                        conversationId: agentMessageInfo.conversationId,
                        attachmentCount: attachmentFileIds.length,
                        reason: 'unsupported_file_types'
                    });
                    
                    if (!ctx.chat) {
                        LogEngine.error('Chat context is null during attachment error message');
                        return true;
                    }
                    
                    await safeEditMessageText(
                        ctx,
                        ctx.chat.id,
                        statusMsg.message_id,
                        undefined,
                        '🚫 **File Not Supported**\n\n' +
                        'Only image files are currently supported:\n' +
                        '• JPEG (.jpg, .jpeg)\n' +
                        '• PNG (.png)\n' +
                        '• GIF (.gif)\n' +
                        '• WebP (.webp)\n\n' +
                        'Please send your message again with supported image files only.',
                        { parse_mode: 'Markdown' }
                    );
                    
                    // Delete error message after 10 seconds
                    setTimeout(() => {
                        if (ctx.chat && statusMsg) {
                            ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                        }
                    }, 10000);
                    
                    return true; // Message handled (with error), don't send text message
                }
                
                LogEngine.info('File attachments processed successfully for agent reply using enhanced processing', {
                    conversationId: agentMessageInfo.conversationId,
                    attachmentCount: attachmentFileIds.length,
                    processingMethod: 'pure_buffer'
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
            if (!ctx.chat) {
                LogEngine.error('Chat context is null during success message update');
                return true;
            }
            const successMessage = hasAttachments ? '✅ Files uploaded and sent!' : '✅ Sent!';
            await safeEditMessageText(
                ctx,
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                successMessage
            );

            // Delete status message after 3 seconds
            setTimeout(() => {
                if (ctx.chat) {
                    ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                }
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
            if (!ctx.chat) {
                LogEngine.error('Chat context is null during error message update');
                return true;
            }
            const errorMessage = hasAttachments ? '❌ Error uploading files!' : '❌ Error!';
            await safeEditMessageText(
                ctx,
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                errorMessage
            );

            // Delete status message after 5 seconds
            setTimeout(() => {
                if (ctx.chat) {
                    ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
                }
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
