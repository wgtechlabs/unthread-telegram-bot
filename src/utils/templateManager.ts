/**
 * Unthread Telegram Bot - Template Management Module
 * 
 * Provides comprehensive template management capabilities for the bot's messaging system.
 * This module handles creation, updating, activation, and management of message templates
 * used throughout the bot's communication workflows.
 * 
 * Core Features:
 * - Template creation with validation and variable extraction
 * - Template activation and deactivation management
 * - Default template handling and fallbacks
 * - Template content validation and syntax checking
 * - Integration with MessageFormatter for template processing
 * - Admin notification system for template changes
 * 
 * Template Types:
 * - Support ticket confirmations
 * - Agent response notifications
 * - Status update messages
 * - Error and information messages
 * - Custom communication templates
 * 
 * Security:
 * - Template content validation to prevent injection attacks
 * - Variable syntax verification
 * - Access control for template management operations
 * - Comprehensive logging for audit trails
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */
import { MessageTemplate, MessageTemplateType } from '../sdk/types.js';
import { BotsStore } from '../sdk/bots-brain/BotsStore.js';
import { MessageFormatter } from './messageFormatter.js';
import { LogEngine } from '@wgtechlabs/log-engine';

export interface TemplateCreationOptions {
  name: string;
  content: string;
  templateType: MessageTemplateType;
  groupChatId: number;
  createdBy: number;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface TemplateListOptions {
  groupChatId: number;
  templateType?: MessageTemplateType;
  includeInactive?: boolean;
  includeDefaults?: boolean;
}

export interface TemplateNotificationOptions {
  bot?: any;
  groupTitle?: string;
}

interface TemplateUpdateWithVariables extends Partial<Pick<MessageTemplate, 'name' | 'content' | 'isActive' | 'isDefault'>> {
  variables?: string[];
}

export class TemplateManager {
  private botsStore: BotsStore;
  private messageFormatter: MessageFormatter;

  constructor(botsStore: BotsStore) {
    this.botsStore = botsStore;
    this.messageFormatter = new MessageFormatter(botsStore);
  }

  /**
   * Create a new message template
   */
  async createTemplate(
    options: TemplateCreationOptions, 
    notificationOptions?: TemplateNotificationOptions
  ): Promise<{ success: boolean; template?: MessageTemplate; errors?: string[] }> {
    // Validate template content
    const validation = this.messageFormatter.validateTemplate(options.content);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }

    // Generate template ID
    const templateId = BotsStore.generateTemplateId(options.templateType, options.groupChatId);

    // Create template object
    const template: MessageTemplate = {
      id: templateId,
      groupChatId: options.groupChatId,
      templateType: options.templateType,
      name: options.name,
      content: options.content,
      variables: this.extractVariablesFromContent(options.content),
      isDefault: options.isDefault || false,
      isActive: options.isActive ?? true,
      createdBy: options.createdBy,
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
      version: 1
    };

    // If setting as default, unset existing defaults
    if (template.isDefault) {
      await this.unsetDefaultTemplate(options.groupChatId, options.templateType);
    }

    // Save template
    await this.botsStore.saveMessageTemplate(template);

    // Send admin notifications if bot instance provided
    if (notificationOptions?.bot) {
      try {
        const { notifyAdminsOfTemplateChange } = await import('./adminManager.js');
        await notifyAdminsOfTemplateChange(
          options.groupChatId,
          options.createdBy,
          options.templateType,
          'created',
          options.name,
          notificationOptions.bot,
          notificationOptions.groupTitle
        );
      } catch (notificationError) {
        // Don't fail template creation if notifications fail
        LogEngine.warn('Failed to send template creation notifications', {
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
          groupChatId: options.groupChatId,
          templateType: options.templateType,
          templateName: options.name,
          createdBy: options.createdBy,
          operation: 'template_creation'
        });
      }
    }

    return { success: true, template };
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    groupChatId: number,
    templateId: string,
    updates: TemplateUpdateWithVariables,
    updatedBy: number,
    notificationOptions?: TemplateNotificationOptions
  ): Promise<{ success: boolean; template?: MessageTemplate; errors?: string[] }> {
    // Get existing template for notifications
    const existing = await this.botsStore.getMessageTemplate(groupChatId, templateId);
    if (!existing) {
      return { success: false, errors: ['Template not found'] };
    }

    // Validate content if provided
    if (updates.content) {
      const validation = this.messageFormatter.validateTemplate(updates.content);
      if (!validation.isValid) {
        return { success: false, errors: validation.errors };
      }
      
      // Update variables if content changed - type-safe approach
      const updatesWithVariables: TemplateUpdateWithVariables = {
        ...updates,
        variables: this.extractVariablesFromContent(updates.content)
      };
      updates = updatesWithVariables;
    }

    // If setting as default, unset existing defaults
    if (updates.isDefault) {
      await this.unsetDefaultTemplate(groupChatId, existing.templateType);
    }

    // Update template
    const updated = await this.botsStore.updateMessageTemplate(groupChatId, templateId, updates);
    
    if (!updated) {
      return { success: false, errors: ['Failed to update template'] };
    }

    // Send admin notifications if bot instance provided
    if (notificationOptions?.bot) {
      try {
        const { notifyAdminsOfTemplateChange } = await import('./adminManager.js');
        await notifyAdminsOfTemplateChange(
          groupChatId,
          updatedBy,
          existing.templateType,
          'updated',
          existing.name,
          notificationOptions.bot,
          notificationOptions.groupTitle
        );
      } catch (notificationError) {
        // Don't fail template update if notifications fail
        LogEngine.warn('Failed to send template update notifications', {
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
          groupChatId,
          templateType: existing.templateType,
          templateName: existing.name,
          updatedBy,
          operation: 'template_update'
        });
      }
    }

    return { success: true, template: updated };
  }

  /**
   * Delete a template
   */
  async deleteTemplate(
    groupChatId: number, 
    templateId: string, 
    deletedBy: number,
    notificationOptions?: TemplateNotificationOptions
  ): Promise<{ success: boolean; errors?: string[] }> {
    const existing = await this.botsStore.getMessageTemplate(groupChatId, templateId);
    if (!existing) {
      return { success: false, errors: ['Template not found'] };
    }

    // Don't allow deletion of default templates
    if (existing.isDefault) {
      return { success: false, errors: ['Cannot delete default template. Set another template as default first.'] };
    }

    await this.botsStore.deleteMessageTemplate(groupChatId, templateId);

    // Send admin notifications if bot instance provided
    if (notificationOptions?.bot) {
      try {
        const { notifyAdminsOfTemplateChange } = await import('./adminManager.js');
        await notifyAdminsOfTemplateChange(
          groupChatId,
          deletedBy,
          existing.templateType,
          'deleted',
          existing.name,
          notificationOptions.bot,
          notificationOptions.groupTitle
        );
      } catch (notificationError) {
        // Don't fail template deletion if notifications fail
        LogEngine.warn('Failed to send template deletion notifications', {
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
          groupChatId,
          templateType: existing.templateType,
          templateName: existing.name,
          deletedBy,
          operation: 'template_deletion'
        });
      }
    }

    return { success: true };
  }

  /**
   * List templates with filtering options
   */
  async listTemplates(options: TemplateListOptions): Promise<MessageTemplate[]> {
    let templates: MessageTemplate[];

    if (options.templateType) {
      templates = await this.botsStore.getMessageTemplatesByType(options.groupChatId, options.templateType);
    } else {
      templates = await this.botsStore.getAllMessageTemplates(options.groupChatId);
    }

    // Apply filters
    if (!options.includeInactive) {
      templates = templates.filter(t => t.isActive);
    }

    if (!options.includeDefaults) {
      templates = templates.filter(t => !t.isDefault);
    }

    return templates;
  }

  /**
   * Set a template as the default for its type
   */
  async setDefaultTemplate(groupChatId: number, templateId: string): Promise<{ success: boolean; errors?: string[] }> {
    const template = await this.botsStore.getMessageTemplate(groupChatId, templateId);
    if (!template) {
      return { success: false, errors: ['Template not found'] };
    }

    const success = await this.botsStore.setDefaultTemplate(groupChatId, template.templateType, templateId);
    return success 
      ? { success: true } 
      : { success: false, errors: ['Failed to set default template'] };
  }

  /**
   * Get template preview with sample data
   */
  async getTemplatePreview(groupChatId: number, templateId: string): Promise<{ success: boolean; preview?: string; errors?: string[] }> {
    const template = await this.botsStore.getMessageTemplate(groupChatId, templateId);
    if (!template) {
      return { success: false, errors: ['Template not found'] };
    }

    // Generate sample context based on template type
    const sampleContext = this.generateSampleContext(template.templateType);
    
    try {
      const preview = await this.messageFormatter.formatMessage(
        groupChatId,
        template.templateType,
        sampleContext,
        templateId
      );
      return { success: true, preview };
    } catch (error) {
      return { success: false, errors: [`Preview error: ${error instanceof Error ? error.message : 'Unknown error'}`] };
    }
  }

  /**
   * Initialize default templates for a group
   */
  async initializeDefaultTemplates(groupChatId: number, createdBy: number): Promise<void> {
    const templateTypes: MessageTemplateType[] = [
      'ticket_created',
      'ticket_updated',
      'agent_response',
      'ticket_closed',
      'welcome_message',
      'error_message',
      'setup_complete'
    ];

    for (const templateType of templateTypes) {
      // Check if default template already exists
      const existing = await this.botsStore.getDefaultMessageTemplate(groupChatId, templateType);
      if (existing) continue;

      // Get built-in template content
      const builtInTemplate = await this.getBuiltInTemplate(templateType);
      if (!builtInTemplate) continue;

      // Create default template
      await this.createTemplate({
        name: `Default ${templateType.replace(/_/g, ' ')}`,
        content: builtInTemplate,
        templateType,
        groupChatId,
        createdBy,
        isDefault: true,
        isActive: true
      });
    }
  }

  /**
   * Clone a template
   */
  async cloneTemplate(
    groupChatId: number,
    templateId: string,
    newName: string,
    createdBy: number
  ): Promise<{ success: boolean; template?: MessageTemplate; errors?: string[] }> {
    const original = await this.botsStore.getMessageTemplate(groupChatId, templateId);
    if (!original) {
      return { success: false, errors: ['Template not found'] };
    }

    return await this.createTemplate({
      name: newName,
      content: original.content,
      templateType: original.templateType,
      groupChatId,
      createdBy,
      isDefault: false,
      isActive: true
    });
  }

  /**
   * Get template usage statistics
   */
  async getTemplateStats(groupChatId: number): Promise<{
    totalTemplates: number;
    activeTemplates: number;
    templatesByType: Record<MessageTemplateType, number>;
    lastModified: string | null;
  }> {
    const allTemplates = await this.botsStore.getAllMessageTemplates(groupChatId);
    
    const stats = {
      totalTemplates: allTemplates.length,
      activeTemplates: allTemplates.filter(t => t.isActive).length,
      templatesByType: {} as Record<MessageTemplateType, number>,
      lastModified: null as string | null
    };

    // Count by type
    allTemplates.forEach(template => {
      stats.templatesByType[template.templateType] = (stats.templatesByType[template.templateType] || 0) + 1;
    });

    // Find last modified
    if (allTemplates.length > 0) {
      const sorted = allTemplates.sort((a, b) => 
        new Date(b.lastModifiedAt).getTime() - new Date(a.lastModifiedAt).getTime()
      );
      stats.lastModified = sorted[0]?.lastModifiedAt || null;
    }

    return stats;
  }

  // Private helper methods

  private async unsetDefaultTemplate(groupChatId: number, templateType: MessageTemplateType): Promise<void> {
    const templates = await this.botsStore.getMessageTemplatesByType(groupChatId, templateType);
    for (const template of templates) {
      if (template.isDefault) {
        await this.botsStore.updateMessageTemplate(groupChatId, template.id, { isDefault: false });
      }
    }
  }

  private extractVariablesFromContent(content: string): string[] {
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

  private generateSampleContext(templateType: MessageTemplateType): any {
    const baseContext = {
      botName: 'Support Bot',
      groupName: 'Customer Support',
      timestamp: new Date().toLocaleString(),
      userName: 'John Doe',
      userEmail: 'john@example.com',
      customerName: 'Acme Corporation'
    };

    switch (templateType) {
      case 'ticket_created':
      case 'ticket_updated':
      case 'ticket_closed':
        return {
          ...baseContext,
          ticketId: 'TKT-12345',
          ticketTitle: 'Login Issue',
          ticketDescription: 'Unable to log in to my account',
          ticketStatus: templateType === 'ticket_closed' ? 'Closed' : 'Open',
          ticketUrl: 'https://support.example.com/tickets/12345',
          agentName: 'Sarah Smith',
          agentEmail: 'sarah@company.com'
        };
      case 'agent_response':
        return {
          ...baseContext,
          ticketId: 'TKT-12345',
          ticketTitle: 'Login Issue',
          ticketUrl: 'https://support.example.com/tickets/12345',
          agentName: 'Sarah Smith',
          agentEmail: 'sarah@company.com'
        };
      case 'error_message':
        return {
          ...baseContext,
          errorMessage: 'Connection timeout occurred'
        };
      default:
        return baseContext;
    }
  }

  private async getBuiltInTemplate(templateType: MessageTemplateType): Promise<string | null> {
    // Use MessageFormatter's public method to get built-in template content
    return this.messageFormatter.getBuiltInTemplateContent(templateType);
  }
}
