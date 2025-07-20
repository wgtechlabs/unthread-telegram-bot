/**
 * Attachment Processing Metrics and Analytics
 * 
 * Provides comprehensive monitoring and analytics for attachment forwarding operations.
 * Tracks performance metrics, error rates, and system health for production monitoring.
 * 
 * Features:
 * - Processing time tracking (download, upload, total)
 * - Error rate analytics by category
 * - File type and size statistics
 * - Success/failure rate monitoring
 * - Performance trend analysis
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * Attachment processing metrics interface
 */
export interface AttachmentMetrics {
  // Processing times
  downloadTimeMs: number;
  uploadTimeMs: number;
  totalTimeMs: number;
  
  // File information
  fileSize: number;
  mimeType: string;
  fileName: string;
  
  // Processing metadata
  conversationId: string;
  chatId: number;
  timestamp: number;
  success: boolean;
  
  // Error information (if applicable)
  errorType?: string;
  errorMessage?: string;
}

/**
 * Aggregated metrics for analytics
 */
export interface AggregatedMetrics {
  // Time period
  startTime: number;
  endTime: number;
  
  // Success/failure rates
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  successRate: number;
  
  // Performance metrics
  averageDownloadTime: number;
  averageUploadTime: number;
  averageTotalTime: number;
  
  // File statistics
  totalFileSize: number;
  averageFileSize: number;
  largestFileSize: number;
  mostCommonMimeType: string;
  
  // Error breakdown
  errorsByType: Record<string, number>;
  
  // Performance percentiles
  p50TotalTime: number;
  p95TotalTime: number;
  p99TotalTime: number;
}

/**
 * Metrics collection and analytics service
 */
export class AttachmentMetricsService {
  private metrics: AttachmentMetrics[] = [];
  private readonly maxMetricsHistory = 1000; // Keep last 1000 operations
  
  /**
   * Record a new attachment processing operation
   */
  recordOperation(metrics: AttachmentMetrics): void {
    // Add timestamp if not provided
    if (!metrics.timestamp) {
      metrics.timestamp = Date.now();
    }
    
    // Add to metrics history
    this.metrics.push(metrics);
    
    // Maintain history size limit
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
    
    // Log operation for monitoring
    LogEngine.info('📊 Attachment operation recorded', {
      success: metrics.success,
      totalTimeMs: metrics.totalTimeMs,
      fileSize: metrics.fileSize,
      mimeType: metrics.mimeType,
      conversationId: metrics.conversationId,
      errorType: metrics.errorType || 'none'
    });
  }
  
  /**
   * Get aggregated metrics for a time period
   */
  getAggregatedMetrics(periodMinutes: number = 60): AggregatedMetrics {
    const now = Date.now();
    const startTime = now - (periodMinutes * 60 * 1000);
    
    // Filter metrics within time period
    const periodMetrics = this.metrics.filter(m => m.timestamp >= startTime);
    
    if (periodMetrics.length === 0) {
      return this.getEmptyMetrics(startTime, now);
    }
    
    // Calculate success/failure rates
    const successfulOps = periodMetrics.filter(m => m.success);
    const failedOps = periodMetrics.filter(m => !m.success);
    
    // Calculate performance metrics
    const downloadTimes = successfulOps.map(m => m.downloadTimeMs).filter(t => t > 0);
    const uploadTimes = successfulOps.map(m => m.uploadTimeMs).filter(t => t > 0);
    const totalTimes = periodMetrics.map(m => m.totalTimeMs).filter(t => t > 0);
    
    // Calculate file statistics
    const fileSizes = periodMetrics.map(m => m.fileSize).filter(s => s > 0);
    const mimeTypes = periodMetrics.map(m => m.mimeType).filter(Boolean);
    
    // Calculate error breakdown
    const errorsByTypeMap = new Map<string, number>();
    failedOps.forEach(op => {
      const errorType = op.errorType || 'UNKNOWN_ERROR';
      const currentCount = errorsByTypeMap.get(errorType) || 0;
      errorsByTypeMap.set(errorType, currentCount + 1);
    });
    
    // Convert Map to Record for interface compatibility
    const errorsByType: Record<string, number> = Object.fromEntries(errorsByTypeMap);
    
    // Calculate percentiles for total time
    const sortedTotalTimes = [...totalTimes].sort((a, b) => a - b);
    
    return {
      startTime,
      endTime: now,
      totalOperations: periodMetrics.length,
      successfulOperations: successfulOps.length,
      failedOperations: failedOps.length,
      successRate: periodMetrics.length > 0 ? (successfulOps.length / periodMetrics.length) * 100 : 0,
      
      // Performance averages
      averageDownloadTime: this.calculateAverage(downloadTimes),
      averageUploadTime: this.calculateAverage(uploadTimes),
      averageTotalTime: this.calculateAverage(totalTimes),
      
      // File statistics
      totalFileSize: fileSizes.reduce((sum, size) => sum + size, 0),
      averageFileSize: this.calculateAverage(fileSizes),
      largestFileSize: Math.max(...fileSizes, 0),
      mostCommonMimeType: this.getMostCommon(mimeTypes),
      
      // Error breakdown
      errorsByType,
      
      // Performance percentiles
      p50TotalTime: this.calculatePercentile(sortedTotalTimes, 50),
      p95TotalTime: this.calculatePercentile(sortedTotalTimes, 95),
      p99TotalTime: this.calculatePercentile(sortedTotalTimes, 99)
    };
  }
  
  /**
   * Check if system is healthy based on recent metrics
   */
  getHealthStatus(): {
    healthy: boolean;
    issues: string[];
    metrics: AggregatedMetrics;
  } {
    const recentMetrics = this.getAggregatedMetrics(15); // Last 15 minutes
    const issues: string[] = [];
    
    // Check success rate (should be > 95%)
    if (recentMetrics.successRate < 95 && recentMetrics.totalOperations >= 5) {
      issues.push(`Low success rate: ${recentMetrics.successRate.toFixed(1)}%`);
    }
    
    // Check average processing time (should be < 10 seconds)
    if (recentMetrics.averageTotalTime > 10000) {
      issues.push(`High processing time: ${(recentMetrics.averageTotalTime / 1000).toFixed(1)}s avg`);
    }
    
    // Check P95 processing time (should be < 15 seconds)
    if (recentMetrics.p95TotalTime > 15000) {
      issues.push(`High P95 processing time: ${(recentMetrics.p95TotalTime / 1000).toFixed(1)}s`);
    }
    
    // Check for high error rates by type
    if (recentMetrics.failedOperations > 0) {
      Object.entries(recentMetrics.errorsByType).forEach(([errorType, count]) => {
        if (typeof count === 'number' && typeof errorType === 'string') {
          const errorRate = (count / recentMetrics.totalOperations) * 100;
          if (errorRate > 10) { // More than 10% of operations failing with same error
            issues.push(`High ${errorType} error rate: ${errorRate.toFixed(1)}%`);
          }
        }
      });
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      metrics: recentMetrics
    };
  }
  
  /**
   * Get performance report for monitoring dashboard
   */
  getPerformanceReport(): string {
    const hourlyMetrics = this.getAggregatedMetrics(60);
    const healthStatus = this.getHealthStatus();
    
    const report = [
      '📊 **Attachment Processing Performance Report**',
      '',
      `**Health Status**: ${healthStatus.healthy ? '✅ Healthy' : '⚠️ Issues Detected'}`,
      ...(healthStatus.issues.length > 0 ? ['**Issues**:', ...healthStatus.issues.map(issue => `• ${issue}`), ''] : ['']),
      
      '**Last Hour Statistics**:',
      `• **Operations**: ${hourlyMetrics.totalOperations} total (${hourlyMetrics.successfulOperations} success, ${hourlyMetrics.failedOperations} failed)`,
      `• **Success Rate**: ${hourlyMetrics.successRate.toFixed(1)}%`,
      `• **Average Times**: ${(hourlyMetrics.averageTotalTime / 1000).toFixed(1)}s total (↓${(hourlyMetrics.averageDownloadTime / 1000).toFixed(1)}s ↑${(hourlyMetrics.averageUploadTime / 1000).toFixed(1)}s)`,
      `• **Performance**: P50=${(hourlyMetrics.p50TotalTime / 1000).toFixed(1)}s, P95=${(hourlyMetrics.p95TotalTime / 1000).toFixed(1)}s, P99=${(hourlyMetrics.p99TotalTime / 1000).toFixed(1)}s`,
      '',
      
      '**File Statistics**:',
      `• **Total Data**: ${this.formatFileSize(hourlyMetrics.totalFileSize)}`,
      `• **Average Size**: ${this.formatFileSize(hourlyMetrics.averageFileSize)}`,
      `• **Largest File**: ${this.formatFileSize(hourlyMetrics.largestFileSize)}`,
      `• **Common Type**: ${hourlyMetrics.mostCommonMimeType || 'N/A'}`,
      ''
    ];
    
    // Add error breakdown if there are errors
    if (hourlyMetrics.failedOperations > 0) {
      report.push('**Error Breakdown**:');
      Object.entries(hourlyMetrics.errorsByType)
        .sort(([,a], [,b]) => b - a)
        .forEach(([errorType, count]) => {
          const percentage = ((count / hourlyMetrics.totalOperations) * 100).toFixed(1);
          report.push(`• **${errorType}**: ${count} (${percentage}%)`);
        });
      report.push('');
    }
    
    report.push(`*Generated at ${new Date().toISOString()}*`);
    
    return report.join('\n');
  }
  
  /**
   * Clear old metrics (for memory management)
   */
  clearOldMetrics(olderThanHours: number = 24): void {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    const originalCount = this.metrics.length;
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoffTime);
    
    const clearedCount = originalCount - this.metrics.length;
    if (clearedCount > 0) {
      LogEngine.info('🧹 Cleared old attachment metrics', {
        clearedCount,
        remainingCount: this.metrics.length,
        olderThanHours
      });
    }
  }
  
  // Helper methods
  private calculateAverage(values: number[]): number {
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }
  
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) {
      return 0;
    }
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    const clampedIndex = Math.max(0, Math.min(index, sortedValues.length - 1));
    const value = sortedValues.at(clampedIndex);
    return value !== undefined ? value : 0;
  }
  
  private getMostCommon(values: string[]): string {
    if (values.length === 0) {
      return '';
    }
    
    const counts = new Map<string, number>();
    values.forEach(val => {
      const currentCount = counts.get(val) || 0;
      counts.set(val, currentCount + 1);
    });
    
    let mostCommon = '';
    let maxCount = 0;
    counts.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = value;
      }
    });
    
    return mostCommon;
  }
  
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
  
  private getEmptyMetrics(startTime: number, endTime: number): AggregatedMetrics {
    return {
      startTime,
      endTime,
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      successRate: 0,
      averageDownloadTime: 0,
      averageUploadTime: 0,
      averageTotalTime: 0,
      totalFileSize: 0,
      averageFileSize: 0,
      largestFileSize: 0,
      mostCommonMimeType: '',
      errorsByType: {},
      p50TotalTime: 0,
      p95TotalTime: 0,
      p99TotalTime: 0
    };
  }
}

// Global metrics service instance
export const attachmentMetrics = new AttachmentMetricsService();

// Set up automatic cleanup every hour
setInterval(() => {
  attachmentMetrics.clearOldMetrics(24); // Keep last 24 hours
}, 60 * 60 * 1000); // Run every hour

/**
 * Helper function to record successful attachment operation
 */
export function recordSuccessfulAttachment(metrics: Omit<AttachmentMetrics, 'success'>): void {
  attachmentMetrics.recordOperation({
    ...metrics,
    success: true
  });
}

/**
 * Helper function to record failed attachment operation
 */
export function recordFailedAttachment(
  metrics: Omit<AttachmentMetrics, 'success' | 'errorType' | 'errorMessage'>,
  errorType: string,
  errorMessage: string
): void {
  attachmentMetrics.recordOperation({
    ...metrics,
    success: false,
    errorType,
    errorMessage
  });
}
