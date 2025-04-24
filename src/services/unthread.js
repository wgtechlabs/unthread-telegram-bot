/**
 * Unthread API Service
 * 
 * This module provides functionality to interact with the Unthread API
 * for creating customers, tickets, and sending messages.
 */

import fetch from 'node-fetch';
import * as logger from '../utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// API URLs and Auth Keys
const API_BASE_URL = 'https://api.unthread.io/api';
const UNTHREAD_API_KEY = process.env.UNTHREAD_API_KEY;
const CHANNEL_ID = process.env.UNTHREAD_CHANNEL_ID;

// Store ticket confirmations by message ID
// Format: { messageId: { ticketId, friendlyId, customerId, chatId, userId } }
const ticketConfirmations = new Map();

/**
 * Creates a new customer in Unthread
 * 
 * @param {string} groupChatName - The name of the Telegram group chat
 * @returns {Promise<object>} - The created customer object with ID
 */
export async function createCustomer(groupChatName) {
    try {
        const customerName = `[Telegram] ${groupChatName}`;
        
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

        return await response.json();
    } catch (error) {
        logger.error(`Error creating customer: ${error.message}`);
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
 * @param {string} params.username - The Telegram username of the ticket creator
 * @param {string} params.userId - The Telegram user ID of the ticket creator
 * @returns {Promise<object>} - The created ticket object
 */
export async function createTicket({ groupChatName, customerId, summary, username, userId }) {
    try {
        // Format the title with the standard prefix
        const title = `[Telegram Ticket] ${groupChatName}`;
        
        // Generate email from username or use userId as fallback
        const userEmail = username 
            ? `${username}_${userId}@telegram.user`
            : `user_${userId}@telegram.user`;

        // Create the ticket payload
        const payload = {
            type: "slack",
            title: title,
            markdown: summary,
            status: "open",
            channelId: CHANNEL_ID,
            customerId: customerId,
            onBehalfOf: {
                name: username ? `@${username}` : `User ${userId}`,
                email: userEmail
            }
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

        return await response.json();
    } catch (error) {
        logger.error(`Error creating ticket: ${error.message}`);
        throw error;
    }
}

/**
 * Sends a message to an existing conversation
 * 
 * @param {object} params - The message parameters
 * @param {string} params.conversationId - The ID of the conversation to send a message to
 * @param {string} params.message - The message text
 * @param {string} params.username - The Telegram username of the message sender
 * @param {string} params.userId - The Telegram user ID of the message sender
 * @returns {Promise<object>} - The response from the API
 */
export async function sendMessage({ conversationId, message, username, userId }) {
    try {
        // Generate email from username or use userId as fallback
        const userEmail = username 
            ? `${username}_${userId}@telegram.user`
            : `user_${userId}@telegram.user`;

        const payload = {
            body: {
                type: "markdown",
                value: message
            },
            onBehalfOf: {
                email: userEmail,
                name: username ? `@${username}` : `User ${userId}`
            }
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
        logger.error(`Error sending message: ${error.message}`);
        throw error;
    }
}

/**
 * Registers a ticket confirmation message
 * 
 * @param {object} ticketInfo - The ticket information to store
 * @param {number} ticketInfo.messageId - The Telegram message ID of the confirmation
 * @param {string} ticketInfo.ticketId - The Unthread ticket/conversation ID
 * @param {string} ticketInfo.friendlyId - The human-readable ticket number
 * @param {string} ticketInfo.customerId - The Unthread customer ID
 * @param {number} ticketInfo.chatId - The Telegram chat ID
 * @param {number} ticketInfo.userId - The Telegram user ID of the ticket creator
 */
export function registerTicketConfirmation({ messageId, ticketId, friendlyId, customerId, chatId, userId }) {
    ticketConfirmations.set(messageId, {
        ticketId,
        friendlyId,
        customerId,
        chatId,
        userId,
        createdAt: Date.now() // Add timestamp for potential cleanup later
    });
    
    logger.info(`Registered ticket confirmation with message ID ${messageId} for ticket #${friendlyId}`);
}

/**
 * Checks if a message is a reply to a ticket confirmation
 * 
 * @param {number} replyToMessageId - The message ID this message is replying to
 * @returns {object|null} - The ticket information or null if not a ticket reply
 */
export function getTicketFromReply(replyToMessageId) {
    return ticketConfirmations.get(replyToMessageId) || null;
}

/**
 * Gets all active ticket confirmations for a specific chat
 * 
 * @param {number} chatId - The Telegram chat ID
 * @returns {Array<object>} - Array of ticket confirmation info for this chat
 */
export function getTicketsForChat(chatId) {
    const chatTickets = [];
    
    for (const [messageId, ticketInfo] of ticketConfirmations.entries()) {
        if (ticketInfo.chatId === chatId) {
            chatTickets.push({
                messageId,
                ...ticketInfo
            });
        }
    }
    
    return chatTickets;
}

// Export the ticket confirmations map for potential use in other modules
export { ticketConfirmations };