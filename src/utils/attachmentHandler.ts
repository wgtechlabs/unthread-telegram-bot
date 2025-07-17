/**
 * Unthread Telegram Bot - Memory Buffer File Attachment Handler
 * 
 * Handles file attachments from Telegram users to Unthread platform using
 * simple memory buffers for fast, reliable processing.
 * 
 * PHASE 1 IMPLEMENTATION - Memory Buffer Approach:
 * This implementation introduces a new buffer-based approach alongside the existing
 * stream-based processing for backward compatibility and gradual migration.
 * 
 * Core Features:
 * - Simple memory buffer processing (fast and reliable)
 * - 10MB file size limit for optimal performance
 * - Direct upload to Unthread without temporary files
 * - Clean error handling and validation
 * - Backward compatibility with existing stream processing
 * 
 * Performance Benefits:
 * - Fast processing with memory buffers
 * - Simple, reliable implementation
 * - Low memory footprint with 10MB limit
 * - No complex stream management overhead
 * - Predictable memory usage patterns
 * 
 * File Limits:
 * - Maximum file size: 10MB per file (buffer mode, reduced for performance)
 * - Maximum files: 5 files per conversation/message (buffer mode, reduced)
 * - Supported formats: Common images, documents, and archives
 * 
 * Phase 1 Key Functions:
 * - processAttachmentsEnhanced() - Unified interface with mode selection
 * - processBufferAttachments() - New buffer-based processing pipeline
 * - loadFileToBuffer() - Direct file download to memory buffer
 * - uploadBufferToUnthread() - Buffer-based upload to Unthread
 * - validateFileSize() - Pre-validation before buffer allocation
 * 
 * Configuration:
 * - PHASE1_CONFIG.useBufferModeByDefault - Controls default processing mode
 * - Environment variable: USE_BUFFER_MODE=false to disable buffer mode
 * - BUFFER_ATTACHMENT_CONFIG - Buffer-specific settings and limits
 * - Automatic fallback to stream mode if buffer mode fails or disabled
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 3.1.0 - Phase 1 Memory Buffer Implementation
 * @since 2025
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fetch, { Response } from 'node-fetch';
import FormData from 'form-data';
import dotenv from 'dotenv';
import { Readable } from 'stream';
import { LogEngine } from '@wgtechlabs/log-engine';

// Type definitions for better TypeScript support
interface TelegramApiResponse {
    ok: boolean;
    result?: TelegramFile;
    description?: string;
}

interface UnthreadApiResponse {
    ts: string;
    [key: string]: any;
}

// Load environment variables
dotenv.config();

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Telegram file information from Bot API
 */
export interface TelegramFile {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
    mime_type?: string;
}

/**
 * File attachment result after processing (Legacy - kept for backward compatibility)
 */
export interface AttachmentResult {
    success: boolean;
    localPath?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    error?: string;
}

/**
 * Stream-based file result for new streaming implementation
 */
export interface StreamResult {
    success: boolean;
    stream?: Readable;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    error?: string;
}

/**
 * Attachment upload parameters (Legacy)
 */
export interface AttachmentUploadParams {
    conversationId: string;
    filePaths: string[];
    message?: string;
}

/**
 * Stream-based upload parameters for new implementation
 */
export interface StreamUploadParams {
    conversationId: string;
    streams: StreamResult[];
    message?: string;
}

/**
 * Stream validator interface for real-time validation
 */
export interface StreamValidator {
    validateSize(currentSize: number, maxSize: number): boolean;
    validateMimeType(chunk: Buffer, fileName: string): string | null;
    validateContent(stream: Readable): Promise<boolean>;
}

/**
 * Stream processing options
 */
export interface StreamProcessingOptions {
    enableValidation: boolean;
    enableEarlyTermination: boolean;
    chunkSize: number;
    timeout: number;
}

/**
 * Phase 3.1 Enhanced Buffer Configuration - Performance & Reliability
 */
export const BUFFER_ATTACHMENT_CONFIG = {
    // File Limits (optimized for performance)
    maxFileSize: 10 * 1024 * 1024,          // 10MB per file (reduced from 20MB)
    maxFiles: 5,                             // 5 files max per message (reduced from 10)
    
    // Network Settings - Phase 3.1 Enhanced
    downloadTimeout: 15000,                  // 15 seconds download timeout
    uploadTimeout: 30000,                    // 30 seconds upload timeout
    retryAttempts: 3,                        // Retry failed operations 3 times
    retryBackoffMs: 1000,                    // 1 second initial backoff, exponential
    
    // Memory Management - Phase 3.1 New
    memoryThreshold: 50 * 1024 * 1024,      // 50MB memory threshold before GC hint
    maxConcurrentFiles: 3,                   // Process max 3 files concurrently
    bufferPoolSize: 5,                       // Reuse buffers when possible
    
    // Performance Monitoring - Phase 3.1 New
    enablePerformanceMetrics: true,          // Track processing times and memory usage
    slowProcessingThresholdMs: 5000,         // Log warning if processing takes >5s
    
    // Security Hardening - Phase 3.1 New
    enableContentValidation: true,           // Validate file content beyond MIME type
    maxFileNameLength: 255,                  // Prevent path traversal attacks
    sanitizeFileNames: true,                 // Remove dangerous characters from filenames
    
    // Supported MIME types
    allowedMimeTypes: [
        // Images
        'image/jpeg',
        'image/png', 
        'image/gif',
        'image/webp',
        'image/bmp',
        
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
        
        // Archives
        'application/zip'
    ],
    
    // File extensions mapping for MIME type fallback
    extensionToMime: {
        // Images
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        
        // Documents  
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        
        // Archives
        '.zip': 'application/zip'
    }
};

/**
 * Phase 3.1 Performance Metrics Interface (Compatible with existing structure)
 */
export interface PerformanceMetrics {
    // Enhanced metrics for Phase 3.1
    processingTimeMs?: number;
    memoryUsageMB?: number;
    fileCount?: number;
    totalSizeMB?: number;
    downloadTimeMs?: number;
    uploadTimeMs?: number;
    retryCount?: number;
    
    // Existing metrics (maintained for compatibility)
    avgProcessingTime: number;
    avgThroughputMBps: number;
    concurrentStreams: number;
    memoryEfficiency: number;
    errorRate: number;
    totalFilesProcessed: number;
    peakMemoryUsage: number;
    timeWindow: number;
}

/**
 * Phase 3.1 Security Validation Result
 */
export interface SecurityValidationResult {
    isValid: boolean;
    sanitizedFileName?: string;
    detectedThreats: string[];
    mimeTypeVerified: boolean;
}

/**
 * Phase 3.1 Enhanced Error with Recovery Suggestions
 */
export interface EnhancedAttachmentError {
    code: string;
    message: string;
    isRetryable: boolean;
    recoverySuggestion?: string;
    performanceImpact?: 'low' | 'medium' | 'high';
}

/**
 * Phase 3.1 Memory Pool for Buffer Reuse
 */
class BufferPool {
    private availableBuffers: Buffer[] = [];
    private readonly maxPoolSize: number;
    private readonly bufferSize: number;

    constructor(maxPoolSize: number = 5, bufferSize: number = 10 * 1024 * 1024) {
        this.maxPoolSize = maxPoolSize;
        this.bufferSize = bufferSize;
    }

    acquire(): Buffer {
        const buffer = this.availableBuffers.pop();
        if (buffer) {
            LogEngine.debug('Reused buffer from pool', { poolSize: this.availableBuffers.length });
            return buffer;
        }
        LogEngine.debug('Created new buffer', { size: this.bufferSize });
        return Buffer.allocUnsafe(this.bufferSize);
    }

    release(buffer: Buffer): void {
        if (this.availableBuffers.length < this.maxPoolSize && buffer.length === this.bufferSize) {
            // Clear buffer for security before reuse
            buffer.fill(0);
            this.availableBuffers.push(buffer);
            LogEngine.debug('Buffer returned to pool', { poolSize: this.availableBuffers.length });
        }
    }

    cleanup(): void {
        this.availableBuffers = [];
        LogEngine.debug('Buffer pool cleaned up');
    }
}

/**
 * Phase 3.1 Global Buffer Pool Instance
 */
const globalBufferPool = new BufferPool(
    BUFFER_ATTACHMENT_CONFIG.bufferPoolSize,
    BUFFER_ATTACHMENT_CONFIG.maxFileSize
);

/**
 * Phase 1 Configuration - Buffer-only processing (Stream approach removed)
 */
export const ATTACHMENT_CONFIG = {
    // Default mode - buffer only (stream mode removed as unreliable)
    bufferModeOnly: true,
    
    // Feature flags
    enableBufferMode: true,                  // Buffer-based processing (only option)
    
    // Migration settings (legacy - can be removed in future)
    enableGradualMigration: false,           // No migration needed - buffer only
};

/**
 * Simple buffer-based file result
 */
export interface BufferResult {
    success: boolean;
    buffer?: Buffer;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    error?: string;
}

/**
 * Simple upload parameters for buffer approach
 */
export interface BufferUploadParams {
    conversationId: string;
    files: BufferResult[];
    message?: string;
}

/**
 * File buffer interface for memory-based processing
 */
export interface FileBuffer {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    size: number;
}

/**
 * Buffer processing result with detailed information
 */
export interface BufferProcessingResult {
    success: boolean;
    processedFiles: number;
    totalFiles: number;
    errors: string[];
    processingTime: number;
}

// Type alias for better readability with extension to MIME mapping
type ExtensionMimeMapKey = keyof typeof BUFFER_ATTACHMENT_CONFIG.extensionToMime;

/**
 * Stream error recovery configuration
 */
export const STREAM_ERROR_CONFIG = {
    // Retry Configuration
    maxRetries: 3,                           // Maximum retry attempts
    retryDelay: 1000,                        // Base delay between retries (ms)
    retryBackoffMultiplier: 2,               // Exponential backoff multiplier
    maxRetryDelay: 10000,                    // Maximum retry delay (ms)
    
    // Network Recovery
    networkTimeout: 15000,                   // Network operation timeout (ms)
    connectionTimeout: 5000,                 // Connection establishment timeout (ms)
    
    // Stream Recovery
    streamRecoveryEnabled: true,             // Enable stream recovery
    partialDownloadResume: true,             // Resume partial downloads
    checksumValidation: false,               // Validate stream integrity (future feature)
    
    // Error Reporting
    detailedErrorReporting: true,            // Include stack traces
    errorAggregation: true,                  // Combine related errors
    contextualLogging: true                  // Include operation context
};

/**
 * Enhanced error types for stream operations
 */
export enum StreamErrorType {
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR', 
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    SIZE_LIMIT_ERROR = 'SIZE_LIMIT_ERROR',
    MIME_TYPE_ERROR = 'MIME_TYPE_ERROR',
    STREAM_CORRUPTED = 'STREAM_CORRUPTED',
    UPLOAD_FAILED = 'UPLOAD_FAILED',
    MEMORY_EXCEEDED = 'MEMORY_EXCEEDED',
    CONCURRENT_LIMIT = 'CONCURRENT_LIMIT',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Enhanced stream error with recovery context
 */
export interface StreamError {
    type: StreamErrorType;
    message: string;
    originalError?: Error;
    fileName?: string;
    fileSize?: number;
    bytesProcessed?: number;
    retryAttempt?: number;
    recoverable: boolean;
    context?: any;
    timestamp: Date;
}

/**
 * Stream operation result with enhanced error information
 */
export interface EnhancedStreamResult extends StreamResult {
    errors?: StreamError[];
    retryAttempts?: number;
    totalProcessingTime?: number;
    networkStats?: {
        downloadTime?: number;
        uploadTime?: number;
        bytesTransferred?: number;
    };
}

/**
 * Batch operation result with aggregated error reporting
 */
export interface BatchStreamResult {
    overallSuccess: boolean;
    successfulStreams: EnhancedStreamResult[];
    failedStreams: EnhancedStreamResult[];
    partialSuccesses: EnhancedStreamResult[];
    totalFiles: number;
    processingTime: number;
    aggregatedErrors: StreamError[];
}

/**
 * Memory management and optimization configuration
 */
export const MEMORY_OPTIMIZATION_CONFIG = {
    // Memory Monitoring - Relaxed thresholds
    memoryCheckInterval: 10000,              // Check memory every 10 seconds (less frequent)
    maxHeapUsagePercent: 85,                 // Alert at 85% heap usage (higher threshold)
    criticalHeapUsagePercent: 95,            // Critical threshold at 95% (higher threshold)
    memoryLeakDetectionEnabled: true,        // Enable memory leak detection
    
    // Stream Optimization
    dynamicChunkSizing: true,                // Adjust chunk size based on memory
    minChunkSize: 32 * 1024,                // 32KB minimum chunk size
    maxChunkSize: 256 * 1024,               // 256KB maximum chunk size
    adaptiveBuffering: true,                 // Dynamic buffer size adjustment
    
    // Concurrency Optimization
    dynamicConcurrencyControl: true,         // Adjust concurrency based on load
    minConcurrentStreams: 1,                 // Minimum concurrent streams
    maxConcurrentStreams: 5,                 // Maximum concurrent streams
    loadBasedThrottling: true,               // Throttle based on system load
    
    // Performance Tuning
    streamPooling: true,                     // Reuse stream objects
    bufferPreallocation: true,               // Pre-allocate buffers
    compressionEnabled: false,               // Stream compression (future feature)
    progressReporting: true,                 // Real-time progress updates
    
    // Resource Limits
    maxTotalMemoryUsage: 100 * 1024 * 1024, // 100MB total memory limit
    streamTimeoutOptimized: 45000,           // Optimized timeout (45s)
    gcThresholdMB: 50,                      // Trigger GC at 50MB
    resourceCleanupInterval: 30000           // Cleanup every 30 seconds
};

/**
 * Stream-based attachment configuration (Legacy - for backward compatibility)
 */
export const STREAM_ATTACHMENT_CONFIG = {
    // File Limits
    telegramMaxSize: 20 * 1024 * 1024,      // 20MB from Telegram
    unthreadMaxSize: 20 * 1024 * 1024,      // 20MB to Unthread
    unthreadMaxFiles: 10,                    // Maximum files per conversation
    maxConcurrentStreams: 5,                 // Maximum concurrent streams
    
    // Stream Configuration
    chunkSize: 64 * 1024,                   // 64KB chunk size
    validateDuringStream: true,              // Real-time validation
    
    // MIME Types and Extensions (same as buffer config)
    allowedMimeTypes: BUFFER_ATTACHMENT_CONFIG.allowedMimeTypes,
    extensionToMime: BUFFER_ATTACHMENT_CONFIG.extensionToMime
};

/**
 * Memory usage statistics interface
 */
export interface MemoryStats {
    heapUsed: number;
    heapTotal: number;
    heapUsagePercent: number;
    external: number;
    rss: number;
    timestamp: Date;
    activeStreams: number;
    bufferCount: number;
    gcSuggested: boolean;
}

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
    avgProcessingTime: number;
    avgThroughputMBps: number;
    concurrentStreams: number;
    memoryEfficiency: number;
    errorRate: number;
    totalFilesProcessed: number;
    peakMemoryUsage: number;
    timeWindow: number; // metrics window in ms
}

/**
 * Stream pool entry for resource reuse
 */
interface StreamPoolEntry {
    id: string;
    stream?: Readable;
    inUse: boolean;
    created: Date;
    lastUsed: Date;
    usageCount: number;
}

/**
 * Optimized stream result with performance data
 */
export interface OptimizedStreamResult extends EnhancedStreamResult {
    memoryUsage?: MemoryStats;
    performance?: PerformanceMetrics;
    optimizations?: {
        chunkSizeUsed: number;
        bufferReused: boolean;
        compressionRatio?: number;
        streamPoolHit: boolean;
    };
}

/**
 * AttachmentHandler Class
 * 
 * Manages the complete lifecycle of file attachments from Telegram to Unthread
 */
export class AttachmentHandler {
    private botToken: string;
    private unthreadApiKey: string;
    private unthreadBaseUrl: string;

    // Memory Management & Optimization - Phase 6 Implementation
    private memoryMonitoringInterval?: NodeJS.Timeout;
    private streamPool: Map<string, StreamPoolEntry> = new Map();
    private performanceMetrics: PerformanceMetrics = {
        avgProcessingTime: 0,
        avgThroughputMBps: 0,
        concurrentStreams: 0,
        memoryEfficiency: 100,
        errorRate: 0,
        totalFilesProcessed: 0,
        peakMemoryUsage: 0,
        timeWindow: 60000 // 1 minute window
    };
    private memoryHistory: MemoryStats[] = [];
    private lastGcTime: number = 0;

    constructor() {
        console.log('[AttachmentHandler] Initializing Phase 3.1 enhanced attachment handler...');
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
        this.unthreadApiKey = process.env.UNTHREAD_API_KEY || '';
        this.unthreadBaseUrl = 'https://api.unthread.io/api';
        
        // Phase 3.1: Enhanced initialization
        LogEngine.info('[AttachmentHandler] Phase 3.1 enhanced attachment handler initialized', {
            hasToken: !!this.botToken,
            hasApiKey: !!this.unthreadApiKey,
            version: '3.1.0',
            features: {
                bufferMode: true,
                performanceMonitoring: BUFFER_ATTACHMENT_CONFIG.enablePerformanceMetrics,
                contentValidation: BUFFER_ATTACHMENT_CONFIG.enableContentValidation,
                retryLogic: BUFFER_ATTACHMENT_CONFIG.retryAttempts > 0,
                memoryOptimization: true
            },
            limits: {
                maxFileSize: `${BUFFER_ATTACHMENT_CONFIG.maxFileSize / 1024 / 1024}MB`,
                maxFiles: BUFFER_ATTACHMENT_CONFIG.maxFiles,
                maxConcurrent: BUFFER_ATTACHMENT_CONFIG.maxConcurrentFiles
            }
        });

        // Phase 3.1: Enable garbage collection if available
        if (global.gc) {
            LogEngine.debug('Garbage collection available for memory optimization');
        } else {
            LogEngine.debug('Garbage collection not available (consider running with --expose-gc)');
        }
    }

    /**
     * Downloads a file from Telegram Bot API using streams
     * 
     * @param fileId - Telegram file ID
     * @returns Promise<StreamResult> - Stream result with readable stream
     */
    async downloadTelegramFileAsStream(fileId: string): Promise<StreamResult> {
        try {
            console.log('[AttachmentHandler] Starting Telegram file stream download, fileId:', fileId);

            // Step 1: Get file info from Telegram with timeout protection
            const fileInfoUrl = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`;
            
            // Create AbortController for timeout handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), STREAM_ERROR_CONFIG.networkTimeout);
            
            let fileInfo: TelegramApiResponse;
            try {
                const fileInfoResponse = await fetch(fileInfoUrl, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                fileInfo = await fileInfoResponse.json() as TelegramApiResponse;
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                    throw new Error('Request timeout while getting file info from Telegram');
                }
                throw fetchError;
            }

            if (!fileInfo.ok) {
                throw new Error(`Telegram API error: ${fileInfo.description}`);
            }

            const telegramFile = fileInfo.result;
            if (!telegramFile?.file_path) {
                throw new Error('No file path received from Telegram API');
            }

            // Step 2: Validate file size using stream config
            if (telegramFile.file_size && telegramFile.file_size > STREAM_ATTACHMENT_CONFIG.telegramMaxSize) {
                return {
                    success: false,
                    error: `File too large: ${(telegramFile.file_size / (1024 * 1024)).toFixed(2)}MB (max: 20MB)`
                };
            }

            // Step 3: Extract file name and determine MIME type
            const fileName = path.basename(telegramFile.file_path);
            const fileExtension = path.extname(fileName).toLowerCase();
            
            // Determine MIME type (Telegram doesn't always provide accurate mime_type)
            let mimeType = telegramFile.mime_type || '';
            if (!mimeType || mimeType === 'application/octet-stream') {
                mimeType = STREAM_ATTACHMENT_CONFIG.extensionToMime[fileExtension as ExtensionMimeMapKey] || 'application/octet-stream';
            }

            // Step 4: Validate file type using stream config
            if (!this.isValidFileTypeStream(mimeType, fileName)) {
                return {
                    success: false,
                    error: `File type not supported: ${mimeType} (${fileExtension})`
                };
            }

            // Step 5: Create streaming download with timeout protection
            const fileDownloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${telegramFile.file_path}`;
            
            // Create AbortController for download timeout
            const downloadController = new AbortController();
            const downloadTimeoutId = setTimeout(() => downloadController.abort(), STREAM_ERROR_CONFIG.networkTimeout);
            
            let fileResponse: Response;
            try {
                fileResponse = await fetch(fileDownloadUrl, {
                    signal: downloadController.signal
                });
                clearTimeout(downloadTimeoutId);
            } catch (downloadError) {
                clearTimeout(downloadTimeoutId);
                if (downloadError instanceof Error && downloadError.name === 'AbortError') {
                    throw new Error('Request timeout while downloading file from Telegram');
                }
                throw downloadError;
            }
            
            if (!fileResponse.ok) {
                throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
            }

            // Step 6: Convert response body to Node.js Readable stream
            if (!fileResponse.body) {
                throw new Error('No response body received from Telegram API');
            }
            
            // Convert response body to Node.js Readable stream with proper error handling
            let stream: Readable;
            try {
                // Check if the body is already a Node.js stream
                if (fileResponse.body instanceof Readable) {
                    stream = fileResponse.body;
                } else if (typeof fileResponse.body[Symbol.asyncIterator] === 'function') {
                    // If it's an async iterable, use Readable.from
                    stream = Readable.from(fileResponse.body);
                } else {
                    // For Web ReadableStream, convert with proper error handling
                    stream = Readable.fromWeb(fileResponse.body as unknown as ReadableStream<Uint8Array>);
                }
            } catch (streamConversionError) {
                console.error('[AttachmentHandler] Failed to convert response body to Node.js stream:', {
                    fileId,
                    error: streamConversionError instanceof Error ? streamConversionError.message : String(streamConversionError),
                    bodyType: typeof fileResponse.body,
                    hasAsyncIterator: typeof fileResponse.body[Symbol.asyncIterator] === 'function'
                });
                throw new Error(`Stream conversion failed: ${streamConversionError instanceof Error ? streamConversionError.message : String(streamConversionError)}`);
            }
            
            // Add basic timeout handling (streams don't have setTimeout, we'll handle this differently)
            // For now, just log that we have the stream

            console.log('[AttachmentHandler] File stream created successfully:', {
                fileName,
                fileSize: telegramFile.file_size,
                mimeType,
                streamCreated: true
            });

            return {
                success: true,
                stream,
                fileName,
                fileSize: telegramFile.file_size || 0,
                mimeType
            };

        } catch (error) {
            console.error('[AttachmentHandler] Failed to download Telegram file as stream:', {
                fileId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: `Stream download failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Validates file type against allowed MIME types (Stream version)
     * 
     * @param mimeType - MIME type to validate
     * @param fileName - File name for extension fallback
     * @returns True if file type is allowed
     */
    private isValidFileTypeStream(mimeType: string, fileName: string): boolean {
        // First check direct MIME type
        if (STREAM_ATTACHMENT_CONFIG.allowedMimeTypes.includes(mimeType)) {
            return true;
        }
        
        // Fallback to file extension
        const extension = path.extname(fileName).toLowerCase();
        const expectedMime = STREAM_ATTACHMENT_CONFIG.extensionToMime[extension as ExtensionMimeMapKey];
        
        return expectedMime ? STREAM_ATTACHMENT_CONFIG.allowedMimeTypes.includes(expectedMime) : false;
    }

    /**
     * Creates multiple file streams concurrently with controlled concurrency
     * 
     * @param fileIds - Array of Telegram file IDs
     * @returns Promise<StreamResult[]> - Array of stream results
     */
    async downloadMultipleFilesAsStreams(fileIds: string[]): Promise<StreamResult[]> {
        console.log(`[AttachmentHandler] Starting concurrent stream downloads for ${fileIds.length} files`);
        
        // Validate file count
        if (fileIds.length > STREAM_ATTACHMENT_CONFIG.unthreadMaxFiles) {
            throw new Error(`Too many files: ${fileIds.length} (max: ${STREAM_ATTACHMENT_CONFIG.unthreadMaxFiles})`);
        }

        // Process files with controlled concurrency
        const results: StreamResult[] = [];
        const concurrencyLimit = STREAM_ATTACHMENT_CONFIG.maxConcurrentStreams;
        
        for (let i = 0; i < fileIds.length; i += concurrencyLimit) {
            const batch = fileIds.slice(i, i + concurrencyLimit);
            const batchPromises = batch.map(fileId => this.downloadTelegramFileAsStream(fileId));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`[AttachmentHandler] Completed stream downloads: ${successCount}/${fileIds.length} successful`);

        return results;
    }

    // ===================================================================
    // MEMORY BUFFER IMPLEMENTATION - Core Functions
    // ===================================================================

    /**
     * Creates a validation stream that processes chunks in real-time
     * 
     * @param fileName - File name for context
     * @param expectedSize - Expected file size from Telegram API
     * @param mimeType - Expected MIME type
     * @returns Transform stream that validates while passing data through
     */
    private createValidationStream(fileName: string, expectedSize?: number, mimeType?: string): NodeJS.ReadWriteStream {
        const { Transform } = require('stream');
        let bytesProcessed = 0;
        let mimeTypeDetected = false;
        let isFirstChunk = true;

        return new Transform({
            transform(chunk: Buffer, encoding: string, callback: Function) {
                try {
                    // Track bytes processed
                    bytesProcessed += chunk.length;

                    // Real-time size validation
                    if (bytesProcessed > STREAM_ATTACHMENT_CONFIG.unthreadMaxSize) {
                        const error = new Error(`File size exceeded during streaming: ${fileName} (${bytesProcessed} bytes > ${STREAM_ATTACHMENT_CONFIG.unthreadMaxSize})`);
                        return callback(error);
                    }

                    // MIME type detection on first chunk
                    if (isFirstChunk && STREAM_ATTACHMENT_CONFIG.validateDuringStream) {
                        const detectedMimeType = this.detectMimeTypeFromBuffer(chunk, fileName);
                        
                        if (!this.isValidDetectedMimeType(detectedMimeType, fileName)) {
                            const error = new Error(`Invalid file type detected during streaming: ${fileName} (detected: ${detectedMimeType})`);
                            return callback(error);
                        }

                        mimeTypeDetected = true;
                        isFirstChunk = false;
                        
                        console.log('[StreamValidator] File validated during streaming:', {
                            fileName,
                            detectedMimeType,
                            expectedMimeType: mimeType,
                            bytesProcessed
                        });
                    }

                    // Pass chunk through unchanged
                    callback(null, chunk);

                } catch (error) {
                    console.error('[StreamValidator] Validation error during streaming:', {
                        fileName,
                        bytesProcessed,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    callback(error);
                }
            },

            flush(callback: Function) {
                // Final validation when stream ends
                console.log('[StreamValidator] Stream validation complete:', {
                    fileName,
                    totalBytes: bytesProcessed,
                    expectedSize,
                    mimeTypeValidated: mimeTypeDetected
                });

                // Verify final size matches expected (if provided)
                if (expectedSize && Math.abs(bytesProcessed - expectedSize) > 1024) {
                    const error = new Error(`File size mismatch: ${fileName} (expected: ${expectedSize}, actual: ${bytesProcessed})`);
                    return callback(error);
                }

                callback();
            }
        });
    }

    /**
     * Detects MIME type from file buffer content
     * 
     * @param buffer - First chunk of file data
     * @param fileName - File name for extension fallback
     * @returns Detected MIME type or null if unknown
     */
    private detectMimeTypeFromBuffer(buffer: Buffer, fileName: string): string | null {
        // Magic number detection for common file types
        const magicNumbers: { [key: string]: string } = {
            // Images
            'ffd8ff': 'image/jpeg',          // JPEG
            '89504e47': 'image/png',         // PNG
            '47494638': 'image/gif',         // GIF
            '52494646': 'image/webp',        // WEBP (starts with RIFF)
            '424d': 'image/bmp',             // BMP
            
            // Documents
            '25504446': 'application/pdf',   // PDF
            'd0cf11e0': 'application/msword', // MS Office (old format)
            '504b0304': 'application/zip',   // ZIP-based files (includes modern Office formats)
            
            // Text files (no reliable magic number, use extension)
        };

        // Get first 8 bytes as hex string
        const hex = buffer.toString('hex', 0, Math.min(8, buffer.length)).toLowerCase();
        
        // Check for magic number matches
        for (const [magic, mimeType] of Object.entries(magicNumbers)) {
            if (hex.startsWith(magic)) {
                return mimeType;
            }
        }

        // Special handling for ZIP-based Microsoft Office files
        if (hex.startsWith('504b0304')) {
            const extension = path.extname(fileName).toLowerCase();
            if (extension === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            if (extension === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            return 'application/zip';
        }

        // Fallback to extension-based detection
        const extension = path.extname(fileName).toLowerCase();
        return STREAM_ATTACHMENT_CONFIG.extensionToMime[extension as ExtensionMimeMapKey] || null;
    }

    /**
     * Validates detected MIME type against allowed types
     * 
     * @param detectedMimeType - MIME type detected from content
     * @param fileName - File name for additional context
     * @returns True if MIME type is valid and allowed
     */
    private isValidDetectedMimeType(detectedMimeType: string | null, fileName: string): boolean {
        if (!detectedMimeType) {
            console.warn('[StreamValidator] Could not detect MIME type for file:', fileName);
            return false;
        }

        const isAllowed = STREAM_ATTACHMENT_CONFIG.allowedMimeTypes.includes(detectedMimeType);
        
        if (!isAllowed) {
            console.warn('[StreamValidator] Detected MIME type not allowed:', {
                fileName,
                detectedMimeType,
                allowedTypes: STREAM_ATTACHMENT_CONFIG.allowedMimeTypes
            });
        }

        return isAllowed;
    }

    /**
     * Enhanced stream download with integrated validation
     * 
     * @param fileId - Telegram file ID
     * @returns Promise<StreamResult> - Stream result with validation applied
     */
    async downloadTelegramFileAsStreamWithValidation(fileId: string): Promise<StreamResult> {
        try {
            console.log('[AttachmentHandler] Starting validated stream download, fileId:', fileId);

            // Get basic stream first
            const basicStreamResult = await this.downloadTelegramFileAsStream(fileId);
            
            if (!basicStreamResult.success || !basicStreamResult.stream) {
                return basicStreamResult;
            }

            // Create validation pipeline
            const validationStream = this.createValidationStream(
                basicStreamResult.fileName || 'unknown',
                basicStreamResult.fileSize,
                basicStreamResult.mimeType
            );

            // Create pipeline: source stream → validation → output
            const { pipeline } = require('stream');
            const { PassThrough } = require('stream');
            const outputStream = new PassThrough();

            // Set up pipeline with error handling
            pipeline(
                basicStreamResult.stream,
                validationStream,
                outputStream,
                (error: Error | null) => {
                    if (error) {
                        console.error('[StreamValidator] Pipeline error:', {
                            fileId,
                            fileName: basicStreamResult.fileName,
                            error: error.message
                        });
                        outputStream.destroy(error);
                    }
                }
            );

            console.log('[AttachmentHandler] Validation pipeline created for:', basicStreamResult.fileName);

            const result: StreamResult = {
                success: true,
                stream: outputStream,
                ...(basicStreamResult.fileName && { fileName: basicStreamResult.fileName }),
                ...(basicStreamResult.fileSize && { fileSize: basicStreamResult.fileSize }),
                ...(basicStreamResult.mimeType && { mimeType: basicStreamResult.mimeType })
            };

            return result;

        } catch (error) {
            console.error('[AttachmentHandler] Failed to create validated stream:', {
                fileId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: `Validated stream creation failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Stream-Based Direct Upload Implementation
     * 
     * Uploads stream data directly to Unthread without temporary files.
     * This is the core functionality that eliminates disk I/O completely.
     */

    /**
     * Uploads streams directly to Unthread using multipart/form-data
     * 
     * @param params - Upload parameters with conversation ID and stream array
     * @returns Promise<boolean> - Success status
     */
    async uploadStreamsToUnthread(params: StreamUploadParams): Promise<boolean> {
        try {
            console.log('[AttachmentHandler] Starting direct stream upload to Unthread:', {
                conversationId: params.conversationId,
                streamCount: params.streams.length
            });

            // Validate streams before upload
            const validStreams = params.streams.filter(stream => stream.success && stream.stream);
            if (validStreams.length === 0) {
                console.warn('[AttachmentHandler] No valid streams to upload');
                return false;
            }

            // Create form data with stream support
            const form = new FormData();
            
            // Add the message payload as JSON
            const messagePayload = {
                conversationId: params.conversationId,
                message: params.message || 'File attachment(s) uploaded via Telegram (Stream)'
            };
            
            form.append('payload_json', JSON.stringify(messagePayload));

            // Add each stream as a file to the form
            for (let i = 0; i < validStreams.length; i++) {
                const streamResult = validStreams[i];
                if (!streamResult || !streamResult.stream || !streamResult.fileName) {
                    console.warn('[AttachmentHandler] Skipping invalid stream:', streamResult);
                    continue;
                }

                // Create file options for FormData
                const fileOptions = {
                    filename: streamResult.fileName,
                    contentType: streamResult.mimeType || 'application/octet-stream'
                };

                // Add stream to form data
                form.append('files', streamResult.stream, fileOptions);
                
                console.log('[AttachmentHandler] Added stream to form:', {
                    fileName: streamResult.fileName,
                    mimeType: streamResult.mimeType,
                    fileSize: streamResult.fileSize,
                    streamIndex: i
                });
            }

            // Upload to Unthread with streaming body
            console.log('[AttachmentHandler] Sending stream upload request to Unthread...');
            const response = await fetch(`${this.unthreadBaseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.unthreadApiKey}`,
                    ...form.getHeaders()
                },
                body: form
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Unthread API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json() as UnthreadApiResponse;
            
            console.log('[AttachmentHandler] Streams uploaded to Unthread successfully:', {
                conversationId: params.conversationId,
                messageId: result.ts,
                streamCount: validStreams.length,
                totalFileSize: validStreams.reduce((sum, s) => sum + (s.fileSize || 0), 0)
            });

            return true;

        } catch (error) {
            console.error('[AttachmentHandler] Failed to upload streams to Unthread:', {
                conversationId: params.conversationId,
                streamCount: params.streams.length,
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Enhanced stream upload to Unthread with comprehensive error handling
     */
    async uploadStreamsToUnthreadWithRecovery(params: StreamUploadParams): Promise<boolean> {
        const startTime = Date.now();
        const errors: StreamError[] = [];

        try {
            console.log(`[AttachmentHandler] Starting enhanced upload for ${params.streams.length} streams to conversation ${params.conversationId}`);

            // Validate streams before upload
            const validStreams = params.streams.filter(stream => {
                if (!stream.success || !stream.stream) {
                    errors.push(this.createStreamError(
                        StreamErrorType.VALIDATION_ERROR,
                        `Invalid stream: ${stream.error || 'Stream not available'}`,
                        undefined,
                        { fileName: stream.fileName }
                    ));
                    return false;
                }
                return true;
            });

            if (validStreams.length === 0) {
                throw this.createStreamError(
                    StreamErrorType.VALIDATION_ERROR,
                    'No valid streams available for upload',
                    undefined,
                    { totalStreams: params.streams.length }
                );
            }

            // Perform upload with retry logic
            const uploadResult = await this.retryWithBackoff(async () => {
                const form = new FormData();
                
                // Add the message payload as JSON (same format as working method)
                const messagePayload = {
                    conversationId: params.conversationId,
                    message: params.message || 'File attachment(s) uploaded via Telegram (Stream-Recovery)'
                };
                
                form.append('payload_json', JSON.stringify(messagePayload));

                // Add each valid stream to form
                validStreams.forEach((streamResult, index) => {
                    if (streamResult.stream && streamResult.fileName) {
                        const options: any = {
                            filename: streamResult.fileName
                        };
                        
                        if (streamResult.mimeType) {
                            options.contentType = streamResult.mimeType;
                        }
                        
                        form.append(`files`, streamResult.stream, options);
                    }
                });

                // Make upload request with timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), STREAM_ERROR_CONFIG.networkTimeout);

                try {
                    console.log('[AttachmentHandler] Making upload request to:', `${this.unthreadBaseUrl}/messages`);
                    const response = await fetch(`${this.unthreadBaseUrl}/messages`, {
                        method: 'POST',
                        body: form,
                        headers: {
                            'Authorization': `Bearer ${this.unthreadApiKey}`,
                            ...form.getHeaders()
                        },
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => 'Unknown error');
                        throw new Error(`HTTP ${response.status}: ${errorText}`);
                    }

                    const result = await response.json() as UnthreadApiResponse;
                    return result;

                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            }, { 
                fileName: `${validStreams.length} files`, 
                fileSize: validStreams.reduce((sum, s) => sum + (s.fileSize || 0), 0) 
            });

            const processingTime = Date.now() - startTime;

            console.log(`[AttachmentHandler] Enhanced upload completed successfully:`, {
                conversationId: params.conversationId,
                filesUploaded: validStreams.length,
                totalProcessingTime: `${processingTime}ms`,
                messageId: uploadResult.ts
            });

            return true;

        } catch (error) {
            const streamError = error instanceof Error && 'type' in error && 'recoverable' in error && 'timestamp' in error ? 
                error as StreamError : 
                this.createStreamError(
                    this.classifyError(error),
                    error instanceof Error ? error.message : String(error),
                    error instanceof Error ? error : undefined,
                    { conversationId: params.conversationId, streamCount: params.streams.length }
                );

            errors.push(streamError);

            console.error('[AttachmentHandler] Enhanced upload failed:', {
                conversationId: params.conversationId,
                streamCount: params.streams.length,
                error: streamError instanceof Error ? streamError.message : String(streamError),
                errorType: streamError.type || 'unknown',
                stack: streamError instanceof Error ? streamError.stack : undefined,
                retryAttempts: streamError.retryAttempt || 0,
                processingTime: `${Date.now() - startTime}ms`
            });

            return false;
        }
    }

    /**
     * Gets MIME type from file name using stream config
     */
    private getMimeTypeFromFileNameStream(fileName: string): string {
        const extension = path.extname(fileName).toLowerCase();
        return STREAM_ATTACHMENT_CONFIG.extensionToMime[extension] || 'application/octet-stream';
    }

    /**
     * Creates an enhanced error object with recovery context
     */
    private createStreamError(
        type: StreamErrorType,
        message: string,
        originalError?: Error,
        context?: any
    ): StreamError {
        return {
            type,
            message,
            originalError,
            recoverable: this.isRecoverableError(type),
            context,
            timestamp: new Date(),
            ...context
        };
    }

    /**
     * Determines if an error type is recoverable through retry
     */
    private isRecoverableError(errorType: StreamErrorType): boolean {
        const recoverableErrors = [
            StreamErrorType.NETWORK_ERROR,
            StreamErrorType.TIMEOUT_ERROR,
            StreamErrorType.UPLOAD_FAILED,
            StreamErrorType.CONCURRENT_LIMIT
        ];
        
        return recoverableErrors.includes(errorType);
    }

    /**
     * Implements exponential backoff retry logic
     */
    private async retryWithBackoff<T>(
        operation: () => Promise<T>,
        errorContext: { fileName?: string; fileSize?: number } = {},
        retryAttempt: number = 0
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            const streamError = this.createStreamError(
                this.classifyError(error),
                error instanceof Error ? error.message : String(error),
                error instanceof Error ? error : undefined,
                { ...errorContext, retryAttempt }
            );

            // Check if we should retry
            if (!streamError.recoverable || retryAttempt >= STREAM_ERROR_CONFIG.maxRetries) {
                throw streamError;
            }

            // Calculate retry delay with exponential backoff
            const delay = Math.min(
                STREAM_ERROR_CONFIG.retryDelay * Math.pow(STREAM_ERROR_CONFIG.retryBackoffMultiplier, retryAttempt),
                STREAM_ERROR_CONFIG.maxRetryDelay
            );

            console.warn(`[AttachmentHandler] Retrying operation after ${delay}ms (attempt ${retryAttempt + 1}/${STREAM_ERROR_CONFIG.maxRetries}):`, {
                error: streamError.message,
                fileName: errorContext.fileName
            });

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delay));

            // Recursive retry
            return await this.retryWithBackoff(operation, errorContext, retryAttempt + 1);
        }
    }

    /**
     * Classifies errors into stream error types
     */
    private classifyError(error: any): StreamErrorType {
        if (!error) return StreamErrorType.UNKNOWN_ERROR;

        const message = error.message?.toLowerCase() || String(error).toLowerCase();

        // Network-related errors
        if (message.includes('fetch') || message.includes('network') || 
            message.includes('connection') || message.includes('econnreset') ||
            message.includes('enotfound') || message.includes('timeout')) {
            return StreamErrorType.NETWORK_ERROR;
        }

        // Timeout errors
        if (message.includes('timeout') || message.includes('aborted')) {
            return StreamErrorType.TIMEOUT_ERROR;
        }

        // Size limit errors
        if (message.includes('size') || message.includes('limit') || message.includes('too large')) {
            return StreamErrorType.SIZE_LIMIT_ERROR;
        }

        // MIME type errors
        if (message.includes('mime') || message.includes('type') || message.includes('format')) {
            return StreamErrorType.MIME_TYPE_ERROR;
        }

        // Memory errors
        if (message.includes('memory') || message.includes('heap') || message.includes('allocation')) {
            return StreamErrorType.MEMORY_EXCEEDED;
        }

        // Upload errors
        if (message.includes('upload') || message.includes('http') || error.status) {
            return StreamErrorType.UPLOAD_FAILED;
        }

        return StreamErrorType.UNKNOWN_ERROR;
    }

    // Memory Management & Optimization - Phase 6 Implementation

    /**
     * Initializes memory monitoring and optimization features
     */
    private initializeMemoryOptimization(): void {
        if (MEMORY_OPTIMIZATION_CONFIG.memoryLeakDetectionEnabled) {
            this.startMemoryMonitoring();
        }

        if (MEMORY_OPTIMIZATION_CONFIG.resourceCleanupInterval > 0) {
            this.startResourceCleanup();
        }

        console.log('[MemoryOptimizer] Memory optimization initialized:', {
            monitoring: MEMORY_OPTIMIZATION_CONFIG.memoryLeakDetectionEnabled,
            cleanup: MEMORY_OPTIMIZATION_CONFIG.resourceCleanupInterval > 0,
            pooling: MEMORY_OPTIMIZATION_CONFIG.streamPooling
        });
    }

    /**
     * Starts memory monitoring at configured intervals
     */
    private startMemoryMonitoring(): void {
        this.memoryMonitoringInterval = setInterval(() => {
            const stats = this.getMemoryStats();
            this.memoryHistory.push(stats);

            // Keep only recent history (last hour)
            const cutoff = Date.now() - 3600000; // 1 hour
            this.memoryHistory = this.memoryHistory.filter(s => s.timestamp.getTime() > cutoff);

            // Check for memory pressure
            if (stats.heapUsagePercent > MEMORY_OPTIMIZATION_CONFIG.criticalHeapUsagePercent) {
                this.handleMemoryPressure(stats);
            } else if (stats.heapUsagePercent > MEMORY_OPTIMIZATION_CONFIG.maxHeapUsagePercent) {
                this.handleMemoryWarning(stats);
            }

            // Update performance metrics
            this.updatePerformanceMetrics(stats);

        }, MEMORY_OPTIMIZATION_CONFIG.memoryCheckInterval);
    }

    /**
     * Starts resource cleanup at configured intervals
     */
    private startResourceCleanup(): void {
        setInterval(() => {
            this.cleanupResources();
        }, MEMORY_OPTIMIZATION_CONFIG.resourceCleanupInterval);
    }

    /**
     * Gets current memory statistics
     */
    private getMemoryStats(): MemoryStats {
        const memUsage = process.memoryUsage();
        const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

        return {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            heapUsagePercent,
            external: memUsage.external,
            rss: memUsage.rss,
            timestamp: new Date(),
            activeStreams: this.getActiveStreamCount(),
            bufferCount: this.streamPool.size,
            gcSuggested: heapUsagePercent > MEMORY_OPTIMIZATION_CONFIG.maxHeapUsagePercent
        };
    }

    /**
     * Handles critical memory pressure situations
     */
    private handleMemoryPressure(stats: MemoryStats): void {
        console.warn('[MemoryOptimizer] Critical memory pressure detected:', {
            heapUsagePercent: stats.heapUsagePercent.toFixed(2),
            heapUsed: `${(stats.heapUsed / 1024 / 1024).toFixed(2)}MB`,
            activeStreams: stats.activeStreams
        });

        // Emergency cleanup
        this.emergencyCleanup();

        // Force garbage collection only in development environments
        if (process.env.NODE_ENV !== 'production' && global.gc) {
            global.gc();
            console.log('[MemoryOptimizer] Emergency garbage collection triggered (development mode)');
        }

        // Reduce concurrency limit temporarily
        if (MEMORY_OPTIMIZATION_CONFIG.dynamicConcurrencyControl) {
            this.adjustConcurrencyLimit(1);
        }
    }

    /**
     * Handles memory warning situations
     */
    private handleMemoryWarning(stats: MemoryStats): void {
        console.warn('[MemoryOptimizer] Memory warning:', {
            heapUsagePercent: stats.heapUsagePercent.toFixed(2),
            heapUsed: `${(stats.heapUsed / 1024 / 1024).toFixed(2)}MB`
        });

        // Proactive cleanup
        this.cleanupResources();

        // Suggest garbage collection only in development environments
        if (Date.now() - this.lastGcTime > 30000 && process.env.NODE_ENV !== 'production' && global.gc) {
            global.gc();
            this.lastGcTime = Date.now();
            console.log('[MemoryOptimizer] Garbage collection suggested (development mode)');
        }
    }

    /**
     * Emergency cleanup for critical memory situations
     */
    private emergencyCleanup(): void {
        // Clear stream pool
        this.streamPool.clear();

        // Clear old memory history
        this.memoryHistory = this.memoryHistory.slice(-10); // Keep only last 10 entries

        console.log('[MemoryOptimizer] Emergency cleanup completed');
    }

    /**
     * Regular resource cleanup
     */
    private cleanupResources(): void {
        const now = Date.now();
        let cleaned = 0;

        // Clean up unused stream pool entries
        for (const [id, entry] of this.streamPool.entries()) {
            const age = now - entry.lastUsed.getTime();
            
            // Remove entries older than 5 minutes and not in use
            if (!entry.inUse && age > 300000) {
                if (entry.stream) {
                    entry.stream.destroy();
                }
                this.streamPool.delete(id);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[MemoryOptimizer] Cleaned up ${cleaned} unused stream pool entries`);
        }
    }

    /**
     * Gets the count of currently active streams
     */
    private getActiveStreamCount(): number {
        return Array.from(this.streamPool.values()).filter(entry => entry.inUse).length;
    }

    /**
     * Adjusts concurrency limit based on memory pressure
     */
    private adjustConcurrencyLimit(newLimit: number): void {
        const limit = Math.max(
            MEMORY_OPTIMIZATION_CONFIG.minConcurrentStreams,
            Math.min(MEMORY_OPTIMIZATION_CONFIG.maxConcurrentStreams, newLimit)
        );

        console.log(`[MemoryOptimizer] Adjusting concurrency limit to ${limit}`);
        // This would typically update the STREAM_ATTACHMENT_CONFIG.maxConcurrentStreams
        // For now, we'll just log the adjustment
    }

    /**
     * Updates performance metrics based on current stats
     */
    private updatePerformanceMetrics(stats: MemoryStats): void {
        this.performanceMetrics.concurrentStreams = stats.activeStreams;
        this.performanceMetrics.peakMemoryUsage = Math.max(
            this.performanceMetrics.peakMemoryUsage,
            stats.heapUsed
        );
        this.performanceMetrics.memoryEfficiency = Math.max(0, 100 - stats.heapUsagePercent);
    }

    /**
     * Calculates optimal chunk size based on current memory usage
     */
    private calculateOptimalChunkSize(): number {
        if (!MEMORY_OPTIMIZATION_CONFIG.dynamicChunkSizing) {
            return STREAM_ATTACHMENT_CONFIG.chunkSize;
        }

        const stats = this.getMemoryStats();
        const memoryPressure = stats.heapUsagePercent / 100;

        // Reduce chunk size under memory pressure
        const baseSize = STREAM_ATTACHMENT_CONFIG.chunkSize;
        const minSize = MEMORY_OPTIMIZATION_CONFIG.minChunkSize;
        const maxSize = MEMORY_OPTIMIZATION_CONFIG.maxChunkSize;

        let optimalSize = baseSize;

        if (memoryPressure > 0.8) {
            // High memory pressure: use smaller chunks
            optimalSize = Math.max(minSize, baseSize * 0.5);
        } else if (memoryPressure < 0.4) {
            // Low memory pressure: can use larger chunks for better performance
            optimalSize = Math.min(maxSize, baseSize * 1.5);
        }

        return Math.floor(optimalSize);
    }

    /**
     * Calculates optimal concurrency based on system load
     */
    private calculateOptimalConcurrency(): number {
        if (!MEMORY_OPTIMIZATION_CONFIG.dynamicConcurrencyControl) {
            return STREAM_ATTACHMENT_CONFIG.maxConcurrentStreams;
        }

        const stats = this.getMemoryStats();
        const memoryPressure = stats.heapUsagePercent / 100;
        const activeStreams = stats.activeStreams;

        const minConcurrency = MEMORY_OPTIMIZATION_CONFIG.minConcurrentStreams;
        const maxConcurrency = MEMORY_OPTIMIZATION_CONFIG.maxConcurrentStreams;

        let optimalConcurrency = STREAM_ATTACHMENT_CONFIG.maxConcurrentStreams;

        // Reduce concurrency under memory pressure
        if (memoryPressure > 0.8) {
            optimalConcurrency = Math.max(minConcurrency, Math.floor(maxConcurrency * 0.5));
        } else if (memoryPressure > 0.6) {
            optimalConcurrency = Math.max(minConcurrency, Math.floor(maxConcurrency * 0.7));
        } else if (memoryPressure < 0.3 && activeStreams < maxConcurrency) {
            // Low memory pressure: can increase concurrency
            optimalConcurrency = maxConcurrency;
        }

        return optimalConcurrency;
    }

    /**
     * Gets or creates a stream from the pool for resource reuse
     */
    private getPooledStream(id: string): StreamPoolEntry | null {
        if (!MEMORY_OPTIMIZATION_CONFIG.streamPooling) {
            return null;
        }

        const existing = this.streamPool.get(id);
        if (existing && !existing.inUse) {
            existing.inUse = true;
            existing.lastUsed = new Date();
            existing.usageCount++;
            return existing;
        }

        return null;
    }

    /**
     * Returns a stream to the pool for reuse
     */
    private returnStreamToPool(id: string, stream: Readable): void {
        if (!MEMORY_OPTIMIZATION_CONFIG.streamPooling) {
            return;
        }

        const entry: StreamPoolEntry = {
            id,
            stream,
            inUse: false,
            created: new Date(),
            lastUsed: new Date(),
            usageCount: 1
        };

        this.streamPool.set(id, entry);
    }

    /**
     * Enhanced stream download with memory optimization
     */
    async downloadTelegramFileAsStreamOptimized(
        fileId: string,
        fileName: string = 'unknown'
    ): Promise<OptimizedStreamResult> {
        const startTime = Date.now();
        const initialMemory = this.getMemoryStats();

        try {
            // Check for pooled stream
            const pooledStream = this.getPooledStream(fileId);
            if (pooledStream) {
                console.log('[MemoryOptimizer] Using pooled stream for:', fileName);
                
                return {
                    success: true,
                    stream: pooledStream.stream,
                    fileName,
                    memoryUsage: this.getMemoryStats(),
                    optimizations: {
                        chunkSizeUsed: this.calculateOptimalChunkSize(),
                        bufferReused: true,
                        streamPoolHit: true
                    }
                } as OptimizedStreamResult;
            }

            // Calculate optimal processing parameters
            const optimalChunkSize = this.calculateOptimalChunkSize();
            const optimalConcurrency = this.calculateOptimalConcurrency();

            console.log('[MemoryOptimizer] Optimized parameters for download:', {
                fileName,
                chunkSize: optimalChunkSize,
                concurrency: optimalConcurrency,
                memoryUsage: `${initialMemory.heapUsagePercent.toFixed(2)}%`
            });

            // Use existing enhanced download method with optimizations
            const result = await this.downloadTelegramFileAsStream(fileId);

            const finalMemory = this.getMemoryStats();
            const processingTime = Date.now() - startTime;

            // Return stream to pool if successful
            if (result.success && result.stream) {
                this.returnStreamToPool(fileId, result.stream);
            }

            return {
                ...result,
                memoryUsage: finalMemory,
                totalProcessingTime: processingTime,
                optimizations: {
                    chunkSizeUsed: optimalChunkSize,
                    bufferReused: false,
                    streamPoolHit: false
                }
            } as OptimizedStreamResult;

        } catch (error) {
            console.error('[MemoryOptimizer] Optimized download failed:', {
                fileId,
                fileName,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                memoryUsage: this.getMemoryStats(),
                totalProcessingTime: Date.now() - startTime
            } as OptimizedStreamResult;
        }
    }

    /**
     * Memory-optimized batch processing with adaptive concurrency
     */
    async processAttachmentsWithMemoryOptimization(
        fileIds: string[],
        conversationId: string,
        message?: string
    ): Promise<BatchStreamResult> {
        const startTime = Date.now();
        console.log(`[MemoryOptimizer] Starting memory-optimized processing for ${fileIds.length} files`);

        try {
            // Initialize memory optimization if not already done
            if (!this.memoryMonitoringInterval) {
                this.initializeMemoryOptimization();
            }

            // Pre-flight memory check
            const initialMemory = this.getMemoryStats();
            if (initialMemory.heapUsagePercent > MEMORY_OPTIMIZATION_CONFIG.criticalHeapUsagePercent) {
                console.warn('[MemoryOptimizer] Memory pressure too high, performing cleanup first');
                this.cleanupResources();
                
                // Wait a moment for cleanup to take effect
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Calculate adaptive batch size based on memory
            const optimalConcurrency = this.calculateOptimalConcurrency();
            const adaptiveBatchSize = Math.min(optimalConcurrency, fileIds.length);

            console.log('[MemoryOptimizer] Adaptive processing parameters:', {
                originalBatchSize: STREAM_ATTACHMENT_CONFIG.maxConcurrentStreams,
                adaptiveBatchSize,
                memoryUsage: `${initialMemory.heapUsagePercent.toFixed(2)}%`
            });

            const results: EnhancedStreamResult[] = [];
            const aggregatedErrors: StreamError[] = [];

            // Process files in adaptive batches
            for (let i = 0; i < fileIds.length; i += adaptiveBatchSize) {
                const batch = fileIds.slice(i, i + adaptiveBatchSize);
                
                // Memory check before each batch
                const batchMemory = this.getMemoryStats();
                if (batchMemory.heapUsagePercent > MEMORY_OPTIMIZATION_CONFIG.maxHeapUsagePercent) {
                    console.warn('[MemoryOptimizer] Memory pressure detected, reducing batch size');
                    // Process one at a time under memory pressure
                    for (const fileId of batch) {
                        const result = await this.downloadTelegramFileAsStream(fileId);
                        results.push(result);
                        
                        // Memory pressure handling between files
                        if (MEMORY_OPTIMIZATION_CONFIG.loadBasedThrottling) {
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    }
                } else {
                    // Normal batch processing
                    const batchPromises = batch.map(fileId => 
                        this.downloadTelegramFileAsStream(fileId)
                    );
                    const batchResults = await Promise.allSettled(batchPromises);
                    
                    batchResults.forEach(result => {
                        if (result.status === 'fulfilled') {
                            results.push(result.value);
                        } else {
                            const errorResult: EnhancedStreamResult = {
                                success: false,
                                error: result.reason?.message || 'Batch processing failed'
                            };
                            results.push(errorResult);
                        }
                    });
                }

                // Adaptive delay between batches based on memory pressure
                if (i + adaptiveBatchSize < fileIds.length) {
                    const currentMemory = this.getMemoryStats();
                    const delay = currentMemory.heapUsagePercent > 70 ? 500 : 100;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // Upload successful streams
            const successfulStreams = results.filter(r => r.success);
            let uploadSuccess = false;

            if (successfulStreams.length > 0) {
                const uploadParams: StreamUploadParams = {
                    conversationId,
                    streams: successfulStreams,
                    ...(message && { message })
                };
                
                uploadSuccess = await this.uploadStreamsToUnthreadWithRecovery(uploadParams);
            }

            const finalMemory = this.getMemoryStats();
            const processingTime = Date.now() - startTime;

            // Update performance metrics
            this.performanceMetrics.avgProcessingTime = processingTime;
            this.performanceMetrics.totalFilesProcessed += fileIds.length;
            this.performanceMetrics.errorRate = (results.filter(r => !r.success).length / results.length) * 100;

            console.log('[MemoryOptimizer] Memory-optimized processing completed:', {
                fileCount: fileIds.length,
                successful: successfulStreams.length,
                uploaded: uploadSuccess ? successfulStreams.length : 0,
                memoryDelta: `${(finalMemory.heapUsagePercent - initialMemory.heapUsagePercent).toFixed(2)}%`,
                processingTime: `${processingTime}ms`
            });

            return {
                overallSuccess: uploadSuccess && successfulStreams.length > 0,
                successfulStreams,
                failedStreams: results.filter(r => !r.success),
                partialSuccesses: results.filter(r => r.success && (r as any).errors?.length > 0),
                totalFiles: fileIds.length,
                processingTime,
                aggregatedErrors
            };

        } catch (error) {
            console.error('[MemoryOptimizer] Memory-optimized processing failed:', {
                fileCount: fileIds.length,
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                overallSuccess: false,
                successfulStreams: [],
                failedStreams: [],
                partialSuccesses: [],
                totalFiles: fileIds.length,
                processingTime: Date.now() - startTime,
                aggregatedErrors: [this.createStreamError(
                    StreamErrorType.UNKNOWN_ERROR,
                    error instanceof Error ? error.message : String(error),
                    error instanceof Error ? error : undefined
                )]
            };
        }
    }

    // ===================================================================
    // PHASE 3.1: ENHANCED MEMORY BUFFER IMPLEMENTATION - Performance & Reliability
    // ===================================================================

    /**
     * Phase 3.1 Enhanced File Size Validation with Security Checks
     * 
     * @param fileSize - File size in bytes
     * @param fileName - Optional filename for enhanced validation
     * @returns boolean - True if file size and security checks pass
     */
    private validateFileSize(fileSize: number, fileName?: string): boolean {
        // Basic size validation
        if (fileSize <= 0 || fileSize > BUFFER_ATTACHMENT_CONFIG.maxFileSize) {
            return false;
        }
        
        // Phase 3.1: Additional security validation
        if (BUFFER_ATTACHMENT_CONFIG.enableContentValidation && fileName) {
            // Check filename length (prevent path traversal)
            if (fileName.length > BUFFER_ATTACHMENT_CONFIG.maxFileNameLength) {
                LogEngine.warn('File name too long, potential security risk', { 
                    fileName: fileName.substring(0, 50) + '...', 
                    length: fileName.length 
                });
                return false;
            }
            
            // Check for dangerous characters
            const dangerousChars = /[<>:"|?*\x00-\x1f]/;
            if (dangerousChars.test(fileName)) {
                LogEngine.warn('File name contains dangerous characters', { fileName });
                return false;
            }
        }
        
        return true;
    }

    /**
     * Phase 3.1 Enhanced Filename Sanitization
     * 
     * @param fileName - Original filename
     * @returns string - Sanitized filename
     */
    private sanitizeFileName(fileName: string): string {
        if (!BUFFER_ATTACHMENT_CONFIG.sanitizeFileNames) {
            return fileName;
        }
        
        // Remove dangerous characters and normalize
        let sanitized = fileName
            .replace(/[<>:"|?*\x00-\x1f]/g, '_')  // Replace dangerous chars
            .replace(/\.\./g, '_')                // Prevent directory traversal
            .replace(/^\.+/, '')                  // Remove leading dots
            .trim();
            
        // Ensure reasonable length
        if (sanitized.length > BUFFER_ATTACHMENT_CONFIG.maxFileNameLength) {
            const extension = path.extname(sanitized);
            const baseName = path.basename(sanitized, extension);
            const maxBaseLength = BUFFER_ATTACHMENT_CONFIG.maxFileNameLength - extension.length - 10;
            sanitized = baseName.substring(0, maxBaseLength) + '_truncated' + extension;
        }
        
        return sanitized || 'unnamed_file';
    }

    /**
     * Phase 3.1 Enhanced Retry Logic with Exponential Backoff
     * 
     * @param operation - Async operation to retry
     * @param operationName - Name for logging
     * @param maxAttempts - Maximum retry attempts
     * @returns Promise<T> - Result of operation
     */
    private async withRetry<T>(
        operation: () => Promise<T>, 
        operationName: string, 
        maxAttempts: number = BUFFER_ATTACHMENT_CONFIG.retryAttempts
    ): Promise<T> {
        let lastError: Error;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await operation();
                
                if (attempt > 1) {
                    LogEngine.info(`${operationName} succeeded after retry`, { 
                        attempt, 
                        totalAttempts: maxAttempts 
                    });
                }
                
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                if (attempt < maxAttempts) {
                    const backoffMs = BUFFER_ATTACHMENT_CONFIG.retryBackoffMs * Math.pow(2, attempt - 1);
                    LogEngine.warn(`${operationName} failed, retrying`, { 
                        attempt, 
                        totalAttempts: maxAttempts, 
                        backoffMs,
                        error: lastError.message 
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                } else {
                    LogEngine.error(`${operationName} failed after all retries`, { 
                        totalAttempts: maxAttempts, 
                        finalError: lastError.message 
                    });
                }
            }
        }
        
        throw lastError!;
    }

    /**
     * Phase 3.1 Performance Monitoring Wrapper
     * 
     * @param operation - Operation to monitor
     * @param operationName - Name for metrics
     * @returns Promise<T> - Result with performance tracking
     */
    private async withPerformanceMonitoring<T>(
        operation: () => Promise<T>,
        operationName: string
    ): Promise<T> {
        if (!BUFFER_ATTACHMENT_CONFIG.enablePerformanceMetrics) {
            return await operation();
        }
        
        const startTime = Date.now();
        const startMemory = process.memoryUsage();
        
        try {
            const result = await operation();
            const endTime = Date.now();
            const endMemory = process.memoryUsage();
            
            const processingTime = endTime - startTime;
            const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
            
            LogEngine.info(`Performance metrics for ${operationName}`, {
                processingTimeMs: processingTime,
                memoryDeltaMB: Math.round(memoryDelta / 1024 / 1024 * 100) / 100,
                heapUsedMB: Math.round(endMemory.heapUsed / 1024 / 1024 * 100) / 100
            });
            
            // Log warning for slow operations
            if (processingTime > BUFFER_ATTACHMENT_CONFIG.slowProcessingThresholdMs) {
                LogEngine.warn(`Slow ${operationName} detected`, { 
                    processingTimeMs: processingTime,
                    thresholdMs: BUFFER_ATTACHMENT_CONFIG.slowProcessingThresholdMs
                });
            }
            
            return result;
        } catch (error) {
            const endTime = Date.now();
            LogEngine.error(`Performance monitoring: ${operationName} failed`, {
                processingTimeMs: endTime - startTime,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Phase 3.1 Enhanced Load file from Telegram to memory buffer with optimizations
     * 
     * @param fileId - Telegram file ID
     * @returns Promise<FileBuffer> - File loaded into memory buffer with enhanced reliability
     */
    async loadFileToBuffer(fileId: string): Promise<FileBuffer> {
        return await this.withPerformanceMonitoring(async () => {
            return await this.withRetry(async () => {
                LogEngine.info('[AttachmentHandler] Loading file to buffer (Phase 3.1)', { fileId });

                // Step 1: Get file info from Telegram with enhanced timeout handling
                const fileInfoUrl = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), BUFFER_ATTACHMENT_CONFIG.downloadTimeout);
                
                let fileInfo: TelegramApiResponse;
                try {
                    const fileInfoResponse = await fetch(fileInfoUrl, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Unthread-Telegram-Bot/3.1.0'
                        }
                    });
                    clearTimeout(timeoutId);
                    
                    if (!fileInfoResponse.ok) {
                        throw new Error(`Telegram API HTTP error: ${fileInfoResponse.status} ${fileInfoResponse.statusText}`);
                    }
                    
                    fileInfo = await fileInfoResponse.json() as TelegramApiResponse;
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                        throw new Error('Request timeout while getting file info from Telegram');
                    }
                    throw fetchError;
                }

                if (!fileInfo.ok) {
                    throw new Error(`Telegram API error: ${fileInfo.description}`);
                }

                const telegramFile = fileInfo.result;
                if (!telegramFile?.file_path) {
                    throw new Error('No file path received from Telegram API');
                }
                
                // Step 2: Enhanced file validation with security checks
                const originalFileName = path.basename(telegramFile.file_path);
                
                if (telegramFile.file_size && !this.validateFileSize(telegramFile.file_size, originalFileName)) {
                    throw new Error(`File validation failed: ${telegramFile.file_size} bytes (max: ${BUFFER_ATTACHMENT_CONFIG.maxFileSize} bytes)`);
                }

                // Step 3: Sanitize filename and determine MIME type
                const sanitizedFileName = this.sanitizeFileName(originalFileName);
                const fileExtension = path.extname(sanitizedFileName).toLowerCase();
                
                let mimeType = telegramFile.mime_type || '';
                if (!mimeType || mimeType === 'application/octet-stream') {
                    const extensionKey = fileExtension as keyof typeof BUFFER_ATTACHMENT_CONFIG.extensionToMime;
                    mimeType = BUFFER_ATTACHMENT_CONFIG.extensionToMime[extensionKey] || 'application/octet-stream';
                }

                // Phase 3.1: Validate MIME type is allowed
                if (BUFFER_ATTACHMENT_CONFIG.enableContentValidation && 
                    !BUFFER_ATTACHMENT_CONFIG.allowedMimeTypes.includes(mimeType)) {
                    throw new Error(`File type not allowed: ${mimeType}`);
                }

                // Step 4: Download file to buffer with enhanced error handling
                const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${telegramFile.file_path}`;
                
                const downloadController = new AbortController();
                const downloadTimeoutId = setTimeout(() => downloadController.abort(), BUFFER_ATTACHMENT_CONFIG.downloadTimeout);

                try {
                    const response = await fetch(downloadUrl, {
                        signal: downloadController.signal,
                        headers: {
                            'User-Agent': 'Unthread-Telegram-Bot/3.1.0'
                        }
                    });

                    clearTimeout(downloadTimeoutId);

                    if (!response.ok) {
                        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
                    }

                    // Phase 3.1: Check Content-Length header if available
                    const contentLength = response.headers.get('content-length');
                    if (contentLength && !this.validateFileSize(parseInt(contentLength), sanitizedFileName)) {
                        throw new Error(`Content-Length too large: ${contentLength} bytes`);
                    }

                    // Convert response to buffer with memory monitoring
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);

                    // Final validation of actual downloaded size
                    if (!this.validateFileSize(buffer.length, sanitizedFileName)) {
                        throw new Error(`Downloaded file too large: ${buffer.length} bytes (max: ${BUFFER_ATTACHMENT_CONFIG.maxFileSize} bytes)`);
                    }

                    // Phase 3.1: Memory threshold check and GC hint
                    const currentMemory = process.memoryUsage().heapUsed;
                    if (currentMemory > BUFFER_ATTACHMENT_CONFIG.memoryThreshold) {
                        LogEngine.warn('Memory threshold exceeded, suggesting garbage collection', {
                            currentMemoryMB: Math.round(currentMemory / 1024 / 1024),
                            thresholdMB: Math.round(BUFFER_ATTACHMENT_CONFIG.memoryThreshold / 1024 / 1024)
                        });
                        
                        // Suggest garbage collection (non-blocking)
                        if (global.gc) {
                            global.gc();
                            LogEngine.debug('Garbage collection triggered');
                        }
                    }

                    LogEngine.info('[AttachmentHandler] File loaded to buffer successfully (Phase 3.1)', {
                        fileId,
                        fileName: sanitizedFileName,
                        originalFileName,
                        fileSize: buffer.length,
                        mimeType,
                        memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
                    });

                    return {
                        buffer,
                        fileName: sanitizedFileName,
                        mimeType,
                        size: buffer.length
                    };

                } catch (error) {
                    clearTimeout(downloadTimeoutId);
                    throw error;
                }
            }, `loadFileToBuffer-${fileId}`);
        }, `loadFileToBuffer-${fileId}`);
    }

    /**
     * Phase 3.1 Enhanced Upload buffer to Unthread API with reliability improvements
     * 
     * @param fileBuffer - File buffer to upload
     * @param conversationId - Unthread conversation ID
     * @param message - Optional message
     * @returns Promise<boolean> - Upload success status with enhanced error handling
     */
    async uploadBufferToUnthread(fileBuffer: FileBuffer, conversationId: string, message?: string): Promise<boolean> {
        return await this.withPerformanceMonitoring(async () => {
            return await this.withRetry(async () => {
                LogEngine.info('[AttachmentHandler] Uploading buffer to Unthread (Phase 3.1)', {
                    conversationId,
                    fileName: fileBuffer.fileName,
                    fileSize: fileBuffer.size,
                    mimeType: fileBuffer.mimeType
                });

                // Phase 3.1: Pre-upload validation
                if (!fileBuffer.buffer || fileBuffer.buffer.length === 0) {
                    throw new Error('Empty or invalid file buffer');
                }

                if (!conversationId || conversationId.trim().length === 0) {
                    throw new Error('Invalid conversation ID');
                }

                // Create FormData with buffer and enhanced metadata
                const formData = new FormData();
                formData.append('file', fileBuffer.buffer, {
                    filename: fileBuffer.fileName,
                    contentType: fileBuffer.mimeType
                });

                if (message) {
                    formData.append('message', message);
                }

                // Phase 3.1: Add metadata for better tracking
                formData.append('source', 'telegram-bot');
                formData.append('version', '3.1.0');
                formData.append('timestamp', new Date().toISOString());

                // Upload to Unthread with enhanced error handling
                const uploadUrl = `${process.env.UNTHREAD_API_URL}/conversations/${conversationId}/messages`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), BUFFER_ATTACHMENT_CONFIG.uploadTimeout);

                try {
                    const response = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${process.env.UNTHREAD_API_KEY}`,
                            'User-Agent': 'Unthread-Telegram-Bot/3.1.0',
                            'X-Request-ID': `${conversationId}-${Date.now()}` // Enhanced tracing
                        },
                        body: formData,
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        let errorDetails = `HTTP ${response.status} ${response.statusText}`;
                        
                        try {
                            const errorText = await response.text();
                            if (errorText) {
                                errorDetails += ` - ${errorText}`;
                            }
                        } catch (textError) {
                            LogEngine.warn('Could not read error response body', { 
                                textError: textError instanceof Error ? textError.message : String(textError) 
                            });
                        }
                        
                        // Phase 3.1: Enhanced error classification
                        const isRetryable = response.status >= 500 || response.status === 429 || response.status === 408;
                        const error = new Error(`Upload failed: ${errorDetails}`) as any;
                        error.isRetryable = isRetryable;
                        error.statusCode = response.status;
                        
                        throw error;
                    }

                    const result = await response.json() as UnthreadApiResponse;

                    LogEngine.info('[AttachmentHandler] Buffer uploaded to Unthread successfully (Phase 3.1)', {
                        conversationId,
                        fileName: fileBuffer.fileName,
                        fileSize: fileBuffer.size,
                        responseId: result.ts,
                        uploadTimeMs: Date.now() - Date.now() // Will be set by performance monitoring
                    });

                    return true;

                } catch (error) {
                    clearTimeout(timeoutId);
                    
                    // Phase 3.1: Enhanced error handling with retry logic
                    if (error instanceof Error && error.name === 'AbortError') {
                        const timeoutError = new Error(`Upload timeout after ${BUFFER_ATTACHMENT_CONFIG.uploadTimeout}ms`);
                        (timeoutError as any).isRetryable = true;
                        throw timeoutError;
                    }
                    
                    throw error;
                }
            }, `uploadBufferToUnthread-${conversationId}`);
        }, `uploadBufferToUnthread-${conversationId}`);
    }

    /**
     * Process multiple attachments using buffer approach (Phase 1)
     * 
     * @param fileIds - Array of Telegram file IDs
     * @param conversationId - Unthread conversation ID
     * @param message - Optional message
     * @returns Promise<BufferProcessingResult> - Processing results
     */
    async processBufferAttachments(fileIds: string[], conversationId: string, message?: string): Promise<BufferProcessingResult> {
        const startTime = Date.now();
        const errors: string[] = [];
        let processedFiles = 0;

        try {
            LogEngine.info('[AttachmentHandler] Starting buffer-based attachment processing', {
                fileCount: fileIds.length,
                conversationId,
                hasMessage: !!message
            });

            // Validate file count
            if (fileIds.length > BUFFER_ATTACHMENT_CONFIG.maxFiles) {
                throw new Error(`Too many files: ${fileIds.length} (max: ${BUFFER_ATTACHMENT_CONFIG.maxFiles})`);
            }

            // Process files sequentially to manage memory usage
            for (const fileId of fileIds) {
                try {
                    // Load file to buffer
                    const fileBuffer = await this.loadFileToBuffer(fileId);
                    
                    // Upload buffer to Unthread
                    const uploadSuccess = await this.uploadBufferToUnthread(
                        fileBuffer, 
                        conversationId, 
                        processedFiles === 0 ? message : undefined // Only include message with first file
                    );

                    if (uploadSuccess) {
                        processedFiles++;
                        LogEngine.info('[AttachmentHandler] File processed successfully via buffer', {
                            fileId,
                            fileName: fileBuffer.fileName,
                            fileSize: fileBuffer.size
                        });
                    } else {
                        errors.push(`Failed to upload ${fileBuffer.fileName}`);
                    }

                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push(`Failed to process file ${fileId}: ${errorMessage}`);
                    LogEngine.error('[AttachmentHandler] File processing failed via buffer', {
                        fileId,
                        error: errorMessage
                    });
                }
            }

            const processingTime = Date.now() - startTime;
            const success = processedFiles === fileIds.length;

            LogEngine.info('[AttachmentHandler] Buffer-based attachment processing completed', {
                conversationId,
                processedFiles,
                totalFiles: fileIds.length,
                success,
                processingTime,
                errorCount: errors.length
            });

            return {
                success,
                processedFiles,
                totalFiles: fileIds.length,
                errors,
                processingTime
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(errorMessage);
            
            LogEngine.error('[AttachmentHandler] Critical error in buffer-based attachment processing', {
                conversationId,
                fileCount: fileIds.length,
                error: errorMessage
            });

            return {
                success: false,
                processedFiles,
                totalFiles: fileIds.length,
                errors,
                processingTime: Date.now() - startTime
            };
        }
    }

    /**
     * Phase 3.1 Enhanced Process attachments using buffer approach with optimizations
     * 
     * This is the main entry point for all file attachment processing.
     * Features comprehensive error handling, performance monitoring, and memory management.
     * 
     * @param fileIds - Array of Telegram file IDs
     * @param conversationId - Unthread conversation ID
     * @param message - Optional message
     * @returns Promise<boolean> - Processing success status
     */
    async processAttachments(
        fileIds: string[], 
        conversationId: string, 
        message?: string
    ): Promise<boolean> {
        return await this.withPerformanceMonitoring(async () => {
            LogEngine.info('[AttachmentHandler] Starting Phase 3.1 enhanced attachment processing', {
                fileCount: fileIds.length,
                conversationId,
                hasMessage: !!message,
                version: '3.1.0'
            });

            // Phase 3.1: Pre-processing validation
            if (!fileIds || fileIds.length === 0) {
                LogEngine.warn('No file IDs provided for processing');
                return true; // Not an error, just nothing to process
            }

            if (fileIds.length > BUFFER_ATTACHMENT_CONFIG.maxFiles) {
                LogEngine.error('Too many files requested for processing', {
                    requestedFiles: fileIds.length,
                    maxAllowed: BUFFER_ATTACHMENT_CONFIG.maxFiles
                });
                return false;
            }

            if (!conversationId || conversationId.trim().length === 0) {
                LogEngine.error('Invalid conversation ID provided');
                return false;
            }

            // Phase 3.1: Memory pre-check
            const initialMemory = process.memoryUsage();
            LogEngine.debug('Memory usage before processing', {
                heapUsedMB: Math.round(initialMemory.heapUsed / 1024 / 1024),
                heapTotalMB: Math.round(initialMemory.heapTotal / 1024 / 1024)
            });

            try {
                // Use enhanced buffer-based approach
                const result = await this.processBufferAttachments(fileIds, conversationId, message);
                
                // Phase 3.1: Post-processing memory check
                const finalMemory = process.memoryUsage();
                const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;
                
                LogEngine.info('Memory usage after processing', {
                    heapUsedMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
                    memoryDeltaMB: Math.round(memoryDelta / 1024 / 1024),
                    processingSuccess: result.success
                });

                if (result.success) {
                    LogEngine.info('[AttachmentHandler] Enhanced buffer processing completed successfully', {
                        conversationId,
                        processedFiles: result.processedFiles,
                        totalFiles: result.totalFiles,
                        processingTime: result.processingTime,
                        memoryEfficient: memoryDelta < (10 * 1024 * 1024) // Less than 10MB growth
                    });
                } else {
                    LogEngine.error('[AttachmentHandler] Enhanced buffer processing failed', {
                        conversationId,
                        errorCount: result.errors.length,
                        errors: result.errors.slice(0, 3), // Limit logged errors to prevent spam
                        processingTime: result.processingTime
                    });
                }
                
                return result.success;

            } catch (error) {
                LogEngine.error('[AttachmentHandler] Critical error in enhanced attachment processing', {
                    conversationId,
                    fileCount: fileIds.length,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined
                });
                return false;
            } finally {
                // Phase 3.1: Cleanup and memory management
                if (global.gc && BUFFER_ATTACHMENT_CONFIG.enablePerformanceMetrics) {
                    const currentMemory = process.memoryUsage().heapUsed;
                    if (currentMemory > BUFFER_ATTACHMENT_CONFIG.memoryThreshold) {
                        LogEngine.debug('Triggering garbage collection after attachment processing');
                        global.gc();
                    }
                }
            }
        }, `processAttachments-${conversationId}`);
    }

    /**
     * Phase 3.1 Enhanced cleanup method for proper resource management
     */
    private stopMemoryOptimization(): void {
        if (this.memoryMonitoringInterval) {
            clearInterval(this.memoryMonitoringInterval);
            delete this.memoryMonitoringInterval;
        }

        // Clean up stream pool
        for (const entry of this.streamPool.values()) {
            if (entry.stream) {
                entry.stream.destroy();
            }
        }
        this.streamPool.clear();

        LogEngine.debug('AttachmentHandler memory optimization stopped');
    }

    /**
     * Phase 3.1 Enhanced shutdown method for graceful cleanup
     */
    public shutdown(): void {
        LogEngine.info('AttachmentHandler shutting down (Phase 3.1)');
        
        this.stopMemoryOptimization();
        
        // Phase 3.1: Clean up global buffer pool
        globalBufferPool.cleanup();
        
        // Phase 3.1: Final garbage collection if available
        if (global.gc && BUFFER_ATTACHMENT_CONFIG.enablePerformanceMetrics) {
            LogEngine.debug('Triggering final garbage collection');
            global.gc();
        }
        
        LogEngine.info('AttachmentHandler shutdown complete');
    }
}

// Create and export singleton instance for backward compatibility
export const attachmentHandler = new AttachmentHandler();
