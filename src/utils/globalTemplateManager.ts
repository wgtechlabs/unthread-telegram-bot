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
    enabled: boolean = true,
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
      
      // Replace all variables in the format {{variableName}}
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        content = content.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value || '');
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
   * Validate template content
   */
  private validateTemplate(content: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!content || content.trim().length === 0) {
      errors.push('Template content cannot be empty');
    }
    
    if (content.length > 4000) {
      errors.push('Template content too long (max 4000 characters)');
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
