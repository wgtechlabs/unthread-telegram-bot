/**
 * Simplified Global Template System
 * 
 * This replaces the over-engineered per-group template system with a simple
 * global configuration for 3 essential events that all groups will use.
 */

export interface GlobalTemplate {
  event: GlobalTemplateEvent;
  content: string;
  enabled: boolean;
  lastModifiedBy?: number | undefined;
  lastModifiedAt?: string | undefined;
}

export type GlobalTemplateEvent = 
  | 'ticket_created'    // When a new support ticket is created
  | 'agent_response'    // When an agent responds to a ticket
  | 'ticket_status';    // When a ticket status changes (open, in progress, resolved, etc.)

export interface GlobalTemplateConfig {
  templates: {
    ticket_created: GlobalTemplate;
    agent_response: GlobalTemplate;
    ticket_status: GlobalTemplate;
  };
  version: number;
  lastUpdated: string;
}

// Default templates
export const DEFAULT_GLOBAL_TEMPLATES: GlobalTemplateConfig = {
  templates: {
    ticket_created: {
      event: 'ticket_created',
      content: '✅ **Support Ticket Created!**\n\n' +
               '**Ticket #{{ticketNumber}}**\n' +
               '**Issue:** {{summary}}\n\n' +
               ' **Next Steps:**\n' +
               '• Our support team will review your ticket\n' +
               '• Reply to this message to add more details or updates to your ticket\n\n' +
               '*Thank you for contacting support!*',
      enabled: true
    },
    agent_response: {
      event: 'agent_response',
      content: '💬 **Response from {{agentName}}**\n\n' +
               '{{response}}\n\n' +
               '**Ticket #{{ticketNumber}}**\n' +
               '**Status:** {{status}}\n\n' +
               'Please reply here to reply to the ticket number **{{ticketNumber}}**.',
      enabled: true
    },
    ticket_status: {
      event: 'ticket_status',
      content: '📋 **Ticket Status Update**\n\n' +
               '**Ticket #{{ticketNumber}}**\n' +
               '**Summary:** {{summary}}\n' +
               '**Status:** {{status}}\n' +
               '**Updated by:** {{agentName}}\n\n' +
               'Your ticket status has been updated. We\'ll keep you informed of any further changes.',
      enabled: true
    }
  },
  version: 1,
  lastUpdated: new Date().toISOString()
};

// Available variables for templates
export const TEMPLATE_VARIABLES = {
  // Core variables available to all templates
  core: [
    { name: 'ticketNumber', description: 'User-friendly ticket identifier', example: 'TKT-445' },
    { name: 'friendlyId', description: 'Alternative name for ticketNumber (backward compatibility)', example: 'TKT-445' },
    { name: 'conversationId', description: 'Internal UUID for webhook events (advanced use)', example: '18c3e146-4f9f-4587-a690-35f73717dbc4' },
    { name: 'summary', description: 'Ticket summary/title', example: 'Login issue with mobile app' },
    { name: 'customerName', description: 'Customer or user name', example: 'John Doe' },
    { name: 'status', description: 'Current ticket status', example: 'Open, In Progress, Resolved' }
  ],
  // Agent-specific variables
  agent: [
    { name: 'agentName', description: 'Name of the responding agent', example: 'Sarah Johnson' },
    { name: 'response', description: 'Agent response content', example: 'Thanks for reaching out...' }
  ],
  // Time variables
  time: [
    { name: 'createdAt', description: 'When ticket was created', example: '2025-01-15 14:30' },
    { name: 'updatedAt', description: 'Last update time', example: '2025-01-15 15:45' }
  ]
};
