/**
 * Unthread API Service - Customer support ticket management
 * 
 * Key Features:
 * - Customer profile creation and management
 * - Support ticket creation and status tracking
 * - Message routing between Telegram and Unthread
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0-rc2
 * @since 2025
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { URLSearchParams } from 'url';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from '../sdk/bots-brain/index.js';
import { AgentMessageData, TicketData, UserData } from '../sdk/types.js';
import { getCompanyName, getDefaultTicketPriority } from '../config/env.js';
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
 * Email is optional to support users without email setup
 */
interface OnBehalfOfUser {
  name: string;
  email: string | undefined; // Explicitly allow undefined for email collection flow
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
  summary: string;
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
 * Message parameters with file attachments
 */
interface SendMessageWithAttachmentsParams {
  conversationId: string;
  message: string;
  onBehalfOf: OnBehalfOfUser;
  filePaths: string[];
}

/**
 * Ticket creation parameters with file attachments using buffers
 */
interface CreateTicketWithBufferAttachmentsParams {
  groupChatName: string;
  customerId: string;
  summary: string;
  onBehalfOf: OnBehalfOfUser;
  attachments: Array<{
    filename: string;
    buffer: Buffer;
    mimeType: string;
  }>;
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
 * Extracts the customer company name from a Telegram group chat title by removing the bot's company name and handling common separators.
 *
 * Returns a formatted and capitalized customer name, or "Unknown Company" if extraction is not possible.
 *
 * @param groupChatTitle - The original group chat title from Telegram
 * @returns The extracted customer company name for display
 */
function extractCustomerCompanyName(groupChatTitle: string): string {
    if (!groupChatTitle) {
        return 'Unknown Company';
    }

    const companyName = getCompanyName();
    
    // If no company name is configured (placeholder or empty), use full group chat name
    if (!companyName) {
        return formatCustomerNameForDisplay(groupChatTitle);
    }
    
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
                    return formatCustomerNameForDisplay(part2);
                } else if (part2 === lowerCompanyName && part1 !== lowerCompanyName && part1) {
                    // Customer is first, our company is second
                    return formatCustomerNameForDisplay(part1);
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
            return formatCustomerNameForDisplay(result);
        }
    }
    
    // If admin's company name is NOT found in the group title, 
    // the group title likely represents the partner's name
    // Example: Admin company = "Unthread", Group title = "ACME Global Corp" → suggest "ACME Global Corp"
    return formatCustomerNameForDisplay(groupChatTitle);
}

/**
 * Formats a customer name for display by normalizing spaces and capitalizing each word.
 *
 * Returns 'Unknown Company' if the input is empty.
 *
 * @param name - The customer name to format
 * @returns The formatted customer name with proper capitalization and spacing
 */
function formatCustomerNameForDisplay(name: string): string {
    if (!name) {return 'Unknown Company';}
    
    return name
        .trim()
        .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
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
            headers:
 {
                'Content-Type': 'application/json',
                'X-API-KEY': UNTHREAD_API_KEY!
            },
            body: JSON.stringify({
                name: customerName
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create customer: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json() as Customer;
        
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
        throw new Error(`Failed to create ticket: ${response.status} ${response.statusText} - ${errorText}`);
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
        throw new Error(`Failed to send message: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
}

/**
 * Stores ticket confirmation details in the BotsStore for later retrieval.
 *
 * @param params - Ticket confirmation data including message and ticket identifiers, chat and user IDs, and related metadata.
 */
export async function registerTicketConfirmation(params: RegisterTicketConfirmationParams): Promise<void> {
    LogEngine.info('Starting registerTicketConfirmation', {
        messageId: params.messageId,
        ticketId: params.ticketId,
        friendlyId: params.friendlyId,
        chatId: params.chatId,
        telegramUserId: params.telegramUserId
    });
    
    try {
        const { messageId, ticketId, friendlyId, customerId, chatId, telegramUserId, summary } = params;
        
        LogEngine.info('About to store ticket with unified approach', {
            conversationId: ticketId,
            messageId,
            friendlyId,
            summary: summary.substring(0, 100) + (summary.length > 100 ? '...' : '')
        });
        
        // UNIFIED APPROACH: Store ticket using the ticketId as conversationId
        // This eliminates the ID mismatch by treating ticketId as the primary conversation identifier
        // Webhooks will use this same ID to look up tickets
        const storeResult = await BotsStore.storeTicket({
            messageId: messageId,
            conversationId: ticketId,           // Use ticketId as conversationId for unified lookup
            friendlyId: friendlyId,
            chatId: chatId,
            telegramUserId: telegramUserId,
            ticketId: ticketId,                 // Keep for backward compatibility
            summary: summary,                   // Store the actual ticket summary for template usage
            createdAt: Date.now().toString()
        });
        
        LogEngine.info('Ticket storage completed', {
            success: storeResult,
            conversationId: ticketId,
            messageId,
            friendlyId
        });
        
        // Immediate verification - try to retrieve the ticket we just stored
        LogEngine.info('Attempting immediate verification lookup');
        const verificationTicket = await BotsStore.getTicketByConversationId(ticketId);
        LogEngine.info('Immediate verification result', {
            found: !!verificationTicket,
            lookupKey: `ticket:unthread:${ticketId}`,
            verificationData: verificationTicket ? {
                conversationId: verificationTicket.conversationId,
                friendlyId: verificationTicket.friendlyId,
                messageId: verificationTicket.messageId
            } : null
        });
        
        LogEngine.info('Registered ticket confirmation - unified storage approach', {
            messageId,
            unifiedConversationId: ticketId,    // Now conversationId === ticketId
            ticketId: ticketId,
            friendlyId,
            customerId,
            chatId,
            telegramUserId,
            summary: summary.substring(0, 100) + (summary.length > 100 ? '...' : ''),
            approach: 'unified_conversationId',
            storageKeys: [
                `ticket:unthread:${ticketId}`,  // Primary storage key
                `ticket:telegram:${messageId}`,
                `ticket:friendly:${friendlyId}`
            ]
        });
    } catch (error) {
        LogEngine.error('Error registering ticket confirmation', {
            error: (error as Error).message,
            stack: (error as Error).stack,
            ticketId: params.ticketId,
            messageId: params.messageId
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
        // This would require a new method in BotsStore to search by chatId
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
 * Retrieves the Unthread customer associated with a Telegram group chat, using group configuration or legacy storage.
 *
 * If the group is properly configured, returns the configured customer. If legacy customer data exists, returns that customer. Throws an error if the group is not configured for support tickets.
 *
 * @param groupChatName - The name of the Telegram group chat
 * @param chatId - The Telegram chat ID
 * @returns The customer object containing the Unthread customer ID and name
 */
export async function getOrCreateCustomer(groupChatName: string, chatId: number): Promise<Customer> {
    try {
        // Check if group is configured first
        const groupConfig = await BotsStore.getGroupConfig(chatId);
        
        if (groupConfig?.isConfigured && groupConfig.customerId) {
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

        // Prevent auto-creation for unconfigured groups
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
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error getting or creating customer', {
            error: err.message,
            stack: err.stack,
            groupChatName,
            chatId,
            apiUrl: `${API_BASE_URL}/customers`
        });
        
        // Ensure we always throw the error to maintain Promise<Customer> contract
        // The function should either resolve with a Customer or reject with an error
        throw err;
    }
}

/**
 * Creates a user display name using Telegram user data with proper fallback hierarchy.
 *
 * Priority order:
 * 1. "FirstName (@username)" (if both first name and username available)
 * 2. "@username" (if only username available)
 * 3. "FirstName LastName" (if names available but no username)
 * 4. "FirstName" (if only first name available)
 * 5. "User {ID}" (final fallback)
 *
 * Creates a user display name that's compatible with unthread-webhook-server validation
 * 
 * WEBHOOK SERVER INTEGRATION:
 * ---------------------------
 * The unthread-webhook-server uses this botName field for platform detection:
 * - Names starting with '@' are classified as 'telegram' platform
 * - Names without '@' are classified as 'dashboard' origin
 * 
 * Our format priority ensures proper classification:
 * 1. "FirstName (@username)" - Best UX, detected as Telegram ✅
 * 2. "FirstName LastName" - Good fallback, detected as Dashboard
 * 3. "@username" - Minimal format, detected as Telegram ✅
 * 
 * @param telegramUserId - The Telegram user ID
 * @param username - Optional Telegram username (without @)
 * @param firstName - Optional Telegram user's first name
 * @param lastName - Optional Telegram user's last name
 * @returns Formatted display name for Unthread dashboard
 * 
 * @see https://github.com/wgtechlabs/unthread-webhook-server/blob/main/src/services/webhookService.ts#L118-L144
 */
function createUserDisplayName(
    telegramUserId: number, 
    username?: string, 
    firstName?: string, 
    lastName?: string
): string {
    const cleanUsername = username && username.trim() ? username.trim() : null;
    const cleanFirstName = firstName && firstName.trim() ? firstName.trim() : null;
    const cleanLastName = lastName && lastName.trim() ? lastName.trim() : null;
    
    // Priority 1: "FirstName (@username)" - best of both worlds
    if (cleanFirstName && cleanUsername) {
        return `${cleanFirstName} (@${cleanUsername})`;
    }
    
    // Priority 2: "@username" - if no first name but username exists
    if (cleanUsername) {
        return `@${cleanUsername}`;
    }
    
    // Priority 3: "FirstName LastName" - if names available but no username
    if (cleanFirstName) {
        const last = cleanLastName ? ` ${cleanLastName}` : '';
        return `${cleanFirstName}${last}`;
    }
    
    // Priority 4: Final fallback to User ID
    return `User ${telegramUserId}`;
}



/**
 * Retrieves user information for a Telegram user ID, creating and storing a new user if not found.
 *
 * If the user does not exist, generates a new user with a name and email based on the Telegram user data including display names, username, and ID as fallback, and persists the user data.
 *
 * @param telegramUserId - The Telegram user ID to look up or create
 * @param username - Optional Telegram username (without @) to use for the new user
 * @param firstName - Optional Telegram user's first name
 * @param lastName - Optional Telegram user's last name
 * @returns An object containing the user's name and email for use as onBehalfOf information
 */
export async function getOrCreateUser(
    telegramUserId: number, 
    username?: string, 
    firstName?: string, 
    lastName?: string
): Promise<OnBehalfOfUser> {
    try {
        // First, check if we already have this user in our database
        const existingUser = await BotsStore.getUserByTelegramId(telegramUserId);
        if (existingUser) {
            // Generate the current best display name with available data
            const currentBestName = createUserDisplayName(telegramUserId, username, firstName, lastName);
            
            // Check if we should update the stored name (if we have better info now)
            // IMPORTANT: Username format affects webhook server platform detection
            // See: https://github.com/wgtechlabs/unthread-webhook-server/blob/main/src/services/webhookService.ts#L118-L144
            const shouldUpdateName = existingUser.unthreadName !== currentBestName && 
                                   (currentBestName.includes('@') || // We now have username
                                    (currentBestName.includes(' ') && !existingUser.unthreadName?.includes(' ')) || // We now have full name vs partial
                                    existingUser.unthreadName?.startsWith('User ')); // Old fallback format
            
            if (shouldUpdateName) {
                // Update the stored user with better name information
                const updatedUserData: Partial<UserData> = {
                    unthreadName: currentBestName,
                    updatedAt: new Date().toISOString()
                };
                
                // Update optional fields if provided
                if (username) {
                    updatedUserData.telegramUsername = username;
                    updatedUserData.username = username;
                }
                if (firstName) {
                    updatedUserData.firstName = firstName;
                }
                if (lastName) {
                    updatedUserData.lastName = lastName;
                }
                
                await BotsStore.updateUser(telegramUserId, updatedUserData);
                
                LogEngine.info('Updated existing user with better display name', {
                    telegramUserId: existingUser.telegramUserId,
                    oldName: existingUser.unthreadName,
                    newName: currentBestName,
                    username: username,
                    firstName: firstName,
                    lastName: lastName
                });
                
                return {
                    name: currentBestName,
                    email: existingUser.unthreadEmail
                };
            }
            
            LogEngine.info('Using existing user from database', {
                telegramUserId: existingUser.telegramUserId,
                unthreadName: existingUser.unthreadName,
                unthreadEmail: existingUser.unthreadEmail,
                hasEmail: !!existingUser.unthreadEmail
            });
            return {
                name: existingUser.unthreadName || `User ${existingUser.telegramUserId}`,
                email: existingUser.unthreadEmail // No fallback - can be undefined
            };
        }

        // Create new user data with proper name prioritization
        const unthreadName = createUserDisplayName(telegramUserId, username, firstName, lastName);

        // Store user in our database WITHOUT automatic email
        const userData: UserData = {
            id: `user_${telegramUserId}`,
            telegramUserId: telegramUserId,
            unthreadName: unthreadName,
            // unthreadEmail omitted - will be undefined by default
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (username) {
            userData.telegramUsername = username;
            userData.username = username;
        }
        
        if (firstName) {
            userData.firstName = firstName;
        }
        
        if (lastName) {
            userData.lastName = lastName;
        }
        
        await BotsStore.storeUser(userData);
        
        LogEngine.info('Created and stored new user with proper display name', {
            telegramUserId: telegramUserId,
            telegramUsername: username,
            firstName: firstName,
            lastName: lastName,
            unthreadName: unthreadName,
            unthreadEmail: 'undefined - will be set at interaction point'
        });

        return {
            name: unthreadName,
            email: undefined // No automatic email - will be collected at interaction point
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
 * Creates a customer name for Unthread by extracting the company name from a Telegram group chat title and prefixing it with "[Telegram]".
 *
 * @param groupChatTitle - The Telegram group chat title to extract the company name from
 * @returns The formatted customer name with a "[Telegram]" prefix
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
 * Customer Operations - API Integration Functions
 */

/**
 * Checks whether a customer exists in Unthread by customer ID.
 *
 * Returns an object indicating existence, with customer details if found, or an error message if not.
 *
 * @param customerId - The customer ID to check
 * @returns An object with `exists` (boolean), `customer` (if found), and `error` (if applicable)
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
                statusText: response.statusText,
                error: errorText
            });
            return {
                exists: false,
                error: `API error: ${response.status} ${response.statusText} - ${errorText}`
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
 * Retrieves detailed information for a customer from Unthread by customer ID.
 *
 * Returns the customer details if the customer exists, or null if not found or on error.
 *
 * @param customerId - The ID of the customer to retrieve
 * @returns The customer details, or null if the customer does not exist or an error occurs
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
 * Creates a new customer in Unthread with the given name and caches the result to prevent duplicate entries.
 *
 * @param customerName - The name to assign to the new customer
 * @returns The created customer object
 * @throws If the customer name is empty or the Unthread API request fails
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
            throw new Error(`Failed to create customer: ${response.status} ${response.statusText} - ${errorText}`);
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
 * Converts Unthread API or network errors into user-friendly messages based on the error type and operation.
 *
 * @param error - The error object encountered during the operation
 * @param operation - A description of the operation that failed
 * @returns A formatted, user-friendly error message describing the issue
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

/**
 * Unthread API Service
 * 
 * IMPORTANT: Username Format Integration with Webhook Server
 * =========================================================
 * 
 * This service's username formatting is critical for integration with the
 * unthread-webhook-server repository (https://github.com/wgtechlabs/unthread-webhook-server).
 * 
 * The webhook server validates usernames using platform detection logic in:
 * src/services/webhookService.ts (detectPlatformSource method)
 * 
 * WEBHOOK SERVER VALIDATION LOGIC:
 * --------------------------------
 * - If botName.startsWith('@') → Classified as 'telegram' platform
 * - If botName does NOT start with '@' → Classified as 'dashboard' origin
 * - Used for analytics, monitoring, and proper event routing
 * 
 * OUR USERNAME FORMAT REQUIREMENTS:
 * ---------------------------------
 * 1. "FirstName (@username)" → Detected as Telegram platform ✅
 * 2. "@username" → Detected as Telegram platform ✅  
 * 3. "User 123456" → Detected as Dashboard origin ✅
 * 
 * This ensures proper:
 * - Platform source detection in webhook logs
 * - Analytics and monitoring accuracy
 * - Event routing and classification
 * - Audit trail compliance
 * 
 * @see https://github.com/wgtechlabs/unthread-webhook-server/blob/main/src/services/webhookService.ts#L118-L144
 */

// Export the customer cache for potential use in other modules
export { customerCache };

/**
 * Downloads an attachment file from Unthread using the file download API.
 * 
 * This function handles downloading files from Unthread conversations with comprehensive
 * error handling, file validation, and memory management for safe processing.
 * 
 * @param conversationId - The Unthread conversation ID containing the file
 * @param fileId - The unique file identifier from the attachment metadata
 * @param expectedFileName - The expected filename for validation (optional but recommended)
 * @param maxSizeBytes - Maximum allowed file size in bytes (default: 50MB for Telegram compatibility)
 * @returns Promise<Buffer> containing the file data
 * @throws AttachmentProcessingError with specific error types for different failure scenarios
 * 
 * @example
 * ```typescript
 * try {
 *   const fileBuffer = await downloadAttachmentFromUnthread(
 *     'conv_123', 
 *     'file_456', 
 *     'document.pdf',
 *     50 * 1024 * 1024 // 50MB
 *   );
 *   // Process the file buffer...
 * } catch (error) {
 *   if (error instanceof AttachmentProcessingError) {
 *     // Handle specific attachment errors
 *   }
 * }
 * ```
 */
/**
 * Downloads an image attachment from Unthread using the proven fetch-based approach.
 * 
 * This function uses the working fetch pattern discovered through extensive testing.
 * It specifically targets image files and uses Unthread's file download API with
 * proper authentication and error handling.
 * 
 * @param fileId - The unique file identifier from the attachment metadata
 * @param teamId - The Slack team ID for the file (required for Unthread API)
 * @param expectedFileName - The expected filename for validation (optional)
 * @param thumbSize - Thumbnail size for images (default: 160px, max: 1024px)
 * @returns Promise<Buffer> containing the image data
 * @throws Error with specific error types for different failure scenarios
 */
export async function downloadUnthreadImage(
    fileId: string,
    teamId: string,
    expectedFileName?: string,
    thumbSize: number = 160
): Promise<Buffer> {
    
    LogEngine.info('Starting Unthread image download', {
        fileId,
        teamId,
        expectedFileName,
        thumbSize,
        method: 'fetch-based-proven-pattern'
    });

    try {
        // Validate inputs
        if (!fileId || !teamId) {
            throw new Error('fileId and teamId are required for Unthread image download');
        }

        if (!UNTHREAD_API_KEY) {
            throw new Error('UNTHREAD_API_KEY environment variable is not set');
        }

        // Use the proven working endpoint and pattern from context
        const endpoint = `${API_BASE_URL}/slack/files/${fileId}/thumb`;
        const params = new URLSearchParams({ 
            thumbSize: thumbSize.toString(), 
            teamId: teamId 
        });

        LogEngine.debug('Making Unthread API request', {
            endpoint,
            params: Object.fromEntries(params.entries()),
            hasApiKey: !!UNTHREAD_API_KEY
        });

        // Use fetch API (proven to work, unlike Axios)
        const response = await fetch(`${endpoint}?${params}`, {
            headers: {
                'X-API-KEY': UNTHREAD_API_KEY,
                'Accept': 'application/octet-stream'
            }
        });

        LogEngine.debug('Received Unthread API response', {
            fileId,
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length'),
            ok: response.ok
        });

        if (!response.ok) {
            throw new Error(`Unthread API error: ${response.status} ${response.statusText}`);
        }

        // Convert to blob and then to buffer (proven pattern)
        const blob = await response.blob();
        const buffer = Buffer.from(await blob.arrayBuffer());

        // Validate the downloaded content
        if (buffer.length === 0) {
            throw new Error('Downloaded file is empty');
        }

        // Image-specific validation
        const contentType = response.headers.get('content-type') || 'unknown';
        if (!contentType.startsWith('image/')) {
            LogEngine.warn('Downloaded file may not be an image', {
                fileId,
                contentType,
                expectedFileName
            });
        }

        // Size validation (Telegram limit is 10MB for photos)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (buffer.length > maxSize) {
            throw new Error(`Image too large: ${buffer.length} bytes (max: ${maxSize})`);
        }

        LogEngine.info('Unthread image download successful', {
            fileId,
            size: buffer.length,
            contentType,
            expectedFileName
        });

        return buffer;

    } catch (error) {
        const err = error as Error;
        LogEngine.error('Unthread image download failed', {
            fileId,
            teamId,
            expectedFileName,
            error: err.message,
            stack: err.stack
        });
        throw error;
    }
}

/**
 * @deprecated Use downloadUnthreadImage for image files specifically
 * Legacy function maintained for backward compatibility
 */
export async function downloadAttachmentFromUnthread(
    conversationId: string,
    fileId: string,
    expectedFileName?: string
): Promise<Buffer> {
    
    LogEngine.warn('downloadAttachmentFromUnthread called - redirecting to image-specific function', {
        conversationId,
        fileId,
        expectedFileName,
        recommendation: 'Use downloadUnthreadImage for better image handling'
    });
    
    throw new Error(
        'This function is deprecated. Use downloadUnthreadImage() for image files. ' +
        'Generic file download is not implemented - images only for this release.'
    );
}

/**
 * Sends a message with file attachments to an existing Unthread conversation using multipart/form-data.
 *
 * @param params - Contains the conversation ID, message content, user information, and file paths.
 * @returns The API response for the sent message with attachments.
 * @throws If the API request fails or file paths are invalid.
 */
export async function sendMessageWithAttachments(params: SendMessageWithAttachmentsParams): Promise<any> {
    try {
        LogEngine.info('Sending message with attachments to Unthread', {
            conversationId: params.conversationId,
            fileCount: params.filePaths.length,
            onBehalfOf: params.onBehalfOf.name
        });

        return await sendMessageMultipart(params);
    } catch (error) {
        LogEngine.error('Error sending message with attachments', {
            error: (error as Error).message,
            conversationId: params.conversationId,
            fileCount: params.filePaths.length
        });
        throw error;
    }
}

/**
 * Creates a ticket with file attachments using memory buffers and multipart/form-data.
 * This version accepts file buffers directly instead of file paths, making it ideal
 * for integration with the AttachmentHandler's buffer-based approach.
 *
 * @param params - Contains ticket data and file buffers for attachments.
 * @returns The ticket creation response with ID and friendly ID.
 * @throws If the API request fails or buffer processing fails.
 */
export async function createTicketWithBufferAttachments(params: CreateTicketWithBufferAttachmentsParams): Promise<CreateTicketResponse> {
    try {
        LogEngine.info('Creating ticket with buffer attachments in Unthread', {
            groupChatName: params.groupChatName,
            customerId: params.customerId,
            fileCount: params.attachments.length,
            onBehalfOf: params.onBehalfOf.name,
            implementation: 'buffer-based'
        });

        return await createTicketMultipartBuffer(params);
    } catch (error) {
        LogEngine.error('Error creating ticket with buffer attachments', {
            error: (error as Error).message,
            groupChatName: params.groupChatName,
            customerId: params.customerId,
            fileCount: params.attachments.length
        });
        throw error;
    }
}

/**
 * Internal method to send a message with attachments using multipart/form-data.
 *
 * @param params - Message parameters with file paths.
 * @returns The response data from the Unthread API.
 * @throws If the API request fails or files cannot be read.
 */
async function sendMessageMultipart(params: SendMessageWithAttachmentsParams): Promise<any> {
    const { conversationId, message, onBehalfOf, filePaths } = params;

    // Create form data
    const form = new FormData();

    // Add the message payload as JSON
    const messagePayload = {
        body: {
            type: "markdown",
            value: message
        },
        onBehalfOf: onBehalfOf
    };

    form.append('json', JSON.stringify(messagePayload));

    // Add each file to the form using buffer-based approach
    for (const filePath of filePaths) {
        if (!fs.existsSync(filePath)) {
            LogEngine.warn('File not found, skipping attachment', { filePath });
            continue;
        }

        const fileName = path.basename(filePath);
        const fileBuffer = fs.readFileSync(filePath);
        form.append('attachments', fileBuffer, fileName);
        
        LogEngine.debug('Added file to multipart form', { fileName, filePath, size: fileBuffer.length });
    }

    // Send request to Unthread
    const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
            'X-API-KEY': UNTHREAD_API_KEY!,
            ...form.getHeaders()
        },
        body: form
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send message with attachments: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json() as any;
    
    LogEngine.info('Message with attachments sent successfully', {
        conversationId,
        messageId: result.ts || 'unknown',
        fileCount: filePaths.length
    });

    return result;
}

/**
 * Internal method to create a ticket with buffer attachments using the proven two-step approach.
 * Step 1: Create ticket using JSON (reliable)
 * Step 2: Send attachment as message to the created conversation (reliable)
 * This ensures attachments are always visible in the Unthread dashboard.
 *
 * @param params - Ticket creation parameters with file buffers.
 * @returns The ticket creation response.
 * @throws If the API request fails or buffer processing fails.
 */
async function createTicketMultipartBuffer(params: CreateTicketWithBufferAttachmentsParams): Promise<CreateTicketResponse> {
    const { groupChatName, summary, customerId, onBehalfOf, attachments } = params;

    LogEngine.info('Creating ticket with buffer attachments using two-step approach', {
        groupChatName,
        customerId,
        fileCount: attachments.length,
        onBehalfOf: onBehalfOf.name,
        implementation: 'two-step-approach'
    });

    try {
        // STEP 1: Create the ticket using proven JSON approach
        const customerCompanyName = extractCustomerCompanyName(groupChatName);
        const title = `[Telegram Ticket] ${customerCompanyName}`;
        
        // Ensure summary is not empty
        const ticketSummary = summary && summary.trim() ? summary.trim() : 'File attachment submitted via Telegram';
        
        LogEngine.debug('Step 1: Creating ticket with JSON approach', {
            title,
            summary: ticketSummary,
            customerId,
            attachmentCount: attachments.length
        });

        // Create ticket using the working JSON method
        const ticket = await createTicketJSON({ 
            title, 
            summary: ticketSummary, 
            customerId, 
            onBehalfOf 
        });

        LogEngine.info('Step 1 completed: Ticket created successfully', {
            ticketId: ticket.id,
            friendlyId: ticket.friendlyId
        });

        // STEP 2: Send attachments as message to the created conversation
        if (attachments.length > 0) {
            LogEngine.debug('Step 2: Sending attachments as message to conversation', {
                conversationId: ticket.id,
                attachmentCount: attachments.length
            });

            // Create FormData for message with attachments
            const form = new FormData();

            // Add message payload - make it appear as a natural customer message
            const attachmentNames = attachments.map(att => att.filename).join(', ');
            const messagePayload = {
                body: {
                    type: "markdown",
                    value: `*Attachment${attachments.length > 1 ? 's' : ''} shared:* ${attachmentNames}`
                },
                onBehalfOf: onBehalfOf
            };

            LogEngine.debug('Step 2: Message payload for attachment', {
                conversationId: ticket.id,
                onBehalfOfName: onBehalfOf.name,
                onBehalfOfEmail: onBehalfOf.email,
                messageContent: messagePayload.body.value
            });

            // Use correct field names per API documentation
            form.append('json', JSON.stringify(messagePayload));

            // Add each attachment buffer
            for (const attachment of attachments) {
                form.append('attachments', attachment.buffer, attachment.filename);
                
                LogEngine.debug('Added attachment to message form', { 
                    fileName: attachment.filename, 
                    size: attachment.buffer.length,
                    mimeType: attachment.mimeType 
                });
            }

            // Send message with attachments to the conversation
            const messageResponse = await fetch(`${API_BASE_URL}/conversations/${ticket.id}/messages`, {
                method: 'POST',
                headers: {
                    'X-API-KEY': UNTHREAD_API_KEY!,
                    ...form.getHeaders()
                },
                body: form
            });

            if (!messageResponse.ok) {
                const errorText = await messageResponse.text();
                LogEngine.error('Step 2 failed: Could not send attachments as message', {
                    status: messageResponse.status,
                    statusText: messageResponse.statusText,
                    errorText,
                    conversationId: ticket.id,
                    attachmentCount: attachments.length
                });
                // Don't throw here - ticket was created successfully, just log the attachment failure
                LogEngine.warn('Ticket created but attachments could not be sent as follow-up message', {
                    ticketId: ticket.id,
                    friendlyId: ticket.friendlyId
                });
            } else {
                const messageResult = await messageResponse.json() as any;
                LogEngine.info('Step 2 completed: Attachments sent successfully as message', {
                    conversationId: ticket.id,
                    messageId: messageResult.ts || messageResult.id || 'unknown',
                    attachmentCount: attachments.length
                });
            }
        }

        LogEngine.info('Two-step ticket creation with buffer attachments completed successfully', {
            ticketId: ticket.id,
            friendlyId: ticket.friendlyId,
            fileCount: attachments.length,
            implementation: 'two-step-approach-success'
        });

        return ticket;

    } catch (error) {
        LogEngine.error('Failed to create ticket with buffer attachments using two-step approach', {
            error: (error as Error).message,
            groupChatName,
            customerId,
            attachmentCount: attachments.length,
            implementation: 'two-step-approach-error'
        });
        throw error;
    }
}
