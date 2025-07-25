/**
 * Simplified Global Template Manager
 * 
 * Replaces the complex per-group template system with a simple global
 * configuration that all groups use. Supports 3 essential events only.
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from '../sdk/bots-brain/index.js';
import { 
  DEFAULT_GLOBAL_TEMPLATES, 
  GlobalTemplate, 
  GlobalTemplateConfig, 
  GlobalTemplateEvent,
  TEMPLATE_VARIABLES 
} from '../config/globalTemplates.js';

export class GlobalTemplateManager {
  private static instance: GlobalTemplateManager;
  
  private constructor() {}
  
  public static getInstance(): GlobalTemplateManager {
    if (!GlobalTemplateManager.instance) {
      GlobalTemplateManager.instance = new GlobalTemplateManager();
    }
    return GlobalTemplateManager.instance;
  }

  /**
   * Get the current global template configuration
   */
  async getGlobalTemplates(): Promise<GlobalTemplateConfig> {
    try {
      const stored = await BotsStore.getGlobalConfig('templates');
      if (stored) {
        return stored as GlobalTemplateConfig;
      }
      
      // Return defaults if nothing is stored
      return DEFAULT_GLOBAL_TEMPLATES;
    } catch (error) {
      LogEngine.error('Failed to get global templates', { error });
      return DEFAULT_GLOBAL_TEMPLATES;
    }
  }

  /**
   * Update a specific global template
   */
  async updateTemplate(
    event: GlobalTemplateEvent, 
    content: string, 
    enabled = true,
    updatedBy?: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate template content
      const validation = this.validateTemplate(content);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(', ') };
      }

      const currentConfig = await this.getGlobalTemplates();
      
      // Update the specific template
      const newTemplate: GlobalTemplate = {
        event,
        content,
        enabled,
        lastModifiedBy: updatedBy || undefined,
        lastModifiedAt: new Date().toISOString()
      };
      
      // Since GlobalTemplateEvent is a specific union type, this is safe
      switch (event) {
        case 'ticket_created':
          currentConfig.templates.ticket_created = newTemplate;
          break;
        case 'agent_response':
          currentConfig.templates.agent_response = newTemplate;
          break;
        case 'ticket_status':
          currentConfig.templates.ticket_status = newTemplate;
          break;
        default:
          // This should never happen with the type system, but just in case
          LogEngine.error('Unknown template event', { event });
          return { success: false, error: 'Unknown template event' };
      }
      
      currentConfig.version += 1;
      currentConfig.lastUpdated = new Date().toISOString();

      // Save updated configuration
      await BotsStore.setGlobalConfig('templates', currentConfig);
      
      LogEngine.info('Global template updated', { 
        event, 
        updatedBy, 
        enabled,
        version: currentConfig.version 
      });
      
      return { success: true };
    } catch (error) {
      LogEngine.error('Failed to update global template', { event, error });
      return { success: false, error: 'Failed to save template' };
    }
  }

  /**
   * Get a specific template for an event
   */
  async getTemplate(event: GlobalTemplateEvent): Promise<GlobalTemplate | null> {
    try {
      const config = await this.getGlobalTemplates();
      // Since GlobalTemplateEvent is a specific union type, this is safe
      switch (event) {
        case 'ticket_created':
          return config.templates.ticket_created || null;
        case 'agent_response':
          return config.templates.agent_response || null;
        case 'ticket_status':
          return config.templates.ticket_status || null;
        default:
          LogEngine.error('Unknown template event', { event });
          return null;
      }
    } catch (error) {
      LogEngine.error('Failed to get template', { event, error });
      return null;
    }
  }

  /**
   * Render a template with provided variables
   */
  async renderTemplate(
    event: GlobalTemplateEvent, 
    variables: Record<string, string>
  ): Promise<string | null> {
    try {
      const template = await this.getTemplate(event);
      
      if (!template || !template.enabled) {
        LogEngine.warn('Template not found or disabled', { event });
        return null;
      }

      let content = template.content;
      
      // Replace all variables in the format {{variableName}} with sanitized values
      // Using pre-compiled regex patterns and simple string replacement to prevent ReDoS attacks
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        const sanitizedValue = this.sanitizeTemplateValue(value || '');
        // Use simple string replacement instead of regex to avoid ReDoS vulnerability
        content = content.split(placeholder).join(sanitizedValue);
      }
      
      // Clean up any remaining unreplaced variables with a safe, non-backtracking pattern
      // Limit the search to prevent catastrophic backtracking on malicious input
      const remainingVarsPattern = /\{\{[a-zA-Z0-9_-]{1,50}\}\}/g;
      content = content.replace(remainingVarsPattern, '[N/A]');
      
      return content;
    } catch (error) {
      LogEngine.error('Failed to render template', { event, error });
      return null;
    }
  }

  /**
   * Sanitize template values to prevent injection attacks
   * This function removes or escapes potentially dangerous content
   */
  private sanitizeTemplateValue(value: string): string {
    if (typeof value !== 'string') {
      return String(value || '');
    }

    // Remove null bytes and control characters that could cause issues
    // eslint-disable-next-line no-control-regex
    let sanitized = value.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Use proper Telegram Markdown escaping instead of HTML entities
    // Only escape characters that break Telegram message parsing
    sanitized = sanitized
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/`/g, '\\`')
      .replace(/~/g, '\\~');
    
    // Limit length to prevent buffer overflow or excessive content
    const maxLength = 1000;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '...';
      LogEngine.warn('Template value truncated due to excessive length', {
        originalLength: value.length,
        truncatedLength: sanitized.length
      });
    }
    
    // Log suspicious patterns for security monitoring
    const suspiciousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /on\w+\s*=/i,
      /<script/i,
      /<iframe/i,
      /eval\s*\(/i,
      /document\./i,
      /window\./i
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(value)) {
        LogEngine.warn('Suspicious content detected in template value', {
          pattern: pattern.toString(),
          originalValue: value.substring(0, 100) // Log only first 100 chars for privacy
        });
        break;
      }
    }
    
    return sanitized;
  }

  /**
   * Reset templates to defaults
   */
  async resetToDefaults(updatedBy?: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Create a fresh copy of defaults without any modification metadata
      const defaultConfig: GlobalTemplateConfig = {
        templates: {
          ticket_created: {
            event: 'ticket_created',
            content: DEFAULT_GLOBAL_TEMPLATES.templates.ticket_created.content,
            enabled: true
            // Explicitly NOT setting lastModifiedBy/lastModifiedAt to indicate pristine defaults
          },
          agent_response: {
            event: 'agent_response',
            content: DEFAULT_GLOBAL_TEMPLATES.templates.agent_response.content,
            enabled: true
            // Explicitly NOT setting lastModifiedBy/lastModifiedAt to indicate pristine defaults
          },
          ticket_status: {
            event: 'ticket_status',
            content: DEFAULT_GLOBAL_TEMPLATES.templates.ticket_status.content,
            enabled: true
            // Explicitly NOT setting lastModifiedBy/lastModifiedAt to indicate pristine defaults
          }
        },
        version: 1,
        lastUpdated: new Date().toISOString()
      };

      await BotsStore.setGlobalConfig('templates', defaultConfig);
      
      LogEngine.info('Global templates reset to pristine defaults', { 
        updatedBy,
        clearedModifications: true 
      });
      
      return { success: true };
    } catch (error) {
      LogEngine.error('Failed to reset templates to defaults', { error });
      return { success: false, error: 'Failed to reset templates' };
    }
  }

  /**
   * Initialize default templates for a group (simplified for global templates)
   * This method ensures global templates are available and creates them if needed
   */
  async initializeDefaultTemplates(groupChatId?: number): Promise<{ success: boolean; error?: string }> {
    try {
      // For global templates, groupChatId is not used but kept for API compatibility
      const currentConfig = await this.getGlobalTemplates();
      
      // Check if templates are already initialized
      if (currentConfig.version > 1 || 
          Object.keys(currentConfig.templates).length === Object.keys(DEFAULT_GLOBAL_TEMPLATES.templates).length) {
        LogEngine.info('Global templates already initialized', { 
          version: currentConfig.version,
          templateCount: Object.keys(currentConfig.templates).length
        });
        return { success: true };
      }
      
      // Initialize with defaults if not already present
      const defaultConfig = { ...DEFAULT_GLOBAL_TEMPLATES };
      defaultConfig.version = 1;
      defaultConfig.lastUpdated = new Date().toISOString();
      
      await BotsStore.setGlobalConfig('templates', defaultConfig);
      
      LogEngine.info('Default global templates initialized', { 
        templateCount: Object.keys(defaultConfig.templates).length,
        groupChatId
      });
      
      return { success: true };
    } catch (error) {
      LogEngine.error('Failed to initialize default templates', { error, groupChatId });
      return { success: false, error: 'Failed to initialize templates' };
    }
  }

  /**
   * Validate template content for security and syntax
   */
  private validateTemplate(content: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!content || content.trim().length === 0) {
      errors.push('Template content cannot be empty');
    }
    
    if (content.length > 4000) {
      errors.push('Template content too long (max 4000 characters)');
    }
    
    // Security validation: Check for potentially dangerous content
    const dangerousPatterns = [
      { pattern: /javascript:/i, message: 'JavaScript URLs are not allowed' },
      { pattern: /data:/i, message: 'Data URLs are not allowed' },
      { pattern: /vbscript:/i, message: 'VBScript URLs are not allowed' },
      { pattern: /<script/i, message: 'Script tags are not allowed' },
      { pattern: /<iframe/i, message: 'Iframe tags are not allowed' },
      { pattern: /on\w+\s*=/i, message: 'Event handlers are not allowed' },
      { pattern: /eval\s*\(/i, message: 'Eval functions are not allowed' },
      { pattern: /document\./i, message: 'Document object access is not allowed' },
      { pattern: /window\./i, message: 'Window object access is not allowed' }
    ];
    
    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(content)) {
        errors.push(message);
        LogEngine.warn('Dangerous pattern detected in template content', {
          pattern: pattern.toString(),
          contentPreview: content.substring(0, 100)
        });
      }
    }
    
    // Check for valid variable syntax
    const variableMatches = content.match(/\{\{[^}]+\}\}/g);
    if (variableMatches) {
      const allVariables = [
        ...TEMPLATE_VARIABLES.core.map(v => v.name),
        ...TEMPLATE_VARIABLES.agent.map(v => v.name),
        ...TEMPLATE_VARIABLES.time.map(v => v.name)
      ];
      
      for (const match of variableMatches) {
        const variableName = match.replace(/[{}]/g, '');
        if (!allVariables.includes(variableName)) {
          errors.push(`Unknown variable: ${variableName}`);
        }
      }
    }
    
    // Check for nested template patterns that could cause recursion
    if (content.includes('{{') && content.includes('}}')) {
      const nestedPatterns = content.match(/\{\{[^}]*\{\{[^}]*\}\}[^}]*\}\}/g);
      if (nestedPatterns) {
        errors.push('Nested template variables are not allowed');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get available variables for templates
   */
  getAvailableVariables() {
    return TEMPLATE_VARIABLES;
  }

  /**
   * Toggle template enabled/disabled status
   */
  async toggleTemplate(
    event: GlobalTemplateEvent,
    updatedBy?: number
  ): Promise<{ success: boolean; enabled: boolean; error?: string }> {
    try {
      const template = await this.getTemplate(event);
      if (!template) {
        return { success: false, enabled: false, error: 'Template not found' };
      }

      const newEnabled = !template.enabled;
      const result = await this.updateTemplate(event, template.content, newEnabled, updatedBy);
      
      if (result.success) {
        return { success: true, enabled: newEnabled };
      } else {
        return { success: false, enabled: template.enabled, error: result.error || 'Unknown error' };
      }
    } catch (error) {
      LogEngine.error('Failed to toggle template', { event, error });
      return { success: false, enabled: false, error: 'Failed to toggle template' };
    }
  }
}
