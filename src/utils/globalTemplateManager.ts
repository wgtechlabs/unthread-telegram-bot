/**
 * Simplified Global Template Manager
 * 
 * Replaces the complex per-group template system with a simple global
 * configuration that all groups use. Supports 3 essential events only.
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from '../sdk/bots-brain/index.js';
import { 
  GlobalTemplate, 
  GlobalTemplateEvent, 
  GlobalTemplateConfig, 
  DEFAULT_GLOBAL_TEMPLATES,
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
      currentConfig.templates[event] = {
        event,
        content,
        enabled,
        lastModifiedBy: updatedBy || undefined,
        lastModifiedAt: new Date().toISOString()
      };
      
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
      return config.templates[event] || null;
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
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        const sanitizedValue = this.sanitizeTemplateValue(value || '');
        content = content.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), sanitizedValue);
      }
      
      // Clean up any remaining unreplaced variables
      content = content.replace(/\{\{[^}]+\}\}/g, '[N/A]');
      
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
    let sanitized = value.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Escape HTML/XML special characters to prevent markup injection
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
    
    // Remove or escape Markdown special characters that could break formatting
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
      const defaultConfig = { ...DEFAULT_GLOBAL_TEMPLATES };
      defaultConfig.lastUpdated = new Date().toISOString();
      defaultConfig.version = 1;
      
      // Mark who reset it
      if (updatedBy) {
        Object.values(defaultConfig.templates).forEach(template => {
          template.lastModifiedBy = updatedBy;
          template.lastModifiedAt = new Date().toISOString();
        });
      }

      await BotsStore.setGlobalConfig('templates', defaultConfig);
      
      LogEngine.info('Global templates reset to defaults', { updatedBy });
      
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
