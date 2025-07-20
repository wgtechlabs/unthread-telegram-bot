/**
 * Attachment Health Check Command
 * 
 * Administrative command to check the health and performance of the attachment
 * processing system. Provides real-time metrics, system status, and 
 * troubleshooting information for administrators.
 * 
 * Features:
 * - Real-time performance metrics
 * - Error rate monitoring
 * - System health status
 * - Processing time analytics
 * - File type and size statistics
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import type { BotContext } from '../../types/index.js';
import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js';
import { attachmentMetrics } from '../../utils/attachmentMetrics.js';
import { escapeMarkdown } from '../../utils/markdownEscape.js';

/**
 * Health check command for attachment processing monitoring
 */
export class AttachmentHealthCommand extends BaseCommand {
  
  readonly metadata: CommandMetadata = {
    name: 'attachment-health',
    description: '📊 Check attachment processing system health and metrics',
    usage: '/attachment-health',
    examples: [
      '/attachment-health - Get detailed health report'
    ],
    adminOnly: true,
    privateOnly: false
  };

  /**
   * Execute health check command
   */
  protected async executeCommand(ctx: BotContext): Promise<void> {
    try {
      LogEngine.info('🩺 Attachment health check requested', {
        userId: ctx.from?.id,
        username: ctx.from?.username,
        chatId: ctx.chat?.id
      });

      // Check if user is admin
      if (!ctx.from) {
        await ctx.reply('❌ Unable to verify user permissions.');
        return;
      }

      // Get health status and metrics
      const healthStatus = attachmentMetrics.getHealthStatus();
      const reportText = attachmentMetrics.getPerformanceReport();

      // Add system status header
      const statusIcon = healthStatus.healthy ? '✅' : '⚠️';
      const statusText = healthStatus.healthy ? 'System Healthy' : 'Issues Detected';
      
      const fullReport = [
        `🩺 **Attachment System Health Check**`,
        `**Status**: ${statusIcon} ${statusText}`,
        '',
        reportText
      ].join('\n');

      // Send report
      await ctx.reply(escapeMarkdown(fullReport), {
        parse_mode: 'Markdown'
      });

      // If there are issues, send additional troubleshooting info
      if (!healthStatus.healthy && healthStatus.issues.length > 0) {
        const troubleshootingInfo = this.generateTroubleshootingInfo(healthStatus.issues);
        await ctx.reply(troubleshootingInfo, {
          parse_mode: 'Markdown'
        });
      }

      LogEngine.info('✅ Health check report sent successfully', {
        healthy: healthStatus.healthy,
        issuesCount: healthStatus.issues.length,
        totalOperations: healthStatus.metrics.totalOperations
      });

    } catch (error) {
      LogEngine.error('Failed to execute attachment health check', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: ctx.from?.id
      });

      await ctx.reply(
        '❌ **Health Check Failed**\n\n' +
        'Unable to retrieve attachment system metrics. Please check the logs for more details.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Generate troubleshooting information based on detected issues
   */
  private generateTroubleshootingInfo(issues: string[]): string {
    const troubleshooting: string[] = [
      '🔧 **Troubleshooting Guide**',
      ''
    ];

    issues.forEach(issue => {
      if (issue.includes('Low success rate')) {
        troubleshooting.push(
          '**Low Success Rate Issue:**',
          '• Check Unthread API connectivity',
          '• Verify API key validity',
          '• Check Telegram bot permissions',
          '• Review recent error logs',
          ''
        );
      }
      
      if (issue.includes('High processing time')) {
        troubleshooting.push(
          '**High Processing Time Issue:**',
          '• Check network connectivity to Unthread',
          '• Monitor server resource usage',
          '• Review file size patterns',
          '• Check for rate limiting',
          ''
        );
      }
      
      if (issue.includes('error rate')) {
        troubleshooting.push(
          '**High Error Rate Issue:**',
          '• Review attachment validation rules',
          '• Check file type compatibility',
          '• Verify API endpoints are working',
          '• Monitor for quota limits',
          ''
        );
      }
    });

    troubleshooting.push(
      '**General Actions:**',
      '• Review recent logs with `/logs`',
      '• Check system resources',
      '• Verify environment configuration',
      '• Contact support if issues persist'
    );

    return troubleshooting.join('\n');
  }
}

/**
 * Simplified health check for quick status
 */
export class AttachmentStatusCommand extends BaseCommand {
  
  readonly metadata: CommandMetadata = {
    name: 'attachment-status',
    description: '🚦 Quick attachment system status check',
    usage: '/attachment-status',
    examples: [
      '/attachment-status - Get quick status overview'
    ],
    adminOnly: true,
    privateOnly: false
  };

  /**
   * Execute quick status check
   */
  protected async executeCommand(ctx: BotContext): Promise<void> {
    try {
      LogEngine.info('🚦 Quick attachment status check requested', {
        userId: ctx.from?.id,
        username: ctx.from?.username,
        chatId: ctx.chat?.id
      });

      // Check if user is admin
      if (!ctx.from) {
        await ctx.reply('❌ Unable to verify user permissions.');
        return;
      }

      // Get basic health status
      const healthStatus = attachmentMetrics.getHealthStatus();
      const recentMetrics = healthStatus.metrics;

      const statusIcon = healthStatus.healthy ? '✅' : '⚠️';
      const statusText = healthStatus.healthy ? 'Healthy' : 'Issues';

      const quickStatus = [
        `🚦 **Attachment System Status**: ${statusIcon} ${statusText}`,
        '',
        `📊 **Last Hour**: ${recentMetrics.totalOperations} operations (${recentMetrics.successRate.toFixed(1)}% success)`,
        `⚡ **Performance**: ${(recentMetrics.averageTotalTime / 1000).toFixed(1)}s average`,
        `📁 **Data Processed**: ${this.formatFileSize(recentMetrics.totalFileSize)}`,
        ''
      ];

      if (!healthStatus.healthy) {
        quickStatus.push('**Issues Detected:**');
        healthStatus.issues.forEach(issue => {
          quickStatus.push(`• ${issue}`);
        });
        quickStatus.push('');
        quickStatus.push('Use `/attachment-health` for detailed analysis.');
      } else {
        quickStatus.push('✅ All systems operating normally.');
      }

      await ctx.reply(quickStatus.join('\n'), {
        parse_mode: 'Markdown'
      });

    } catch (error) {
      LogEngine.error('Failed to execute attachment status check', {
        error: error instanceof Error ? error.message : String(error),
        userId: ctx.from?.id
      });

      await ctx.reply('❌ Unable to retrieve system status.', { parse_mode: 'Markdown' });
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) {
      return '0 B';
    }
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    if (i < 0 || i >= sizes.length) {
      return `${bytes} B`;
    }
    
    const sizeUnit = sizes.at(i);
    if (sizeUnit) {
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizeUnit}`;
    }
    return `${bytes} B`;
  }
}
