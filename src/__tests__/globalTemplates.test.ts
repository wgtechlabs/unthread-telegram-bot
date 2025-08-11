/**
 * Unit tests for globalTemplates configuration
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GLOBAL_TEMPLATES,
  TEMPLATE_VARIABLES,
  type GlobalTemplate,
  type GlobalTemplateEvent,
  type GlobalTemplateConfig
} from '../config/globalTemplates';

describe('globalTemplates', () => {
  describe('DEFAULT_GLOBAL_TEMPLATES', () => {
    it('should have correct structure', () => {
      expect(DEFAULT_GLOBAL_TEMPLATES).toHaveProperty('templates');
      expect(DEFAULT_GLOBAL_TEMPLATES).toHaveProperty('version');
      expect(DEFAULT_GLOBAL_TEMPLATES).toHaveProperty('lastUpdated');
    });

    it('should have version number', () => {
      expect(DEFAULT_GLOBAL_TEMPLATES.version).toBe(1);
      expect(typeof DEFAULT_GLOBAL_TEMPLATES.version).toBe('number');
    });

    it('should have valid lastUpdated timestamp', () => {
      const lastUpdated = DEFAULT_GLOBAL_TEMPLATES.lastUpdated;
      expect(typeof lastUpdated).toBe('string');
      expect(new Date(lastUpdated).toString()).not.toBe('Invalid Date');
    });

    it('should contain all required template events', () => {
      const templates = DEFAULT_GLOBAL_TEMPLATES.templates;
      
      expect(templates).toHaveProperty('ticket_created');
      expect(templates).toHaveProperty('agent_response');
      expect(templates).toHaveProperty('ticket_status');
    });

    describe('ticket_created template', () => {
      const template = DEFAULT_GLOBAL_TEMPLATES.templates.ticket_created;

      it('should have correct event type', () => {
        expect(template.event).toBe('ticket_created');
      });

      it('should be enabled by default', () => {
        expect(template.enabled).toBe(true);
      });

      it('should have non-empty content', () => {
        expect(template.content).toBeTruthy();
        expect(typeof template.content).toBe('string');
        expect(template.content.length).toBeGreaterThan(0);
      });

      it('should contain expected placeholders', () => {
        expect(template.content).toContain('{{ticketNumber}}');
        expect(template.content).toContain('{{summary}}');
      });

      it('should have appropriate messaging for ticket creation', () => {
        expect(template.content).toContain('Support Ticket Created');
        expect(template.content).toContain('Reply to this message');
      });

      it('should not have lastModifiedBy or lastModifiedAt by default', () => {
        expect(template.lastModifiedBy).toBeUndefined();
        expect(template.lastModifiedAt).toBeUndefined();
      });
    });

    describe('agent_response template', () => {
      const template = DEFAULT_GLOBAL_TEMPLATES.templates.agent_response;

      it('should have correct event type', () => {
        expect(template.event).toBe('agent_response');
      });

      it('should be enabled by default', () => {
        expect(template.enabled).toBe(true);
      });

      it('should have non-empty content', () => {
        expect(template.content).toBeTruthy();
        expect(typeof template.content).toBe('string');
        expect(template.content.length).toBeGreaterThan(0);
      });

      it('should contain expected placeholders', () => {
        expect(template.content).toContain('{{ticketNumber}}');
        expect(template.content).toContain('{{response}}');
      });

      it('should have appropriate messaging for agent responses', () => {
        expect(template.content).toContain('New Response');
        expect(template.content).toContain('continue the conversation');
      });
    });

    describe('ticket_status template', () => {
      const template = DEFAULT_GLOBAL_TEMPLATES.templates.ticket_status;

      it('should have correct event type', () => {
        expect(template.event).toBe('ticket_status');
      });

      it('should be enabled by default', () => {
        expect(template.enabled).toBe(true);
      });

      it('should have non-empty content', () => {
        expect(template.content).toBeTruthy();
        expect(typeof template.content).toBe('string');
        expect(template.content.length).toBeGreaterThan(0);
      });

      it('should contain expected placeholders', () => {
        expect(template.content).toContain('{{ticketNumber}}');
        expect(template.content).toContain('{{status}}');
        expect(template.content).toContain('{{summary}}');
      });

      it('should have appropriate messaging for status updates', () => {
        expect(template.content).toContain('Status Update');
        expect(template.content).toContain('/support for a new ticket');
      });
    });
  });

  describe('TEMPLATE_VARIABLES', () => {
    it('should have core variables section', () => {
      expect(TEMPLATE_VARIABLES).toHaveProperty('core');
      expect(Array.isArray(TEMPLATE_VARIABLES.core)).toBe(true);
    });

    it('should have agent variables section', () => {
      expect(TEMPLATE_VARIABLES).toHaveProperty('agent');
      expect(Array.isArray(TEMPLATE_VARIABLES.agent)).toBe(true);
    });

    it('should have time variables section', () => {
      expect(TEMPLATE_VARIABLES).toHaveProperty('time');
      expect(Array.isArray(TEMPLATE_VARIABLES.time)).toBe(true);
    });

    describe('core variables', () => {
      const coreVars = TEMPLATE_VARIABLES.core;

      it('should contain essential core variables', () => {
        const varNames = coreVars.map(v => v.name);
        
        expect(varNames).toContain('ticketNumber');
        expect(varNames).toContain('friendlyId');
        expect(varNames).toContain('conversationId');
        expect(varNames).toContain('summary');
        expect(varNames).toContain('customerName');
        expect(varNames).toContain('status');
      });

      it('should have proper structure for each variable', () => {
        coreVars.forEach(variable => {
          expect(variable).toHaveProperty('name');
          expect(variable).toHaveProperty('description');
          expect(variable).toHaveProperty('example');
          
          expect(typeof variable.name).toBe('string');
          expect(typeof variable.description).toBe('string');
          expect(typeof variable.example).toBe('string');
          
          expect(variable.name.length).toBeGreaterThan(0);
          expect(variable.description.length).toBeGreaterThan(0);
          expect(variable.example.length).toBeGreaterThan(0);
        });
      });

      it('should have ticketNumber variable with proper example', () => {
        const ticketVar = coreVars.find(v => v.name === 'ticketNumber');
        
        expect(ticketVar).toBeDefined();
        expect(ticketVar!.example).toMatch(/TKT-\d+/);
        expect(ticketVar!.description).toContain('User-friendly');
      });

      it('should have conversationId variable with UUID example', () => {
        const convVar = coreVars.find(v => v.name === 'conversationId');
        
        expect(convVar).toBeDefined();
        expect(convVar!.example).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(convVar!.description).toContain('UUID');
      });
    });

    describe('agent variables', () => {
      const agentVars = TEMPLATE_VARIABLES.agent;

      it('should contain response variable', () => {
        const varNames = agentVars.map(v => v.name);
        expect(varNames).toContain('response');
      });

      it('should have proper structure for each variable', () => {
        agentVars.forEach(variable => {
          expect(variable).toHaveProperty('name');
          expect(variable).toHaveProperty('description');
          expect(variable).toHaveProperty('example');
          
          expect(typeof variable.name).toBe('string');
          expect(typeof variable.description).toBe('string');
          expect(typeof variable.example).toBe('string');
        });
      });
    });

    describe('time variables', () => {
      const timeVars = TEMPLATE_VARIABLES.time;

      it('should contain time-related variables', () => {
        const varNames = timeVars.map(v => v.name);
        
        expect(varNames).toContain('createdAt');
        expect(varNames).toContain('updatedAt');
      });

      it('should have proper structure for each variable', () => {
        timeVars.forEach(variable => {
          expect(variable).toHaveProperty('name');
          expect(variable).toHaveProperty('description');
          expect(variable).toHaveProperty('example');
          
          expect(typeof variable.name).toBe('string');
          expect(typeof variable.description).toBe('string');
          expect(typeof variable.example).toBe('string');
        });
      });

      it('should have realistic time format examples', () => {
        timeVars.forEach(variable => {
          // Check that examples look like date/time formats
          expect(variable.example).toMatch(/\d{4}-\d{2}-\d{2}/); // YYYY-MM-DD format
        });
      });
    });
  });

  describe('Type definitions', () => {
    it('should define GlobalTemplateEvent correctly', () => {
      // This is more of a compile-time test, but we can test string literals
      const validEvents: GlobalTemplateEvent[] = [
        'ticket_created',
        'agent_response', 
        'ticket_status'
      ];

      validEvents.forEach(event => {
        expect(typeof event).toBe('string');
        expect(['ticket_created', 'agent_response', 'ticket_status']).toContain(event);
      });
    });

    it('should allow creating valid GlobalTemplate objects', () => {
      const template: GlobalTemplate = {
        event: 'ticket_created',
        content: 'Test content with {{ticketNumber}}',
        enabled: true,
        lastModifiedBy: 12345,
        lastModifiedAt: '2025-01-15T10:30:00Z'
      };

      expect(template.event).toBe('ticket_created');
      expect(template.content).toBe('Test content with {{ticketNumber}}');
      expect(template.enabled).toBe(true);
      expect(template.lastModifiedBy).toBe(12345);
      expect(template.lastModifiedAt).toBe('2025-01-15T10:30:00Z');
    });

    it('should allow creating GlobalTemplateConfig objects', () => {
      const config: GlobalTemplateConfig = {
        templates: {
          ticket_created: {
            event: 'ticket_created',
            content: 'Test created',
            enabled: true
          },
          agent_response: {
            event: 'agent_response',
            content: 'Test response',
            enabled: false
          },
          ticket_status: {
            event: 'ticket_status',
            content: 'Test status',
            enabled: true
          }
        },
        version: 2,
        lastUpdated: '2025-01-15T12:00:00Z'
      };

      expect(config.version).toBe(2);
      expect(config.templates.ticket_created.enabled).toBe(true);
      expect(config.templates.agent_response.enabled).toBe(false);
    });
  });

  describe('Template content validation', () => {
    it('should have consistent placeholder syntax across all templates', () => {
      const templates = DEFAULT_GLOBAL_TEMPLATES.templates;
      
      Object.values(templates).forEach(template => {
        // Check that placeholders use double curly braces
        const placeholders = template.content.match(/\{\{[^}]+\}\}/g) || [];
        
        placeholders.forEach(placeholder => {
          expect(placeholder).toMatch(/^\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}$/);
        });
      });
    });

    it('should use only documented variables in templates', () => {
      const allDocumentedVars = [
        ...TEMPLATE_VARIABLES.core.map(v => v.name),
        ...TEMPLATE_VARIABLES.agent.map(v => v.name),
        ...TEMPLATE_VARIABLES.time.map(v => v.name)
      ];

      const templates = DEFAULT_GLOBAL_TEMPLATES.templates;
      
      Object.values(templates).forEach(template => {
        const placeholders = template.content.match(/\{\{([^}]+)\}\}/g) || [];
        
        placeholders.forEach(placeholder => {
          const varName = placeholder.replace(/[{}]/g, '');
          expect(allDocumentedVars).toContain(varName);
        });
      });
    });

    it('should have non-empty content for all templates', () => {
      const templates = DEFAULT_GLOBAL_TEMPLATES.templates;
      
      Object.entries(templates).forEach(([event, template]) => {
        expect(template.content.trim().length).toBeGreaterThan(0);
        expect(template.content).not.toBe('');
      });
    });

    it('should have meaningful content for each template type', () => {
      const { ticket_created, agent_response, ticket_status } = DEFAULT_GLOBAL_TEMPLATES.templates;

      // ticket_created should mention creation/new ticket
      expect(ticket_created.content.toLowerCase()).toMatch(/(creat|new|ticket)/);

      // agent_response should mention response/reply
      expect(agent_response.content.toLowerCase()).toMatch(/(response|reply|message)/);

      // ticket_status should mention status/update
      expect(ticket_status.content.toLowerCase()).toMatch(/(status|update)/);
    });
  });
});