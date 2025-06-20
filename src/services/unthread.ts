/**
 * Unthread API Service
 * 
 * This module provides functionality to interact with the Unthread API
 * for creating customers, tickets, and sending messages.
 */

import fetch from 'node-fetch';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from '../sdk/bots-brain/index.js';
import { TicketData, AgentMessageData, UserData } from '../sdk/types.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Customer data structure
 */
interface Customer {
  id: string;
  name: string;
}

/**
 * User data for onBehalfOf
 */
interface OnBehalfOfUser {
  name: string;
  email: string;
}

/**
 * Ticket creation parameters
 */
interface CreateTicketParams {
  groupChatName: string;
  customerId: string;
  summary: string;
  onBehalfOf: OnBehalfOfUser;
}

/**
 * Message sending parameters
 */
interface SendMessageParams {
  conversationId: string;
  message: string;
  onBehalfOf: OnBehalfOfUser;
}

/**
 * Ticket confirmation parameters
 */
interface RegisterTicketConfirmationParams {
  messageId: number;
  ticketId: string;
  friendlyId: string;
  customerId: string;
  chatId: number;
  telegramUserId: number;
}

/**
 * Ticket JSON creation parameters
 */
interface CreateTicketJSONParams {
  title: string;
  summary: string;
  customerId: string;
  onBehalfOf: OnBehalfOfUser;
}

/**
 * Message JSON sending parameters
 */
interface SendMessageJSONParams {
  conversationId: string;
  message: string;
  onBehalfOf: OnBehalfOfUser;
}

/**
 * Ticket creation response
 */
interface CreateTicketResponse {
  id: string;
  friendlyId: string;
}

/**
 * Extracts and formats the customer company name from a Telegram group chat title by removing the bot's company name and handling various separators.
 *
 * @param groupChatTitle - The original group chat title
 * @returns The extracted and capitalized customer company name, or "Unknown Company" if extraction fails
 */
function extractCustomerCompanyName(groupChatTitle: string): string {
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
                
                if (part1 === lowerCompanyName && part2 !== lowerCompanyName && part2) {
                    // Our company is first, customer is second
                    return capitalizeCompanyName(part2);
                } else if (part2 === lowerCompanyName && part1 !== lowerCompanyName && part1) {
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
 * Formats a company name by capitalizing each word, replacing spaces with hyphens, and removing invalid characters.
 *
 * Returns 'Unknown-Company' if the input is empty.
 *
 * @param name - The company name to format
 * @returns The formatted and capitalized company name
 */
function capitalizeCompanyName(name: string): string {
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
    throw new Error('Missing required environment variable: UNTHREAD_API_KEY');
}

if (!CHANNEL_ID) {
    LogEngine.error('UNTHREAD_CHANNEL_ID environment variable is required but not defined');
    throw new Error('Missing required environment variable: UNTHREAD_CHANNEL_ID');
}

// Customer ID cache to avoid creating duplicates
const customerCache = new Map<string, Customer>();

/**
 * Creates a new customer in Unthread using the extracted company name from a Telegram group chat title.
 *
 * @param groupChatName - The name of the Telegram group chat
 * @returns The created customer object containing its ID and name
 */
export async function createCustomer(groupChatName: string): Promise<Customer> {
    try {
        // Extract the actual customer company name from the group chat title
        const customerName = extractCustomerCompanyName(groupChatName);
        
        const response = await fetch(`${API_BASE_URL}/customers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': UNTHREAD_API_KEY!
            },
            body: JSON.stringify({
                name: customerName
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create customer: ${response.status} ${errorText}`);
        }

        const result = await response.json() as Customer;
        
        // Log the extraction for debugging
        LogEngine.info('Customer created with extracted name', {
            originalGroupChatName: groupChatName,
            extractedCustomerName: customerName,
            customerId: result.id
        });

        return result;
    } catch (error) {
        LogEngine.error('Error creating customer', {
            error: (error as Error).message,
            groupChatName
        });
        throw error;
    }
}

/**
 * Creates a new support ticket in Unthread for a given customer and group chat.
 *
 * @param params - Includes group chat name, customer ID, ticket summary, and user information on whose behalf the ticket is created.
 * @returns The created ticket object from Unthread.
 */
export async function createTicket(params: CreateTicketParams): Promise<CreateTicketResponse> {
    try {
        const { groupChatName, customerId, summary, onBehalfOf } = params;
        
        // Extract the customer company name for the ticket title
        const customerCompanyName = extractCustomerCompanyName(groupChatName);
        const title = `[Telegram Ticket] ${customerCompanyName}`;

        return await createTicketJSON({ title, summary, customerId, onBehalfOf });
    } catch (error) {
        LogEngine.error('Error creating ticket', {
            error: (error as Error).message,
            customerId: params.customerId
        });
        throw error;
    }
}

/**
 * Creates a new support ticket in Unthread using a JSON payload.
 *
 * Sends a POST request to the Unthread API to create a ticket with the specified title, summary, customer, and user information. Returns the created ticket's identifiers.
 *
 * @param params - Ticket creation details including title, summary, customer ID, and user information
 * @returns An object containing the ticket's unique ID and friendly ID
 * @throws If the API request fails or returns a non-OK response
 */
async function createTicketJSON(params: CreateTicketJSONParams): Promise<CreateTicketResponse> {
    const { title, summary, customerId, onBehalfOf } = params;
    
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
            'X-API-KEY': UNTHREAD_API_KEY!
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create ticket: ${response.status} ${errorText}`);
    }

    const result = await response.json() as CreateTicketResponse;
    
    LogEngine.info('Ticket created (JSON)', {
        ticketTitle: title,
        ticketId: result.id,
        friendlyId: result.friendlyId,
        customerId: customerId
    });

    return result;
}

/**
 * Sends a message to an existing Unthread conversation.
 *
 * @param params - Contains the conversation ID, message content, and user information.
 * @returns The API response for the sent message.
 */
export async function sendMessage(params: SendMessageParams): Promise<any> {
    try {
        return await sendMessageJSON(params);
    } catch (error) {
        LogEngine.error('Error sending message', {
            error: (error as Error).message,
            conversationId: params.conversationId
        });
        throw error;
    }
}

/**
 * Sends a markdown-formatted message to a conversation in Unthread without attachments.
 *
 * @param params - Contains the conversation ID, message content, and user information for attribution.
 * @returns The response data from the Unthread API after sending the message.
 * @throws If the API request fails or returns a non-OK status.
 */
async function sendMessageJSON(params: SendMessageJSONParams): Promise<any> {
    const { conversationId, message, onBehalfOf } = params;
    
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
            'X-API-KEY': UNTHREAD_API_KEY!
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send message: ${response.status} ${errorText}`);
    }

    return await response.json();
}

/**
 * Stores ticket confirmation details in the BotsStore for later retrieval.
 *
 * @param params - Ticket confirmation data including message and ticket identifiers, chat and user IDs, and related metadata.
 */
export async function registerTicketConfirmation(params: RegisterTicketConfirmationParams): Promise<void> {
    try {
        const { messageId, ticketId, friendlyId, customerId, chatId, telegramUserId } = params;
        
        // Store ticket mapping using BotsStore
        await BotsStore.storeTicket({
            messageId: messageId,
            conversationId: ticketId,
            friendlyId: friendlyId,
            chatId: chatId,
            telegramUserId: telegramUserId,
            ticketId: ticketId,
            createdAt: Date.now().toString()
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
            error: (error as Error).message,
            ticketId: params.ticketId
        });
        throw error;
    }
}

/**
 * Retrieves ticket information associated with a replied-to Telegram message.
 *
 * @param replyToMessageId - The Telegram message ID being replied to
 * @returns The ticket data if found, or null if no ticket is associated with the message
 */
export async function getTicketFromReply(replyToMessageId: number): Promise<TicketData | null> {
    try {
        const ticketData = await BotsStore.getTicketByTelegramMessageId(replyToMessageId);
        
        LogEngine.debug('getTicketFromReply debug', {
            replyToMessageId,
            hasTicketData: !!ticketData,
            ticketDataKeys: ticketData ? Object.keys(ticketData) : null,
            hasMetadata: ticketData ? !!ticketData.metadata : false
        });
        
        // Return the ticketData directly, not ticketData.metadata
        // The stored ticket data contains all the info we need
        return ticketData || null;
    } catch (error) {
        LogEngine.error('Error getting ticket from reply', {
            error: (error as Error).message,
            stack: (error as Error).stack,
            replyToMessageId
        });
        return null;
    }
}

/**
 * Retrieves agent message information from BotsStore by the replied message ID.
 *
 * @param replyToMessageId - The Telegram message ID being replied to
 * @returns The agent message data if found, or null if not found or on error
 */
export async function getAgentMessageFromReply(replyToMessageId: number): Promise<AgentMessageData | null> {
    try {
        const agentMessageData = await BotsStore.getAgentMessageByTelegramId(replyToMessageId);
        return agentMessageData || null;
    } catch (error) {
        LogEngine.error('Error getting agent message from reply', {
            error: (error as Error).message,
            stack: (error as Error).stack,
            replyToMessageId
        });
        return null;
    }
}

/**
 * Retrieves all active ticket confirmations for a given Telegram chat.
 *
 * Currently returns an empty array as the functionality is not yet implemented.
 *
 * @param chatId - The Telegram chat ID
 * @returns An array of ticket confirmation information for the specified chat
 */
export async function getTicketsForChat(chatId: number): Promise<TicketData[]> {
    try {
        // Note: This would require a new method in BotsStore to search by chatId
        // For now, we'll return an empty array and implement this if needed
        LogEngine.debug('getTicketsForChat called but not yet implemented with BotsStore', { chatId });
        return [];
    } catch (error) {
        LogEngine.error('Error getting tickets for chat', {
            error: (error as Error).message,
            stack: (error as Error).stack,
            chatId
        });
        return [];
    }
}

/**
 * Retrieves an existing customer by Telegram chat ID or creates a new customer in Unthread and stores it locally.
 *
 * @param groupChatName - The name of the Telegram group chat.
 * @param chatId - The Telegram chat ID.
 * @returns The customer object containing the Unthread customer ID and name.
 */
export async function getOrCreateCustomer(groupChatName: string, chatId: number): Promise<Customer> {
    try {
        // First, check if we already have this customer in our database by chat ID
        const existingCustomer = await BotsStore.getCustomerByChatId(chatId);
        if (existingCustomer) {
            LogEngine.info('Using existing customer from database', {
                customerId: existingCustomer.unthreadCustomerId,
                customerName: existingCustomer.customerName || existingCustomer.name,
                chatId: chatId
            });
            return {
                id: existingCustomer.unthreadCustomerId,
                name: existingCustomer.customerName || existingCustomer.name || 'Unknown Customer'
            };
        }

        // Extract the actual customer company name from the group chat title
        const customerName = extractCustomerCompanyName(groupChatName);
        
        // Create customer in Unthread API
        const response = await fetch(`${API_BASE_URL}/customers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': UNTHREAD_API_KEY!
            },
            body: JSON.stringify({
                name: customerName
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create customer: ${response.status} ${errorText}`);
        }

        const result = await response.json() as Customer;
        
        // Store customer in our database
        await BotsStore.storeCustomer({
            id: `customer_${chatId}`,
            unthreadCustomerId: result.id,
            telegramChatId: chatId,
            chatId: chatId,
            chatTitle: groupChatName,
            customerName: customerName,
            name: customerName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        LogEngine.info('Created and stored new customer', {
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
        LogEngine.error('Error getting or creating customer', {
            error: (error as Error).message,
            stack: (error as Error).stack,
            groupChatName,
            chatId,
            apiUrl: `${API_BASE_URL}/customers`
        });
        throw error;
    }
}

/**
 * Retrieves user information by Telegram user ID, creating and storing a new user record if one does not exist.
 *
 * If the user is not found in the database, a new user is created with a generated name and email, optionally using the provided username.
 *
 * @param telegramUserId - The Telegram user ID
 * @param username - Optional Telegram username (without @)
 * @returns An object containing the user's name and email for use as onBehalfOf information
 */
export async function getOrCreateUser(telegramUserId: number, username?: string): Promise<OnBehalfOfUser> {
    try {
        // First, check if we already have this user in our database
        const existingUser = await BotsStore.getUserByTelegramId(telegramUserId);
        if (existingUser) {
            LogEngine.info('Using existing user from database', {
                telegramUserId: existingUser.telegramUserId,
                unthreadName: existingUser.unthreadName,
                unthreadEmail: existingUser.unthreadEmail
            });
            return {
                name: existingUser.unthreadName || `User ${existingUser.telegramUserId}`,
                email: existingUser.unthreadEmail || `user_${existingUser.telegramUserId}@telegram.user`
            };
        }

        // Create new user data
        const unthreadName = username ? `@${username}` : `User ${telegramUserId}`;
        const unthreadEmail = username 
            ? `${username}_${telegramUserId}@telegram.user`
            : `user_${telegramUserId}@telegram.user`;

        // Store user in our database
        const userData: UserData = {
            id: `user_${telegramUserId}`,
            telegramUserId: telegramUserId,
            unthreadName: unthreadName,
            unthreadEmail: unthreadEmail,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (username) {
            userData.telegramUsername = username;
            userData.username = username;
        }
        
        await BotsStore.storeUser(userData);
        
        LogEngine.info('Created and stored new user', {
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
        LogEngine.error('Error getting or creating user', {
            error: (error as Error).message,
            stack: (error as Error).stack,
            telegramUserId,
            username
        });
        throw error;
    }
}

// Export the customer cache for potential use in other modules
export { customerCache };
