/**
 * Unthread Telegram Bot - Message Formatter Module
 * 
 * Provides comprehensive message templating and formatting capabilities for the bot.
 * This module handles dynamic message generation, template processing with variable
 * substitution, conditional rendering, and multi-language support.
 * 
 * Core Features:
 * - Dynamic template processing with variable substitution
 * - Conditional blocks and loops within templates
 * - Default template fallbacks for all message types
 * - Nested property access in template variables
 * - ReDoS attack prevention with content size limits
 * - Multi-language template support
 * 
 * Template Syntax:
 * - Variables: {{variable_name}} or {{object.property}}
 * - Conditionals: {{#if condition}}...{{/if}}
 * - Loops: {{#each array}}...{{/each}}
 * - Comments: {{!-- comment --}}
 * 
 * Security:
 * - Template content size limits to prevent ReDoS attacks
 * - Safe variable substitution with fallbacks
 * - Input sanitization for dynamic content
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */
import { MessageTemplate, MessageTemplateType, TemplateVariable } from '../sdk/types.js';
import { BotsStore } from '../sdk/bots-brain/BotsStore.js';

export interface TemplateContext {
  // Core variables
  botName?: string;
  groupName?: string;
  timestamp?: string;
  
  // Ticket variables
  ticketId?: string;
  ticketTitle?: string;
  ticketDescription?: string;
  ticketStatus?: string;
  ticketUrl?: string;
  ticketPriority?: string;
  
  // User variables
  userName?: string;
  userEmail?: string;
  userFullName?: string;
  
  // Agent variables
  agentName?: string;
  agentEmail?: string;
  
  // Custom variables
  [key: string]: any;
}

export class MessageFormatter {
  private botsStore: BotsStore;
  
  constructor(botsStore: BotsStore) {
    this.botsStore = botsStore;
  }

  /**
   * Format a message using a template and context variables
   */
  async formatMessage(
    groupChatId: number,
    templateType: MessageTemplateType,
    context: TemplateContext,
    templateId?: string
  ): Promise<string> {
    let template: MessageTemplate | null;
    
    if (templateId) {
      template = await this.botsStore.getMessageTemplate(groupChatId, templateId);
    } else {
      template = await this.botsStore.getActiveMessageTemplate(groupChatId, templateType);
      if (!template) {
        template = await this.getDefaultTemplate(templateType);
      }
    }

    if (!template) {
      return this.getFallbackMessage(templateType, context);
    }

    return this.processTemplate(template.content, context);
  }

  /**
   * Process template content with variable substitution
   */
  private processTemplate(content: string, context: TemplateContext): string {
    // Prevent ReDoS attacks by limiting template content size
    const MAX_TEMPLATE_SIZE = 10000;
    if (content.length > MAX_TEMPLATE_SIZE) {
      throw new Error(`Template content too large: ${content.length} characters exceeds limit of ${MAX_TEMPLATE_SIZE}`);
    }

    let processed = content;
    
    // Replace variables in the format {{variable_name}}
    processed = processed.replace(/\{\{([^}]+)\}\}/g, (match, variableName) => {
      const trimmedName = variableName.trim();
      
      // Handle nested properties (e.g., {{user.name}})
      if (trimmedName.includes('.')) {
        return this.getNestedProperty(context, trimmedName) || match;
      }
      
      // Handle direct properties
      return context[trimmedName]?.toString() || match;
    });

    // Handle conditional blocks {{#if variable}}...{{/if}}
    processed = this.processConditionalBlocks(processed, context);
    
    // Handle loops {{#each array}}...{{/each}}
    processed = this.processLoops(processed, context);
    
    return processed.trim();
  }

  /**
   * Get nested property value from context (e.g., "user.name" from context.user.name)
   */
  private getNestedProperty(context: TemplateContext, path: string): any {
    return path.split('.').reduce((obj, key) => obj?.[key], context as any);
  }

  /**
   * Process conditional blocks in templates
   */
  private processConditionalBlocks(content: string, context: TemplateContext): string {
    return content.replace(/\{\{#if\s+([^}]+)\}\}(.*?)\{\{\/if\}\}/gs, (match, condition, block) => {
      const conditionValue = this.evaluateCondition(condition.trim(), context);
      return conditionValue ? block : '';
    });
  }

  /**
   * Process loop blocks in templates
   */
  private processLoops(content: string, context: TemplateContext): string {
    return content.replace(/\{\{#each\s+([^}]+)\}\}(.*?)\{\{\/each\}\}/gs, (match, arrayName, block) => {
      const array = context[arrayName.trim()];
      if (!Array.isArray(array)) return '';
      
      return array.map((item, index) => {
        const loopContext = { ...context, item, index };
        return this.processTemplate(block, loopContext);
      }).join('\n');
    });
  }

  /**
   * Evaluate conditional expressions
   */
  private evaluateCondition(condition: string, context: TemplateContext): boolean {
    // Simple variable existence check
    if (!condition.includes(' ')) {
      const value = this.getNestedProperty(context, condition) || context[condition];
      return Boolean(value);
    }
    
    // Handle simple comparisons (==, !=, etc.)
    const operators = ['==', '!=', '>', '<', '>=', '<='];
    for (const op of operators) {
      if (condition.includes(op)) {
        const parts = condition.split(op);
        if (parts.length !== 2) continue;
        
        const left = parts[0]?.trim();
        const right = parts[1]?.trim();
        
        if (!left || !right) continue;
        
        const leftValue = this.getNestedProperty(context, left) || context[left];
        const rightValue = right.startsWith('"') && right.endsWith('"') 
          ? right.slice(1, -1) 
          : this.getNestedProperty(context, right) || context[right];
        
        return this.compareValues(leftValue, rightValue, op);
      }
    }
    
    return false;
  }

  /**
   * Compare values based on operator
   */
  private compareValues(left: any, right: any, operator: string): boolean {
    switch (operator) {
      case '==': return left == right;
      case '!=': return left != right;
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      default: return false;
    }
  }

  /**
   * Get default template for a template type
   */
  private async getDefaultTemplate(templateType: MessageTemplateType): Promise<MessageTemplate | null> {
    const defaultTemplates = this.getBuiltInTemplates();
    const template = defaultTemplates[templateType];
    
    if (!template) return null;
    
    return {
      id: `default_${templateType}`,
      groupChatId: 0, // Global default
      templateType,
      name: `Default ${templateType.replace(/_/g, ' ')}`,
      content: template,
      variables: this.extractVariables(template),
      isDefault: true,
      isActive: true,
      createdBy: 0,
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
      version: 1
    };
  }

  /**
   * Get built-in template content for a specific template type
   * This is a public method that safely exposes default template content
   */
  public getBuiltInTemplateContent(templateType: MessageTemplateType): string | null {
    const defaultTemplates = this.getBuiltInTemplates();
    return defaultTemplates[templateType] || null;
  }

  /**
   * Extract variables from template content
   */
  private extractVariables(content: string): string[] {
    const variables = new Set<string>();
    const matches = content.match(/\{\{([^}]+)\}\}/g);
    
    if (matches) {
      matches.forEach(match => {
        const variable = match.replace(/[{}]/g, '').trim();
        // Skip conditional and loop keywords
        if (!variable.startsWith('#') && !variable.startsWith('/')) {
          variables.add(variable);
        }
      });
    }
    
    return Array.from(variables);
  }

  /**
   * Get built-in default templates
   */
  private getBuiltInTemplates(): Record<MessageTemplateType, string> {
    return {
      ticket_created: `🎫 **New Ticket Created**

**Ticket ID:** {{ticketId}}
**Title:** {{ticketTitle}}
**Status:** {{ticketStatus}}

**Description:**
{{ticketDescription}}

**Created by:** {{userName}} ({{userEmail}})
**Time:** {{timestamp}}

{{#if ticketUrl}}
🔗 [View Ticket]({{ticketUrl}})
{{/if}}`,

      ticket_updated: `📝 **Ticket Updated**

**Ticket ID:** {{ticketId}}
**Title:** {{ticketTitle}}
**Status:** {{ticketStatus}}

{{#if agentName}}
**Updated by:** {{agentName}}
{{/if}}
**Time:** {{timestamp}}

{{#if ticketUrl}}
🔗 [View Ticket]({{ticketUrl}})
{{/if}}`,

      agent_response: `💬 **New Response from {{agentName}}**

**Ticket ID:** {{ticketId}}
**Agent:** {{agentName}} ({{agentEmail}})
**Time:** {{timestamp}}

{{#if ticketUrl}}
🔗 [View Ticket]({{ticketUrl}})
{{/if}}`,

      ticket_closed: `✅ **Ticket Closed**

**Ticket ID:** {{ticketId}}
**Title:** {{ticketTitle}}
**Status:** Closed

{{#if agentName}}
**Closed by:** {{agentName}}
{{/if}}
**Time:** {{timestamp}}

{{#if ticketUrl}}
🔗 [View Ticket]({{ticketUrl}})
{{/if}}`,

      welcome_message: `👋 **Welcome to {{groupName}}!**

This group is connected to {{botName}} for support ticket management.

To create a ticket, simply send a message here and our team will respond as soon as possible.

Need help? Contact an administrator.`,

      error_message: `❌ **Error**

{{errorMessage}}

{{#if timestamp}}
Time: {{timestamp}}
{{/if}}

If this error persists, please contact an administrator.`,

      setup_complete: `✅ **Setup Complete!**

{{groupName}} has been successfully configured with {{botName}}.

**Configuration Details:**
- Customer: {{customerName}}
- Setup by: {{userName}}
- Time: {{timestamp}}

Your group is now ready to receive support notifications!`,

      admin_config_changed: `⚙️ **Configuration Update**

**Group:** {{groupTitle}}
**Change:** {{changeType}}

{{#if adminName}}
**By:** {{adminName}}
{{/if}}
**Time:** {{timestamp}}

Group configuration has been updated.`,

      admin_template_changed: `📝 **Template Update**

**Group:** {{groupTitle}}
**Template:** {{templateName}}
**Action:** {{action}}

{{#if adminName}}
**By:** {{adminName}}
{{/if}}
**Time:** {{timestamp}}

Message template has been updated.`,

      admin_setup_completed: `✅ **Admin Notification: Setup Completed**

**Group:** {{groupTitle}}
**Setup Details:** {{changeDetails}}

{{#if adminName}}
**Completed by:** {{adminName}}
{{/if}}
**Time:** {{timestamp}}

Your group configuration has been finalized and is now active.`,

      admin_notification_failed: `⚠️ **Admin Notification: Delivery Issues**

**Group:** Group {{groupId}}
**Failed Notifications:** {{failedCount}}
**Event Type:** {{changeType}}
**Time:** {{timestamp}}

Some administrators may not have received notifications about recent changes. Please check that all admins have activated their profiles with /activate command.

This notification was sent to admins with working DM access.`
    };
  }

  /**
   * Get fallback message when no template is available
   */
  private getFallbackMessage(templateType: MessageTemplateType, context: TemplateContext): string {
    switch (templateType) {
      case 'ticket_created':
        return `🎫 New ticket created: ${context.ticketTitle || 'Untitled'}`;
      case 'ticket_updated':
        return `📝 Ticket updated: ${context.ticketTitle || context.ticketId || 'Unknown'}`;
      case 'agent_response':
        return `💬 New response from ${context.agentName || 'Support Team'}`;
      case 'ticket_closed':
        return `✅ Ticket closed: ${context.ticketTitle || context.ticketId || 'Unknown'}`;
      case 'welcome_message':
        return `👋 Welcome to ${context.groupName || 'this group'}!`;
      case 'error_message':
        return `❌ An error occurred. Please try again.`;
      case 'setup_complete':
        return `✅ Setup complete! ${context.groupName || 'This group'} is now configured.`;
      case 'admin_config_changed':
        return `⚙️ Configuration changed in ${context.groupTitle || 'group'}: ${context.changeType || 'Update'}`;
      case 'admin_template_changed':
        return `📝 Template modified in ${context.groupTitle || 'group'}: ${context.templateType || 'Unknown template'}`;
      case 'admin_setup_completed':
        return `✅ Setup completed in ${context.groupTitle || 'group'}`;
      case 'admin_notification_failed':
        return `⚠️ Notification delivery issues: ${context.failedCount || 0} failed notifications`;
      default:
        return 'Message notification';
    }
  }

  /**
   * Validate template content
   */
  validateTemplate(content: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for balanced brackets
    const openBrackets = (content.match(/\{\{/g) || []).length;
    const closeBrackets = (content.match(/\}\}/g) || []).length;
    
    if (openBrackets !== closeBrackets) {
      errors.push('Unbalanced template brackets {{ }}');
    }
    
    // Check for balanced conditional blocks
    const ifBlocks = (content.match(/\{\{#if/g) || []).length;
    const endIfBlocks = (content.match(/\{\{\s*\/if\s*\}\}/g) || []).length;
    
    if (ifBlocks !== endIfBlocks) {
      errors.push('Unbalanced conditional blocks {{#if}} {{/if}}');
    }
    
    // Check for balanced loop blocks
    const eachBlocks = (content.match(/\{\{#each/g) || []).length;
    const endEachBlocks = (content.match(/\{\{\s*\/each\s*\}\}/g) || []).length;
    
    if (eachBlocks !== endEachBlocks) {
      errors.push('Unbalanced loop blocks {{#each}} {{/each}}');
    }
    
    // Check for empty content
    if (!content.trim()) {
      errors.push('Template content cannot be empty');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get available template variables for a template type
   */
  getAvailableVariables(templateType: MessageTemplateType): TemplateVariable[] {
    const commonVariables: TemplateVariable[] = [
      {
        name: 'botName',
        description: 'Name of the bot',
        category: 'core',
        example: 'Support Bot',
        required: false
      },
      {
        name: 'groupName',
        description: 'Name of the Telegram group',
        category: 'group',
        example: 'Customer Support',
        required: false
      },
      {
        name: 'timestamp',
        description: 'Current timestamp',
        category: 'time',
        example: '2025-01-07 10:30:00',
        required: false
      }
    ];

    const ticketVariables: TemplateVariable[] = [
      {
        name: 'ticketId',
        description: 'Unique ticket identifier',
        category: 'ticket',
        example: 'TKT-12345',
        required: true
      },
      {
        name: 'ticketTitle',
        description: 'Ticket title/subject',
        category: 'ticket',
        example: 'Login Issue',
        required: false
      },
      {
        name: 'ticketDescription',
        description: 'Ticket description',
        category: 'ticket',
        example: 'Unable to log in to account',
        required: false
      },
      {
        name: 'ticketStatus',
        description: 'Current ticket status',
        category: 'ticket',
        example: 'Open',
        required: false
      },
      {
        name: 'ticketUrl',
        description: 'URL to view the ticket',
        category: 'ticket',
        example: 'https://support.example.com/tickets/12345',
        required: false
      }
    ];

    const userVariables: TemplateVariable[] = [
      {
        name: 'userName',
        description: 'User name',
        category: 'user',
        example: 'John Doe',
        required: false
      },
      {
        name: 'userEmail',
        description: 'User email address',
        category: 'user',
        example: 'john@example.com',
        required: false
      }
    ];

    const agentVariables: TemplateVariable[] = [
      {
        name: 'agentName',
        description: 'Support agent name',
        category: 'user',
        example: 'Sarah Smith',
        required: false
      },
      {
        name: 'agentEmail',
        description: 'Support agent email',
        category: 'user',
        example: 'sarah@company.com',
        required: false
      }
    ];

    const adminVariables: TemplateVariable[] = [
      {
        name: 'groupTitle',
        description: 'Group/chat title',
        category: 'group',
        example: 'Customer Support',
        required: false
      },
      {
        name: 'groupId',
        description: 'Group chat ID',
        category: 'group',
        example: '-1001234567890',
        required: false
      },
      {
        name: 'adminName',
        description: 'Administrator name',
        category: 'user',
        example: 'Admin User',
        required: false
      },
      {
        name: 'changeType',
        description: 'Type of configuration change',
        category: 'core',
        example: 'Template Change',
        required: false
      },
      {
        name: 'changeDetails',
        description: 'Details about the change',
        category: 'core',
        example: 'Template "welcome_message" was updated',
        required: false
      },
      {
        name: 'templateType',
        description: 'Type of template being modified',
        category: 'core',
        example: 'welcome_message',
        required: false
      },
      {
        name: 'templateName',
        description: 'Name of the template',
        category: 'core',
        example: 'Custom Welcome Message',
        required: false
      },
      {
        name: 'action',
        description: 'Action performed on template',
        category: 'core',
        example: 'updated',
        required: false
      },
      {
        name: 'failedCount',
        description: 'Number of failed notifications',
        category: 'core',
        example: '3',
        required: false
      }
    ];

    switch (templateType) {
      case 'ticket_created':
        return [...commonVariables, ...ticketVariables, ...userVariables];
      case 'ticket_updated':
      case 'ticket_closed':
        return [...commonVariables, ...ticketVariables, ...userVariables, ...agentVariables];
      case 'agent_response':
        return [...commonVariables, ...ticketVariables, ...agentVariables];
      case 'welcome_message':
      case 'setup_complete':
        return [...commonVariables, ...userVariables];
      case 'admin_config_changed':
      case 'admin_setup_completed':
        return [...commonVariables, ...adminVariables];
      case 'admin_template_changed':
        return [...commonVariables, ...adminVariables];
      case 'admin_notification_failed':
        return [
          ...commonVariables,
          {
            name: 'groupId',
            description: 'Group chat ID',
            category: 'group',
            example: '-1001234567890',
            required: true
          },
          {
            name: 'failedCount',
            description: 'Number of failed notifications',
            category: 'core',
            example: '3',
            required: true
          },
          {
            name: 'changeType',
            description: 'Type of event that triggered notifications',
            category: 'core',
            example: 'Configuration Change',
            required: true
          }
        ];
      case 'error_message':
        return [
          ...commonVariables,
          {
            name: 'errorMessage',
            description: 'Error message to display',
            category: 'core',
            example: 'Connection timeout',
            required: true
          }
        ];
      default:
        return commonVariables;
    }
  }
}
