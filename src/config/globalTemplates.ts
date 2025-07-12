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
  | 'ticket_closed';    // When a ticket is resolved/closed

export interface GlobalTemplateConfig {
  templates: {
    ticket_created: GlobalTemplate;
    agent_response: GlobalTemplate;
    ticket_closed: GlobalTemplate;
  };
  version: number;
  lastUpdated: string;
}

// Default templates
export const DEFAULT_GLOBAL_TEMPLATES: GlobalTemplateConfig = {
  templates: {
    ticket_created: {
      event: 'ticket_created',
      content: '🎫 **New Support Ticket Created**\n\n' +
               '**Ticket ID:** {{ticketId}}\n' +
               '**Summary:** {{summary}}\n' +
               '**Created by:** {{customerName}}\n' +
               '**Status:** Open\n\n' +
               'Our team will respond shortly. Thank you for contacting us!',
      enabled: true
    },
    agent_response: {
      event: 'agent_response',
      content: '💬 **Response from {{agentName}}**\n\n' +
               '{{response}}\n\n' +
               '**Ticket ID:** {{ticketId}}\n' +
               '**Status:** {{status}}',
      enabled: true
    },
    ticket_closed: {
      event: 'ticket_closed',
      content: '✅ **Ticket Resolved**\n\n' +
               '**Ticket ID:** {{ticketId}}\n' +
               '**Summary:** {{summary}}\n' +
               '**Resolved by:** {{agentName}}\n\n' +
               'Thank you for using our support! If you need further assistance, feel free to create a new ticket.',
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
    { name: 'ticketId', description: 'Unique ticket identifier', example: 'TKT-12345' },
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
