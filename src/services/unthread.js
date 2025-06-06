/**
 * Unthread API Service
 * 
 * This module provides functionality to interact with the Unthread API
 * for creating customers, tickets, and sending messages.
 */

import fetch from 'node-fetch';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from '../sdk/bots-brain/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Extracts customer company name from group chat title by removing the bot's company name
 * Handles formats like "thirdweb x relay", "thirdweb <> relay", "relay x apple", etc.
 * 
 * @param {string} groupChatTitle - The original group chat title
 * @returns {string} - The extracted customer company name, capitalized
 */
function extractCustomerCompanyName(groupChatTitle) {
    if (!groupChatTitle) {
        return 'Unknown Company';
    }

    const companyName = process.env.COMPANY_NAME || 'Unthread';
    
    // Convert both to lowercase for effective matching
    const lowerTitle = groupChatTitle.toLowerCase().trim();
    const lowerCompanyName = companyName.toLowerCase().trim();
    
    // Regex patterns to match different separators (x, <>, ×, etc.)
    const separatorPatterns = [
        /\s+x\s+/,     // matches " x "
        /\s*<>\s*/,    // matches "<>" with optional spaces
        /\s*×\s*/,     // matches "×" with optional spaces
        /\s+and\s+/,   // matches " and "
        /\s*&\s*/      // matches "&" with optional spaces
    ];
    
    // Try to find a separator and split the title
    for (const pattern of separatorPatterns) {
        if (pattern.test(lowerTitle)) {
            const parts = lowerTitle.split(pattern).map(part => part.trim());
            
            if (parts.length === 2) {
                // Find which part is NOT our company name
                const [part1, part2] = parts;
                
                if (part1 === lowerCompanyName && part2 !== lowerCompanyName) {
                    // Our company is first, customer is second
                    return capitalizeCompanyName(part2);
                } else if (part2 === lowerCompanyName && part1 !== lowerCompanyName) {
                    // Customer is first, our company is second
                    return capitalizeCompanyName(part1);
                }
            }
        }
    }
    
    // Fallback: if no pattern matches, check if the title contains our company name
    // and try to remove it
    if (lowerTitle.includes(lowerCompanyName)) {
        let result = lowerTitle.replace(lowerCompanyName, '').trim();
        // Remove any leading/trailing separators
        result = result.replace(/^[x<>&×\s]+|[x<>&×\s]+$/g, '').trim();
        
        if (result && result !== lowerTitle) {
            return capitalizeCompanyName(result);
        }
    }
    
    // Final fallback: return the original title capitalized
    return capitalizeCompanyName(groupChatTitle);
}

/**
 * Capitalizes company name properly (first letter of each word)
 * 
 * @param {string} name - The company name to capitalize
 * @returns {string} - The capitalized company name
 */
function capitalizeCompanyName(name) {
    if (!name) return 'Unknown-Company';
    
    return name
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('-') // Use hyphen instead of space for API compatibility
        .trim()
        .replace(/[^a-zA-Z0-9-_]/g, '') // Remove invalid characters, keep only letters, numbers, hyphens, underscores
        .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
        .replace(/-{2,}/g, '-'); // Replace multiple consecutive hyphens with single hyphen
}

// API URLs and Auth Keys
const API_BASE_URL = 'https://api.unthread.io/api';
const UNTHREAD_API_KEY = process.env.UNTHREAD_API_KEY;
const CHANNEL_ID = process.env.UNTHREAD_CHANNEL_ID;

// Validate required environment variables
if (!UNTHREAD_API_KEY) {
    LogEngine.error('UNTHREAD_API_KEY environment variable is required but not defined');
    process.exit(1);
}

if (!CHANNEL_ID) {
    LogEngine.error('UNTHREAD_CHANNEL_ID environment variable is required but not defined');
    process.exit(1);
}

// Customer ID cache to avoid creating duplicates
const customerCache = new Map();

/**
 * Creates a new customer in Unthread
 * 
 * @param {string} groupChatName - The name of the Telegram group chat
 * @returns {Promise<object>} - The created customer object with ID
 */
export async function createCustomer(groupChatName) {
    try {
        // Extract the actual customer company name from the group chat title
        const customerName = extractCustomerCompanyName(groupChatName);
        
        const response = await fetch(`${API_BASE_URL}/customers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': UNTHREAD_API_KEY
            },
            body: JSON.stringify({
                name: customerName
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create customer: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        
        // Log the extraction for debugging
        logger.info('Customer created with extracted name', {
            originalGroupChatName: groupChatName,
            extractedCustomerName: customerName,
            customerId: result.id
        });

        return result;
    } catch (error) {
        LogEngine.error('Error creating customer', {
            error: error.message,
            groupChatName
        });
        throw error;
    }
}

/**
 * Creates a new support ticket (conversation) in Unthread
 * 
 * @param {object} params - The ticket parameters
 * @param {string} params.groupChatName - The name of the Telegram group chat
 * @param {string} params.customerId - The Unthread customer ID
 * @param {string} params.summary - The ticket summary/description
 * @param {object} params.onBehalfOf - The user information for onBehalfOf
 * @param {string} params.onBehalfOf.name - The user's name
 * @param {string} params.onBehalfOf.email - The user's email
 * @returns {Promise<object>} - The created ticket object
 */
export async function createTicket({ groupChatName, customerId, summary, onBehalfOf }) {
    try {
        // Extract the customer company name for the ticket title
        const customerCompanyName = extractCustomerCompanyName(groupChatName);
        const title = `[Telegram Ticket] ${customerCompanyName}`;

        // Create the ticket payload
        const payload = {
            type: "slack",
            title: title,
            markdown: summary,
            status: "open",
            channelId: CHANNEL_ID,
            customerId: customerId,
            onBehalfOf: onBehalfOf
        };

        const response = await fetch(`${API_BASE_URL}/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': UNTHREAD_API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create ticket: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        
        // Log the ticket creation with extracted names
        logger.info('Ticket created with extracted customer name', {
            originalGroupChatName: groupChatName,
            extractedCustomerName: customerCompanyName,
            ticketTitle: title,
            ticketId: result.id,
            friendlyId: result.friendlyId,
            customerId: customerId,
            onBehalfOf: onBehalfOf
        });

        return result;
    } catch (error) {
        LogEngine.error('Error creating ticket', {
            error: error.message,
            customerId
        });
        throw error;
    }
}

/**
 * Sends a message to an existing conversation
 * 
 * @param {object} params - The message parameters
 * @param {string} params.conversationId - The ID of the conversation to send a message to
 * @param {string} params.message - The message text
 * @param {object} params.onBehalfOf - The user information for onBehalfOf
 * @param {string} params.onBehalfOf.name - The user's name
 * @param {string} params.onBehalfOf.email - The user's email
 * @returns {Promise<object>} - The response from the API
 */
export async function sendMessage({ conversationId, message, onBehalfOf }) {
    try {
        const payload = {
            body: {
                type: "markdown",
                value: message
            },
            onBehalfOf: onBehalfOf
        };

        const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': UNTHREAD_API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to send message: ${response.status} ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        LogEngine.error('Error sending message', {
            error: error.message,
            conversationId
        });
        throw error;
    }
}

/**
 * Registers a ticket confirmation message using BotsStore
 * 
 * @param {object} ticketInfo - The ticket information to store
 * @param {number} ticketInfo.messageId - The Telegram message ID of the confirmation
 * @param {string} ticketInfo.ticketId - The Unthread ticket/conversation ID
 * @param {string} ticketInfo.friendlyId - The human-readable ticket number
 * @param {string} ticketInfo.customerId - The Unthread customer ID
 * @param {number} ticketInfo.chatId - The Telegram chat ID
 * @param {number} ticketInfo.telegramUserId - The Telegram user ID of the ticket creator
 */
export async function registerTicketConfirmation({ messageId, ticketId, friendlyId, customerId, chatId, telegramUserId }) {
    try {
        const ticketData = {
            ticketId,
            friendlyId,
            customerId,
            chatId,
            telegramUserId,
            createdAt: Date.now()
        };
        
        // Store ticket mapping using BotsStore
        await BotsStore.storeTicket({
            messageId: messageId,
            conversationId: ticketId,
            friendlyId: friendlyId,
            chatId: chatId,
            telegramUserId: telegramUserId,
            ticketId: ticketId,
            createdAt: Date.now()
        });
        
        LogEngine.info('Registered ticket confirmation', {
            messageId,
            ticketId,
            friendlyId,
            customerId,
            chatId,
            telegramUserId
        });
    } catch (error) {
        LogEngine.error('Error registering ticket confirmation', {
            error: error.message,
            ticketId
        });
        throw error;
    }
}

/**
 * Checks if a message is a reply to a ticket confirmation using BotsStore
 * 
 * @param {number} replyToMessageId - The message ID this message is replying to
 * @returns {object|null} - The ticket information or null if not a ticket reply
 */
export async function getTicketFromReply(replyToMessageId) {
    try {
        const ticketData = await BotsStore.getTicketByTelegramMessageId(replyToMessageId);
        return ticketData ? ticketData.metadata : null;
    } catch (error) {
        LogEngine.error('Error getting ticket from reply', {
            error: error.message,
            stack: error.stack,
            replyToMessageId
        });
        return null;
    }
}

/**
 * Checks if a message is a reply to an agent message using BotsStore
 * 
 * @param {number} replyToMessageId - The message ID this message is replying to
 * @returns {object|null} - The agent message information or null if not an agent message reply
 */
export async function getAgentMessageFromReply(replyToMessageId) {
    try {
        const agentMessageData = await BotsStore.getAgentMessageByTelegramId(replyToMessageId);
        return agentMessageData || null;
    } catch (error) {
        LogEngine.error('Error getting agent message from reply', {
            error: error.message,
            stack: error.stack,
            replyToMessageId
        });
        return null;
    }
}

/**
 * Gets all active ticket confirmations for a specific chat using BotsStore
 * 
 * @param {number} chatId - The Telegram chat ID
 * @returns {Array<object>} - Array of ticket confirmation info for this chat
 */
export async function getTicketsForChat(chatId) {
    try {
        // Note: This would require a new method in BotsStore to search by chatId
        // For now, we'll return an empty array and implement this if needed
        LogEngine.debug('getTicketsForChat called but not yet implemented with BotsStore', { chatId });
        return [];
    } catch (error) {
        LogEngine.error('Error getting tickets for chat', {
            error: error.message,
            stack: error.stack,
            chatId
        });
        return [];
    }
}

/**
 * Gets or creates a customer, ensuring it's stored in the database
 * 
 * @param {string} groupChatName - The name of the Telegram group chat
 * @param {string} chatId - The Telegram chat ID
 * @returns {Promise<object>} - Customer data with ID and name
 */
export async function getOrCreateCustomer(groupChatName, chatId) {
    try {
        // First, check if we already have this customer in our database by chat ID
        const existingCustomer = await BotsStore.getCustomerByChatId(chatId);
        if (existingCustomer) {
            logger.info('Using existing customer from database', {
                customerId: existingCustomer.unthreadCustomerId,
                customerName: existingCustomer.customerName,
                chatId: chatId
            });
            return {
                id: existingCustomer.unthreadCustomerId,
                name: existingCustomer.customerName
            };
        }

        // Extract the actual customer company name from the group chat title
        const customerName = extractCustomerCompanyName(groupChatName);
        
        // Create customer in Unthread API
        const response = await fetch(`${API_BASE_URL}/customers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': UNTHREAD_API_KEY
            },
            body: JSON.stringify({
                name: customerName
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create customer: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        
        // Store customer in our database
        await BotsStore.storeCustomer({
            chatId: chatId,
            unthreadCustomerId: result.id,
            chatTitle: groupChatName,
            customerName: customerName,
            createdAt: new Date().toISOString()
        });
        
        logger.info('Created and stored new customer', {
            originalGroupChatName: groupChatName,
            extractedCustomerName: customerName,
            customerId: result.id,
            chatId: chatId
        });

        return {
            id: result.id,
            name: customerName
        };
    } catch (error) {
        logger.error('Error getting or creating customer', {
            error: error.message,
            stack: error.stack,
            groupChatName,
            chatId,
            apiUrl: `${API_BASE_URL}/customers`
        });
        throw error;
    }
}

/**
 * Gets or creates user information, ensuring it's stored in the database
 * 
 * @param {string} telegramUserId - The Telegram user ID
 * @param {string} username - The Telegram username (without @)
 * @returns {Promise<object>} - User data with onBehalf information
 */
export async function getOrCreateUser(telegramUserId, username) {
    try {
        // First, check if we already have this user in our database
        const existingUser = await BotsStore.getUserByTelegramId(telegramUserId);
        if (existingUser) {
            logger.info('Using existing user from database', {
                telegramUserId: existingUser.telegramUserId,
                unthreadName: existingUser.unthreadName,
                unthreadEmail: existingUser.unthreadEmail
            });
            return {
                name: existingUser.unthreadName,
                email: existingUser.unthreadEmail
            };
        }

        // Create new user data
        const unthreadName = username ? `@${username}` : `User ${telegramUserId}`;
        const unthreadEmail = username 
            ? `${username}_${telegramUserId}@telegram.user`
            : `user_${telegramUserId}@telegram.user`;

        // Store user in our database
        await BotsStore.storeUser({
            telegramUserId: telegramUserId,
            telegramUsername: username || null,
            unthreadName: unthreadName,
            unthreadEmail: unthreadEmail,
            createdAt: new Date().toISOString()
        });
        
        logger.info('Created and stored new user', {
            telegramUserId: telegramUserId,
            telegramUsername: username,
            unthreadName: unthreadName,
            unthreadEmail: unthreadEmail
        });

        return {
            name: unthreadName,
            email: unthreadEmail
        };
    } catch (error) {
        logger.error('Error getting or creating user', {
            error: error.message,
            stack: error.stack,
            telegramUserId,
            username
        });
        throw error;
    }
}

// Export the customer cache for potential use in other modules
export { customerCache };