/**
 * Unthread Telegram Bot - Unthread API Service
 * 
 * Provides comprehensive integration with the Unthread platform API for customer
 * support ticket management. This service handles customer creation, ticket
 * management, and message routing between Telegram and Unthread.
 * 
 * Core Features:
 * - Customer profile creation and management
 * - Support ticket creation and status tracking
 * - Message sending and conversation threading
 * - API authentication and error handling
 * - Data persistence with Bots Brain storage integration
 * 
 * API Operations:
 * - Customer creation with Telegram user data
 * - Ticket creation with support form data
 * - Message posting to existing conversations
 * - Ticket status updates and notifications
 * 
 * Integration Points:
 * - Telegram user data mapping to Unthread customers
 * - Support form data collection and validation
 * - Conversation state management and persistence
 * - Error handling and retry mechanisms
 * 
 * Security:
 * - API key authentication
 * - Request signing and validation
 * - Rate limiting compliance 
 * - Data sanitization and validation
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import fetch from 'node-fetch';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from '../sdk/bots-brain/index.js';
import { TicketData, AgentMessageData, UserData } from '../sdk/types.js';
import { getDefaultTicketPriority } from '../config/env.js';
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
 * Ticket creation payload for API request
 */
interface CreateTicketPayload {
  type: "slack";
  title: string;
  markdown: string;
  status: "open";
  channelId: string;
  customerId: string;
  onBehalfOf: OnBehalfOfUser;
  priority?: 3 | 5 | 7 | 9;
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
const UNTHREAD_API_KEY = process.env.UNTHREAD_API_KEY!;
const CHANNEL_ID = process.env.UNTHREAD_SLACK_CHANNEL_ID!;

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
 * Creates a new support ticket in Unthread for the specified customer and group chat.
 *
 * @param params - Contains group chat name, customer ID, ticket summary, and user information for whom the ticket is created.
 * @returns The response object with ticket identifiers from Unthread.
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
 * Creates a new support ticket in Unthread using the provided details.
 *
 * Sends a POST request to the Unthread API to create a ticket with the specified title, summary, customer ID, user information, and optional priority.
 *
 * @param params - Ticket creation details including title, summary, customer ID, and user information
 * @returns An object containing the ticket's unique ID and friendly ID
 * @throws If the Unthread API request fails or returns a non-OK response
 */
async function createTicketJSON(params: CreateTicketJSONParams): Promise<CreateTicketResponse> {
    const { title, summary, customerId, onBehalfOf } = params;
    
    // Get default priority from environment configuration
    const defaultPriority = getDefaultTicketPriority();
    
    const payload: CreateTicketPayload = {
        type: "slack",
        title: title,
        markdown: summary,
        status: "open",
        channelId: CHANNEL_ID!,
        customerId: customerId,
        onBehalfOf: onBehalfOf
    };
    
    // Add priority only if configured
    if (defaultPriority !== undefined) {
        payload.priority = defaultPriority;
    }

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
        customerId: customerId,
        priority: defaultPriority || 'not set'
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
 * Retrieves agent message data associated with a given Telegram reply message ID.
 *
 * @param replyToMessageId - The Telegram message ID being replied to
 * @returns The corresponding agent message data, or null if not found or on error
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
 * Retrieves all active ticket confirmations for a specified Telegram chat.
 *
 * Currently returns an empty array as this functionality is not implemented.
 *
 * @param chatId - The Telegram chat ID
 * @returns An array of ticket confirmation data for the given chat, or an empty array if not implemented
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
        // Phase 8 Enhancement: Check if group is configured first
        const groupConfig = await BotsStore.getGroupConfig(chatId);
        
        if (groupConfig && groupConfig.isConfigured && groupConfig.customerId) {
            // Group is configured - use the configured customer
            LogEngine.info('Using configured customer for group', {
                customerId: groupConfig.customerId,
                customerName: groupConfig.customerName,
                chatId: chatId,
                groupConfigured: true
            });
            
            return {
                id: groupConfig.customerId,
                name: groupConfig.customerName || 'Unknown Customer'
            };
        }
        
        // Group not configured - check for legacy customer data
        const existingCustomer = await BotsStore.getCustomerByChatId(chatId);
        if (existingCustomer) {
            LogEngine.info('Using existing customer from legacy storage', {
                customerId: existingCustomer.unthreadCustomerId,
                customerName: existingCustomer.customerName || existingCustomer.name,
                chatId: chatId,
                groupConfigured: false
            });
            return {
                id: existingCustomer.unthreadCustomerId,
                name: existingCustomer.customerName || existingCustomer.name || 'Unknown Customer'
            };
        }

        // Phase 8 Enhancement: Prevent auto-creation for unconfigured groups
        // This encourages proper setup through the /setup command
        LogEngine.warn('Attempted ticket creation in unconfigured group', {
            groupChatName,
            chatId,
            message: 'Group requires setup before ticket creation'
        });
        
        throw new Error(
            'GROUP_NOT_CONFIGURED: This group has not been configured for support tickets. ' +
            'Please ask a group administrator to run /setup to link this group to a customer account.'
        );
        
        // Legacy auto-creation code commented out for Phase 8
        // This ensures groups must be properly configured before ticket creation
        /*
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
        */
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
 * Retrieves user information for a given Telegram user ID, creating and storing a new user if one does not exist.
 *
 * If the user is not found, a new user is generated with a name and email based on the Telegram user ID and optional username.
 *
 * @param telegramUserId - The Telegram user ID to look up or create
 * @param username - Optional Telegram username (without @) to use for the new user
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

/**
 * Generates a customer name from a group chat title with [Telegram] prefix
 * 
 * This function takes a Telegram group chat title and creates a suitable customer name
 * by extracting the company/customer portion and adding a [Telegram] prefix to distinguish
 * it from other communication channels.
 * 
 * @param groupChatTitle - The Telegram group chat title
 * @returns A formatted customer name with [Telegram] prefix
 */
export function generateCustomerName(groupChatTitle: string): string {
    if (!groupChatTitle) {
        return '[Telegram] Unknown Company';
    }

    // Use existing extraction logic to get the customer name
    const extractedName = extractCustomerCompanyName(groupChatTitle);
    
    // Add [Telegram] prefix to distinguish from other channels
    return `[Telegram] ${extractedName}`;
}

/**
 * Phase 7: Customer Operations - API Integration Functions
 */

/**
 * Validates if a customer exists in Unthread by customer ID
 * Phase 7 implementation for customer validation
 * 
 * @param customerId - The customer ID to validate
 * @returns Object with validation result and customer details if found
 */
export async function validateCustomerExists(customerId: string): Promise<{
    exists: boolean;
    customer?: Customer;
    error?: string;
}> {
    try {
        if (!customerId || customerId.trim() === '') {
            return {
                exists: false,
                error: 'Customer ID cannot be empty'
            };
        }

        const response = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': UNTHREAD_API_KEY!
            }
        });

        if (response.status === 404) {
            LogEngine.info('Customer not found in Unthread', { customerId });
            return {
                exists: false,
                error: 'Customer not found'
            };
        }

        if (!response.ok) {
            const errorText = await response.text();
            LogEngine.error('Error validating customer', {
                customerId,
                status: response.status,
                error: errorText
            });
            return {
                exists: false,
                error: `API error: ${response.status} ${errorText}`
            };
        }

        const customer = await response.json() as Customer;
        
        LogEngine.info('Customer validated successfully', {
            customerId,
            customerName: customer.name
        });

        return {
            exists: true,
            customer: customer
        };
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Exception during customer validation', {
            customerId,
            error: err.message,
            stack: err.stack
        });
        return {
            exists: false,
            error: `Validation failed: ${err.message}`
        };
    }
}

/**
 * Gets detailed customer information from Unthread
 * Phase 7 implementation for customer details retrieval
 * 
 * @param customerId - The customer ID to get details for
 * @returns Customer details or null if not found
 */
export async function getCustomerDetails(customerId: string): Promise<Customer | null> {
    try {
        const validation = await validateCustomerExists(customerId);
        
        if (validation.exists && validation.customer) {
            return validation.customer;
        }
        
        return null;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error getting customer details', {
            customerId,
            error: err.message
        });
        return null;
    }
}

/**
 * Creates a customer in Unthread with the specified name
 * Phase 7 enhancement of existing createCustomer function
 * 
 * @param customerName - The name for the new customer
 * @returns The created customer object
 */
export async function createCustomerWithName(customerName: string): Promise<Customer> {
    try {
        if (!customerName || customerName.trim() === '') {
            throw new Error('Customer name cannot be empty');
        }

        const trimmedName = customerName.trim();

        const response = await fetch(`${API_BASE_URL}/customers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': UNTHREAD_API_KEY!
            },
            body: JSON.stringify({
                name: trimmedName
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create customer: ${response.status} ${errorText}`);
        }

        const result = await response.json() as Customer;
        
        LogEngine.info('Customer created successfully', {
            customerName: trimmedName,
            customerId: result.id
        });

        // Cache the customer to avoid duplicates
        customerCache.set(trimmedName, result);

        return result;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error creating customer with name', {
            customerName,
            error: err.message
        });
        throw error;
    }
}

/**
 * Handles API errors gracefully with user-friendly messages
 * Phase 7 implementation for better error handling
 * 
 * @param error - The error to handle
 * @param operation - The operation that failed
 * @returns User-friendly error message
 */
export function handleUnthreadApiError(error: any, operation: string): string {
    const err = error as Error;
    
    // Network errors
    if (err.message.includes('fetch')) {
        return '🌐 **Connection Error**\n\nUnable to connect to Unthread servers. Please check your internet connection and try again.';
    }
    
    // API key errors
    if (err.message.includes('401') || err.message.includes('unauthorized')) {
        return '🔑 **Authentication Error**\n\nInvalid API credentials. Please contact your system administrator.';
    }
    
    // Rate limiting
    if (err.message.includes('429') || err.message.includes('rate limit')) {
        return '⏰ **Rate Limit Exceeded**\n\nToo many requests. Please wait a moment and try again.';
    }
    
    // Server errors
    if (err.message.includes('500') || err.message.includes('503')) {
        return '🚨 **Server Error**\n\nUnthread servers are experiencing issues. Please try again later.';
    }
    
    // Customer not found
    if (err.message.includes('404') || err.message.includes('not found')) {
        return '❌ **Customer Not Found**\n\nThe specified customer ID does not exist in your Unthread account.';
    }
    
    // Generic error
    return `❌ **${operation} Failed**\n\nAn unexpected error occurred: ${err.message}\n\nPlease try again or contact support if the issue persists.`;
}

// Export the customer cache for potential use in other modules
export { customerCache };
