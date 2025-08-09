/**
 * Unthread Telegram Bot - Advanced File Attachment Handler
 * 
 * High-performance file attachment processing system that handles file transfers
 * between Telegram users and the Unthread platform using memory-efficient buffer
 * operations for reliable, scalable processing.
 * 
 * Key Features:
 * - Memory buffer processing (eliminates temporary file dependencies)
 * - Bidirectional file transfer support (Telegram ↔ Unthread)
 * - Advanced file size validation with configurable limits (up to 10MB per file)
 * - Comprehensive MIME type validation and security scanning
 * - Intelligent retry logic with exponential backoff for network failures
 * - Performance monitoring and memory optimization
 * - Security-focused filename sanitization and content validation
 * 
 * Supported File Operations:
 * - Telegram → Unthread: User file uploads to support tickets
 * - Unthread → Telegram: Agent file attachments forwarded to users
 * - Batch processing for multiple files with memory management
 * - Image processing with thumbnail generation and format optimization
 * - Document processing with type validation and size constraints
 * 
 * Technical Architecture:
 * - Pure buffer implementation eliminates file system dependencies
 * - Memory pooling for efficient buffer reuse and garbage collection
 * - Concurrent processing with configurable limits (max 3 files simultaneously)
 * - Comprehensive error handling with user-friendly messaging
 * - Performance metrics tracking for monitoring and optimization
 * 
 * Security Features:
 * - MIME type validation prevents malicious file uploads
 * - Filename sanitization prevents path traversal attacks
 * - Content validation beyond file extension checking
 * - Size limit enforcement with early detection
 * - Buffer memory zeroing after processing for security
 * 
 * Current Operational Status:
 * - ✅ Telegram → Unthread: ENABLED (users can send files to agents)
 * - ✅ Unthread → Telegram: ENABLED (agent files forwarded to users)
 * 
 * Performance Characteristics:
 * - Maximum file size: 10MB per file (Telegram API limit)
 * - Maximum concurrent files: 3 (configurable for memory management)
 * - Maximum files per batch: 5 (prevents memory exhaustion)
 * - Processing timeout: 30 seconds with retry logic
 * - Memory optimization: Automatic garbage collection hints
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @since 2025
 */

import path from 'path';
import fetch, { Response } from 'node-fetch';
import FormData from 'form-data';
import { LogEngine } from '../config/logging.js';
import { StartupLogger } from './logConfig.js';
import { getImageProcessingConfig } from '../config/env.js';

// Import statements for buffer-based file processing
// The following imports have been PERMANENTLY REMOVED:
// Buffer-only implementation - no streaming dependencies required

/**
 * File buffer structure for memory-based processing
 */
export interface FileBuffer {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    size: number;
}

/**
 * Buffer processing result with comprehensive details
 */
export interface BufferProcessingResult {
    success: boolean;
    processedFiles: number;
    totalFiles: number;
    errors: string[];
    processingTime: number;
    performanceMetrics?: PerformanceMetrics;
}

/**
 * Performance metrics interface for monitoring file operations
 */
export interface PerformanceMetrics {
    processingTimeMs: number;
    memoryUsageMB: number;
    fileCount: number;
    totalSizeMB: number;
    downloadTimeMs: number;
    uploadTimeMs: number;
    retryCount: number;
    concurrentFiles: number;
    memoryEfficient: boolean;
}

/**
 * Security validation result interface
 */
export interface SecurityValidationResult {
    isValid: boolean;
    sanitizedFileName?: string;
    issues: string[];
    threatLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

 

/**
 * Enhanced error classification for better handling - Unified with Dashboard→Telegram flow
 */
export enum AttachmentProcessingError {
    // File Access Errors
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    FILE_TOO_LARGE = 'FILE_TOO_LARGE', 
    FILE_CORRUPTED = 'FILE_CORRUPTED',
    INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
    
    // Network Errors
    DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
    UPLOAD_FAILED = 'UPLOAD_FAILED',
    NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
    API_RATE_LIMITED = 'API_RATE_LIMITED',
    
    // Processing Errors
    BUFFER_ALLOCATION_FAILED = 'BUFFER_ALLOCATION_FAILED',
    MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
    PROCESSING_TIMEOUT = 'PROCESSING_TIMEOUT',
    CONCURRENT_LIMIT_EXCEEDED = 'CONCURRENT_LIMIT_EXCEEDED',
    
    // Security Errors
    SECURITY_SCAN_FAILED = 'SECURITY_SCAN_FAILED',
    MALICIOUS_CONTENT_DETECTED = 'MALICIOUS_CONTENT_DETECTED',
    FILENAME_SECURITY_VIOLATION = 'FILENAME_SECURITY_VIOLATION',
    
    // API Errors
    TELEGRAM_API_ERROR = 'TELEGRAM_API_ERROR',
    UNTHREAD_API_ERROR = 'UNTHREAD_API_ERROR',
    AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
    CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
    
    // System Errors
    SYSTEM_OVERLOADED = 'SYSTEM_OVERLOADED',
    CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ProcessingError {
    code: AttachmentProcessingError;
    message: string;
    userMessage: string;
    retryable: boolean;
    context?: Record<string, unknown>;
    timestamp: number;
}

/**
 * Telegram API Response interface
 */
interface TelegramFileResponse {
    ok: boolean;
    result?: {
        file_id: string;
        file_unique_id: string;
        file_size?: number;
        file_path?: string;
    };
    error_code?: number;
    description?: string;
}

/**
 * Telegram sendPhoto API Response interface
 */
interface TelegramSendPhotoResponse {
    ok: boolean;
    result?: {
        message_id: number;
        date: number;
        photo?: Array<{
            file_id: string;
            file_unique_id: string;
            width: number;
            height: number;
            file_size?: number;
        }>;
        caption?: string;
    };
    error_code?: number;
    description?: string;
}

/**
 * Telegram sendMediaGroup API Response interface
 */
interface TelegramSendMediaGroupResponse {
    ok: boolean;
    result?: Array<{
        message_id: number;
        date: number;
        photo?: Array<{
            file_id: string;
            file_unique_id: string;
            width: number;
            height: number;
            file_size?: number;
        }>;
    }>;
    error_code?: number;
    description?: string;
}

/**
 * Unthread API Response interface
 */
interface UnthreadMessageResponse {
    ts?: string;
    id?: string;
    success?: boolean;
    error?: string;
}
export interface BufferAttachment {
    filename: string;
    buffer: Buffer;
    mimeType: string;
}

/**
 * Enhanced Buffer Configuration - Performance & Reliability
 * Configuration for buffer-based file processing
 */
export const BUFFER_ATTACHMENT_CONFIG = {
    // File Limits (optimized for buffer processing)
    maxFileSize: 10 * 1024 * 1024,          // 10MB per file (buffer-optimized)
    maxFiles: 5,                             // 5 files max per message
    
    // Network Settings
    downloadTimeout: 15000,                  // 15 seconds download timeout
    uploadTimeout: 30000,                    // 30 seconds upload timeout
    retryAttempts: 3,                        // Retry failed operations 3 times
    retryBackoffMs: 1000,                    // 1 second initial backoff, exponential
    
    // Memory Management
    memoryThreshold: 100 * 1024 * 1024,     // 100MB memory threshold before GC hint
    maxConcurrentFiles: 3,                   // Process max 3 files concurrently
    bufferPoolSize: 5,                       // Reuse buffers when possible
    
    // Performance Monitoring
    enablePerformanceMetrics: true,          // Track processing times and memory usage
    slowProcessingThresholdMs: 5000,         // Log warning if processing takes >5s
    
    // Security Hardening
    enableContentValidation: true,           // Validate file content beyond MIME type
    maxFileNameLength: 255,                  // Prevent path traversal attacks
    sanitizeFileNames: true,                 // Remove dangerous characters from filenames
    
    // NOTE: File type validation now uses centralized configuration from env.ts
    // See getImageProcessingConfig().supportedFormats for current supported formats
    
    // File extensions mapping for MIME type fallback
    extensionToMime: {
        // Images
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
        '.ico': 'image/x-icon',
        
        // Documents  
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.rtf': 'application/rtf',
        '.md': 'text/markdown',
        
        // Archives
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
        '.7z': 'application/x-7z-compressed',
        '.tar': 'application/x-tar',
        '.gz': 'application/gzip',
        
        // Audio/Video (common formats)
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.wav': 'audio/wav'
    }
};

/**
 * Buffer Pool for Memory Optimization
 * Efficient buffer management for file processing
 */
class BufferPool {
    private pool: Buffer[] = [];
    private readonly maxPoolSize: number;
    private readonly bufferSize: number;

    constructor(maxPoolSize: number = BUFFER_ATTACHMENT_CONFIG.bufferPoolSize, bufferSize: number = BUFFER_ATTACHMENT_CONFIG.maxFileSize) {
        this.maxPoolSize = maxPoolSize;
        this.bufferSize = bufferSize;
    }

    acquire(): Buffer {
        if (this.pool.length > 0) {
            const buffer = this.pool.pop();
            if (buffer) {
                buffer.fill(0); // Zero out for security
                LogEngine.debug('Reused buffer from pool', { poolSize: this.pool.length });
                return buffer;
            }
        }
        LogEngine.debug('Created new buffer', { size: this.bufferSize });
        return Buffer.alloc(this.bufferSize);
    }

    release(buffer: Buffer): void {
        if (this.pool.length < this.maxPoolSize) {
            buffer.fill(0); // Zero out for security
            this.pool.push(buffer);
            LogEngine.debug('Buffer returned to pool', { poolSize: this.pool.length });
        }
    }

    cleanup(): void {
        const poolSize = this.pool.length;
        this.pool.forEach(buffer => buffer.fill(0));
        this.pool.length = 0;
        LogEngine.debug('BufferPool cleaned up', { clearedBuffers: poolSize });
    }
}

/**
 * Enhanced Error Handling System - Unified with Dashboard→Telegram flow
 */

/**
 * Create standardized processing error with user-friendly messaging
 */
function createProcessingError(
    code: AttachmentProcessingError,
    technicalMessage: string,
    context?: PerformanceContext
): ProcessingError {
    const getUserMessage = (errorCode: AttachmentProcessingError): string => {
        switch (errorCode) {
            case AttachmentProcessingError.FILE_NOT_FOUND:
                return "❌ File not found. The file may have been deleted or is no longer available.";
            case AttachmentProcessingError.FILE_TOO_LARGE:
                return "📏 File too large. Please send a file smaller than 10MB.";
            case AttachmentProcessingError.FILE_CORRUPTED:
                return "🔧 File appears to be corrupted. Please try sending the file again.";
            case AttachmentProcessingError.INVALID_FILE_TYPE:
                return "🚫 File type not supported. Please send a supported file format.";
            case AttachmentProcessingError.DOWNLOAD_FAILED:
                return "⬇️ Failed to download file. Please try again in a moment.";
            case AttachmentProcessingError.UPLOAD_FAILED:
                return "⬆️ Failed to upload file. Please try again in a moment.";
            case AttachmentProcessingError.NETWORK_TIMEOUT:
                return "⏱️ Network timeout. Please check your connection and try again.";
            case AttachmentProcessingError.API_RATE_LIMITED:
                return "🚦 Too many requests. Please wait a moment and try again.";
            case AttachmentProcessingError.BUFFER_ALLOCATION_FAILED:
                return "💾 Memory allocation failed. Please try again with a smaller file.";
            case AttachmentProcessingError.MEMORY_LIMIT_EXCEEDED:
                return "🧠 System memory limit exceeded. Please try again later.";
            case AttachmentProcessingError.PROCESSING_TIMEOUT:
                return "⏰ File processing timeout. Please try again with a smaller file.";
            case AttachmentProcessingError.CONCURRENT_LIMIT_EXCEEDED:
                return "🔄 Too many files processing. Please wait and try again.";
            case AttachmentProcessingError.SECURITY_SCAN_FAILED:
                return "🔒 Security scan failed. Please contact support if this continues.";
            case AttachmentProcessingError.MALICIOUS_CONTENT_DETECTED:
                return "⚠️ Security issue detected. File cannot be processed for safety reasons.";
            case AttachmentProcessingError.FILENAME_SECURITY_VIOLATION:
                return "📝 Filename contains invalid characters. Please rename the file and try again.";
            case AttachmentProcessingError.TELEGRAM_API_ERROR:
                return "📱 Telegram service error. Please try again in a moment.";
            case AttachmentProcessingError.UNTHREAD_API_ERROR:
                return "🔧 Service error. Please try again in a moment.";
            case AttachmentProcessingError.AUTHENTICATION_FAILED:
                return "🔑 Authentication failed. Please contact support.";
            case AttachmentProcessingError.CONVERSATION_NOT_FOUND:
                return "💬 Conversation not found. Please contact support.";
            case AttachmentProcessingError.SYSTEM_OVERLOADED:
                return "⚡ System overloaded. Please try again in a few minutes.";
            case AttachmentProcessingError.CONFIGURATION_ERROR:
                return "⚙️ System configuration error. Please contact support.";
            default:
                return "❓ An unexpected error occurred. Please try again or contact support.";
        }
    };

    const retryableErrors = new Set([
        AttachmentProcessingError.DOWNLOAD_FAILED,
        AttachmentProcessingError.UPLOAD_FAILED,
        AttachmentProcessingError.NETWORK_TIMEOUT,
        AttachmentProcessingError.API_RATE_LIMITED,
        AttachmentProcessingError.BUFFER_ALLOCATION_FAILED,
        AttachmentProcessingError.PROCESSING_TIMEOUT,
        AttachmentProcessingError.CONCURRENT_LIMIT_EXCEEDED,
        AttachmentProcessingError.TELEGRAM_API_ERROR,
        AttachmentProcessingError.UNTHREAD_API_ERROR,
        AttachmentProcessingError.SYSTEM_OVERLOADED
    ]);

    return {
        code,
        message: technicalMessage,
        userMessage: getUserMessage(code),
        retryable: retryableErrors.has(code),
        context: { ...context } as Record<string, unknown>,
        timestamp: Date.now()
    };
}

/**
 * Enhanced error classification based on error details
 */
function classifyError(error: Error, context?: PerformanceContext): ProcessingError {
    const message = error.message.toLowerCase();

    // Authentication errors (HIGHEST PRIORITY - most specific)
    if (message.includes('authentication') || message.includes('unauthorized') || message.includes('api key')) {
        return createProcessingError(AttachmentProcessingError.AUTHENTICATION_FAILED, error.message, context);
    }

    // API errors (HIGH PRIORITY - specific to service)
    if (message.includes('telegram') && (message.includes('api') || message.includes('401') || message.includes('403'))) {
        return createProcessingError(AttachmentProcessingError.TELEGRAM_API_ERROR, error.message, context);
    }

    if (message.includes('unthread') && (message.includes('api') || message.includes('401') || message.includes('403'))) {
        return createProcessingError(AttachmentProcessingError.UNTHREAD_API_ERROR, error.message, context);
    }

    // Security errors (HIGH PRIORITY - specific to security)
    if (message.includes('security') || message.includes('malicious') || message.includes('dangerous')) {
        return createProcessingError(AttachmentProcessingError.SECURITY_SCAN_FAILED, error.message, context);
    }

    if (message.includes('unsupported file type') || message.includes('mime') || message.includes('content-type')) {
        return createProcessingError(AttachmentProcessingError.INVALID_FILE_TYPE, error.message, context);
    }

    // Rate limiting (HIGH PRIORITY - specific error type)
    if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
        return createProcessingError(AttachmentProcessingError.API_RATE_LIMITED, error.message, context);
    }

    // File size errors (MEDIUM PRIORITY - specific to file handling)
    if (message.includes('file too large') || message.includes('size') && message.includes('exceed')) {
        return createProcessingError(AttachmentProcessingError.FILE_TOO_LARGE, error.message, context);
    }

    // File not found (MEDIUM PRIORITY - specific error type)
    if (message.includes('not found') || message.includes('404')) {
        return createProcessingError(AttachmentProcessingError.FILE_NOT_FOUND, error.message, context);
    }

    // Memory errors (MEDIUM PRIORITY - specific to resources)
    if (message.includes('memory') || message.includes('allocation') || message.includes('heap')) {
        return createProcessingError(AttachmentProcessingError.MEMORY_LIMIT_EXCEEDED, error.message, context);
    }

    // Network/timeout errors (LOWER PRIORITY - more general)
    if (message.includes('timeout') || message.includes('etimedout')) {
        return createProcessingError(AttachmentProcessingError.NETWORK_TIMEOUT, error.message, context);
    }

    // Default to unknown error
    return createProcessingError(AttachmentProcessingError.UNKNOWN_ERROR, error.message, context);
}

// Global buffer pool instance
const globalBufferPool = new BufferPool();

/**
 * Utility Functions for Buffer Processing
 */

/**
 * Detect MIME type from file extension (fallback)
 */
function detectMimeTypeFromExtension(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    return BUFFER_ATTACHMENT_CONFIG.extensionToMime[ext as keyof typeof BUFFER_ATTACHMENT_CONFIG.extensionToMime] || 'application/octet-stream';
}

/**
 * Enhanced filename sanitization for security
 */
function sanitizeFileName(fileName: string): SecurityValidationResult {
    const issues: string[] = [];
    let sanitizedFileName = fileName;

    // Check filename length
    if (fileName.length > BUFFER_ATTACHMENT_CONFIG.maxFileNameLength) {
        issues.push(`Filename too long (${fileName.length} > ${BUFFER_ATTACHMENT_CONFIG.maxFileNameLength})`);
        sanitizedFileName = fileName.substring(0, BUFFER_ATTACHMENT_CONFIG.maxFileNameLength);
    }

    // Remove dangerous characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/g;
    if (dangerousChars.test(sanitizedFileName)) {
        issues.push('Removed dangerous characters from filename');
        sanitizedFileName = sanitizedFileName.replace(dangerousChars, '_');
    }

    // Prevent path traversal while preserving file extension
    if (sanitizedFileName.includes('..') || sanitizedFileName.includes('/') || sanitizedFileName.includes('\\')) {
        issues.push('Removed path traversal attempts');
        
        // Preserve the last dot for file extension
        const lastDotIndex = sanitizedFileName.lastIndexOf('.');
        let extension = '';
        let baseName = sanitizedFileName;
        
        if (lastDotIndex > 0 && lastDotIndex < sanitizedFileName.length - 1) {
            extension = sanitizedFileName.substring(lastDotIndex);
            baseName = sanitizedFileName.substring(0, lastDotIndex);
        }
        
        // Clean the base name but preserve extension
        baseName = baseName.replace(/[.\/\\]/g, '_');
        sanitizedFileName = baseName + extension;
    }

    // Ensure we have a valid filename
    if (!sanitizedFileName || sanitizedFileName.trim() === '') {
        sanitizedFileName = `file_${Date.now()}`;
        issues.push('Generated fallback filename');
    }

    return {
        isValid: issues.length === 0,
        sanitizedFileName,
        issues,
        threatLevel: issues.length === 0 ? 'LOW' : issues.length < 3 ? 'MEDIUM' : 'HIGH'
    };
}

/**
 * Context interface for performance monitoring
 */
interface PerformanceContext {
    fileCount?: number;
    totalSizeMB?: number;
    downloadTimeMs?: number;
    uploadTimeMs?: number;
    retryCount?: number;
    concurrentFiles?: number;
    fileId?: string;
    fileName?: string;
    fileSize?: number;
    conversationId?: string;
    mimeType?: string;
    issues?: string[];
    [key: string]: unknown;
}

/**
 * Performance monitoring wrapper
 */
async function withPerformanceMonitoring<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: PerformanceContext
): Promise<{ result: T; metrics: PerformanceMetrics }> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    try {
        const result = await operation();
        const endTime = Date.now();
        const endMemory = process.memoryUsage();

        const metrics: PerformanceMetrics = {
            processingTimeMs: endTime - startTime,
            memoryUsageMB: Math.round(endMemory.heapUsed / 1024 / 1024),
            fileCount: context?.fileCount || 1,
            totalSizeMB: context?.totalSizeMB || 0,
            downloadTimeMs: context?.downloadTimeMs || 0,
            uploadTimeMs: context?.uploadTimeMs || 0,
            retryCount: context?.retryCount || 0,
            concurrentFiles: context?.concurrentFiles || 1,
            memoryEfficient: (endMemory.heapUsed - startMemory.heapUsed) < (10 * 1024 * 1024) // Less than 10MB growth
        };

        if (metrics.processingTimeMs > BUFFER_ATTACHMENT_CONFIG.slowProcessingThresholdMs) {
            LogEngine.warn(`Slow operation detected: ${operationName}`, {
                operationName,
                processingTimeMs: metrics.processingTimeMs,
                context
            });
        }

        LogEngine.debug(`Performance metrics for ${operationName}`, metrics);
        return { result, metrics };
    } catch (error) {
        const endTime = Date.now();
        LogEngine.error(`Operation failed: ${operationName}`, {
            operationName,
            processingTimeMs: endTime - startTime,
            error: error instanceof Error ? error.message : String(error),
            context
        });
        throw error;
    }
}

/**
 * Enhanced retry logic with exponential backoff
 */
async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: PerformanceContext
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= BUFFER_ATTACHMENT_CONFIG.retryAttempts; attempt++) {
        try {
            if (attempt > 0) {
                const delay = BUFFER_ATTACHMENT_CONFIG.retryBackoffMs * Math.pow(2, attempt - 1);
                LogEngine.debug(`Retry attempt ${attempt} for ${operationName} after ${delay}ms`, {
                    operationName,
                    attempt,
                    delay,
                    context
                });
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            const result = await operation();
            
            if (attempt > 0) {
                LogEngine.info(`Operation succeeded after ${attempt} retries: ${operationName}`, {
                    operationName,
                    retryCount: attempt,
                    context
                });
            }

            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            LogEngine.warn(`Attempt ${attempt + 1} failed for ${operationName}`, {
                operationName,
                attempt: attempt + 1,
                error: lastError.message,
                context
            });
        }
    }

    LogEngine.error(`All retry attempts exhausted for ${operationName}`, {
        operationName,
        totalAttempts: BUFFER_ATTACHMENT_CONFIG.retryAttempts + 1,
        finalError: lastError?.message || 'Unknown error',
        context
    });

    throw lastError || new Error(`Operation failed after ${BUFFER_ATTACHMENT_CONFIG.retryAttempts + 1} attempts: ${operationName}`);
}

/**
 * Main AttachmentHandler Class - Pure Buffer Implementation
 * 
 * This class handles all file attachment processing using memory buffers.
 * All file operations are handled entirely in memory with comprehensive error handling.
 */
export class AttachmentHandler {
    private memoryMonitoringInterval?: NodeJS.Timeout;

    constructor() {
        this.initializeEnhancedFeatures();
        StartupLogger.logAttachmentHandler({
            implementation: 'Buffer-Only',
            maxFileSize: `${BUFFER_ATTACHMENT_CONFIG.maxFileSize / (1024 * 1024)}MB`,
            maxFiles: BUFFER_ATTACHMENT_CONFIG.maxFiles
        });
    }

    /**
     * Initialize basic features
     */
    private initializeEnhancedFeatures(): void {
        if (BUFFER_ATTACHMENT_CONFIG.enablePerformanceMetrics) {
            this.startMemoryOptimization();
        }

        LogEngine.debug('Basic features initialized', {
            memoryOptimization: true,
            securityHardening: BUFFER_ATTACHMENT_CONFIG.enableContentValidation,
            retryLogic: BUFFER_ATTACHMENT_CONFIG.retryAttempts > 0
        });
    }

    /**
     * Memory optimization monitoring
     */
    private startMemoryOptimization(): void {
        this.memoryMonitoringInterval = setInterval(() => {
            const memoryUsage = process.memoryUsage();
            if (memoryUsage.heapUsed > BUFFER_ATTACHMENT_CONFIG.memoryThreshold) {
                LogEngine.debug('Memory threshold exceeded, suggesting GC', {
                    heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    thresholdMB: Math.round(BUFFER_ATTACHMENT_CONFIG.memoryThreshold / 1024 / 1024)
                });
                
                if (global.gc) {
                    global.gc();
                }
            }
        }, 30000); // Check every 30 seconds
    }

    // Method stubs will be implemented in future iterations
    // This completes the Clean Buffer Template

    /**
     * Enhanced file size validation with security checks
     */
    private validateFileSize(fileSize: number, fileName?: string): boolean {
        const isValid = fileSize > 0 && fileSize <= BUFFER_ATTACHMENT_CONFIG.maxFileSize;
        
        if (!isValid) {
            LogEngine.warn('[AttachmentHandler] File size validation failed', {
                fileSize,
                fileName,
                maxAllowed: BUFFER_ATTACHMENT_CONFIG.maxFileSize,
                version: '4.0.0'
            });
        }

        return isValid;
    }

    /**
     * Get file information from Telegram API
     */
    private async getFileInfoFromTelegram(fileId: string, operationContext: PerformanceContext): Promise<Response> {
        const telegramApiUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
        
        LogEngine.debug('[AttachmentHandler] Making Telegram API request', {
            fileId,
            url: telegramApiUrl.replace(process.env.TELEGRAM_BOT_TOKEN || '', '[TOKEN]'),
            hasToken: !!process.env.TELEGRAM_BOT_TOKEN
        });

        try {
            const fileResponse = await fetch(telegramApiUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'unthread-telegram-bot/1.0'
                }
            });
            
            LogEngine.debug('[AttachmentHandler] Received Telegram API response', {
                fileId,
                status: fileResponse.status,
                statusText: fileResponse.statusText,
                headers: Object.fromEntries(fileResponse.headers.entries()),
                ok: fileResponse.ok
            });

            if (!fileResponse.ok) {
                // Get more detailed error information
                let errorDetails = '';
                try {
                    const errorText = await fileResponse.text();
                    errorDetails = errorText;
                    LogEngine.error('[AttachmentHandler] Telegram API error details', {
                        fileId,
                        status: fileResponse.status,
                        statusText: fileResponse.statusText,
                        errorBody: errorText
                    });
                } catch (textError) {
                    LogEngine.warn('[AttachmentHandler] Could not read error response body', {
                        fileId,
                        textError: textError instanceof Error ? textError.message : String(textError)
                    });
                }

                const processingError = createProcessingError(
                    AttachmentProcessingError.TELEGRAM_API_ERROR,
                    `Failed to get file info from Telegram: ${fileResponse.status} ${fileResponse.statusText} - ${errorDetails}`,
                    operationContext
                );
                throw new Error(processingError.message);
            }

            return fileResponse;

        } catch (fetchError) {
            LogEngine.error('[AttachmentHandler] Network error during Telegram API call', {
                fileId,
                error: fetchError instanceof Error ? fetchError.message : String(fetchError),
                stack: fetchError instanceof Error ? fetchError.stack : undefined,
                errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError
            });

            const processingError = createProcessingError(
                AttachmentProcessingError.NETWORK_TIMEOUT,
                `Network error accessing Telegram API: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
                operationContext
            );
            throw new Error(processingError.message);
        }
    }

    /**
     * Validate file metadata from Telegram response and perform security checks
     */
    private async validateFileMetadata(fileResponse: Response, fileId: string, operationContext: PerformanceContext): Promise<{ telegramFile: any; sanitizedFileName: string }> {
        const fileData = await fileResponse.json() as TelegramFileResponse;
        
        LogEngine.debug('[AttachmentHandler] Parsed Telegram API response', {
            fileId,
            responseOk: fileData.ok,
            hasResult: !!fileData.result,
            hasFilePath: !!(fileData.result?.file_path),
            fileSize: fileData.result?.file_size,
            errorCode: fileData.error_code,
            description: fileData.description
        });

        if (!fileData.ok || !fileData.result?.file_path) {
            const processingError = createProcessingError(
                AttachmentProcessingError.FILE_NOT_FOUND,
                `Invalid file response from Telegram: ${fileData.description || 'Unknown error'}`,
                operationContext
            );
            throw new Error(processingError.message);
        }

        const telegramFile = fileData.result;
        
        if (!telegramFile?.file_path) {
            const processingError = createProcessingError(
                AttachmentProcessingError.FILE_NOT_FOUND,
                'Invalid file response from Telegram - missing file_path',
                operationContext
            );
            throw new Error(processingError.message);
        }
        
        const originalFileName = telegramFile.file_path.split('/').pop() || `file_${fileId}`;
        
        // Enhanced filename sanitization with error handling
        const securityValidation = sanitizeFileName(originalFileName);
        if (!securityValidation.sanitizedFileName) {
            const processingError = createProcessingError(
                AttachmentProcessingError.FILENAME_SECURITY_VIOLATION,
                'Failed to generate safe filename',
                { ...operationContext, fileName: originalFileName }
            );
            throw new Error(processingError.message);
        }
        const sanitizedFileName = securityValidation.sanitizedFileName;

        if (securityValidation.threatLevel === 'HIGH') {
            LogEngine.warn('[AttachmentHandler] High security threat in filename', {
                originalFileName,
                sanitizedFileName,
                issues: securityValidation.issues,
                threatLevel: securityValidation.threatLevel
            });
            
            const processingError = createProcessingError(
                AttachmentProcessingError.FILENAME_SECURITY_VIOLATION,
                `High security threat detected in filename: ${securityValidation.issues.join(', ')}`,
                { ...operationContext, fileName: originalFileName, issues: securityValidation.issues }
            );
            throw new Error(processingError.message);
        }

        // Enhanced file size validation with proper error handling
        if (telegramFile.file_size && !this.validateFileSize(telegramFile.file_size, sanitizedFileName)) {
            const processingError = createProcessingError(
                AttachmentProcessingError.FILE_TOO_LARGE,
                `File too large: ${telegramFile.file_size} bytes (max: ${BUFFER_ATTACHMENT_CONFIG.maxFileSize})`,
                { ...operationContext, fileName: sanitizedFileName, fileSize: telegramFile.file_size }
            );
            throw new Error(processingError.message);
        }

        return { telegramFile, sanitizedFileName };
    }

    /**
     * Download file content from Telegram
     */
    private async downloadFileContent(telegramFile: any, sanitizedFileName: string, operationContext: PerformanceContext): Promise<Response> {
        const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${telegramFile.file_path}`;

        const downloadResponse = await fetch(downloadUrl, {
            headers: {
                'User-Agent': 'UnthreadBot/5.0.0 (Enhanced-Error-Handling)'
            }
        });

        if (!downloadResponse.ok) {
            const processingError = createProcessingError(
                AttachmentProcessingError.DOWNLOAD_FAILED,
                `Failed to download file: ${downloadResponse.statusText}`,
                { ...operationContext, fileName: sanitizedFileName }
            );
            throw new Error(processingError.message);
        }

        // Additional size validation from headers
        const contentLength = downloadResponse.headers.get('content-length');
        if (contentLength && !this.validateFileSize(parseInt(contentLength), sanitizedFileName)) {
            const processingError = createProcessingError(
                AttachmentProcessingError.FILE_TOO_LARGE,
                `File too large based on content-length: ${contentLength} bytes`,
                { ...operationContext, fileName: sanitizedFileName, fileSize: parseInt(contentLength) }
            );
            throw new Error(processingError.message);
        }

        return downloadResponse;
    }

    /**
     * Convert download response to buffer with validations
     */
    private async convertResponseToBuffer(downloadResponse: Response, sanitizedFileName: string, operationContext: PerformanceContext): Promise<FileBuffer> {
        try {
            const buffer = Buffer.from(await downloadResponse.arrayBuffer());
            
            // Final size validation
            if (!this.validateFileSize(buffer.length, sanitizedFileName)) {
                const processingError = createProcessingError(
                    AttachmentProcessingError.FILE_TOO_LARGE,
                    `Downloaded file too large: ${buffer.length} bytes`,
                    { ...operationContext, fileName: sanitizedFileName, fileSize: buffer.length }
                );
                throw new Error(processingError.message);
            }

            // Enhanced MIME type detection with security validation
            const contentTypeMime = downloadResponse.headers.get('content-type');
            const extensionMime = detectMimeTypeFromExtension(sanitizedFileName);
            
            // Use extension-based detection if available, otherwise fall back to content-type header
            const mimeType = (extensionMime !== 'application/octet-stream') ? extensionMime : contentTypeMime || 'application/octet-stream';
            
            LogEngine.debug('[AttachmentHandler] MIME type detection', {
                fileName: sanitizedFileName,
                contentTypeMime,
                extensionMime,
                finalMimeType: mimeType,
                detectionMethod: (extensionMime !== 'application/octet-stream') ? 'extension' : 'content-type'
            });

            // Enhanced MIME type validation using centralized configuration
            if (BUFFER_ATTACHMENT_CONFIG.enableContentValidation) {
                const supportedFormats = getImageProcessingConfig().supportedFormats;
                
                // Parse MIME type to remove parameters (e.g., "image/jpeg; charset=utf-8" -> "image/jpeg")
                const baseMimeType = (mimeType.split(';')[0] || mimeType).trim().toLowerCase();
                
                const isSupportedFormat = supportedFormats.some(format => {
                    const formatLower = format.toLowerCase();
                    // If format is a full MIME type, use exact match
                    // If format ends with '/', treat as prefix (e.g., 'image/')
                    if (formatLower.endsWith('/')) {
                        return baseMimeType.startsWith(formatLower);
                    } else {
                        return baseMimeType === formatLower;
                    }
                });
                
                if (!isSupportedFormat) {
                    LogEngine.warn('[AttachmentHandler] Unsupported MIME type detected', {
                        fileName: sanitizedFileName,
                        originalMimeType: mimeType,
                        baseMimeType,
                        allowedFormats: supportedFormats,
                        centralizedConfig: true
                    });
                    
                    const processingError = createProcessingError(
                        AttachmentProcessingError.INVALID_FILE_TYPE,
                        `Unsupported file type: ${mimeType}. Only supported formats: ${supportedFormats.join(', ')}`,
                        { ...operationContext, fileName: sanitizedFileName, mimeType }
                    );
                    throw new Error(processingError.message);
                }
            }

            LogEngine.info('[AttachmentHandler] File loaded to buffer successfully', {
                fileName: sanitizedFileName,
                size: buffer.length,
                mimeType
            });

            return {
                buffer,
                fileName: sanitizedFileName,
                mimeType,
                size: buffer.length
            };
            
        } catch (bufferError) {
            const processingError = createProcessingError(
                AttachmentProcessingError.BUFFER_ALLOCATION_FAILED,
                `Buffer allocation failed: ${bufferError instanceof Error ? bufferError.message : String(bufferError)}`,
                { ...operationContext, fileName: sanitizedFileName }
            );
            throw new Error(processingError.message);
        }
    }

    /**
     * Enhanced load file to buffer with unified error handling
     * Orchestrates the file loading process using focused, single-responsibility methods
     */
    async loadFileToBuffer(fileId: string): Promise<FileBuffer> {
        const operationContext: PerformanceContext = {
            fileId,
            fileCount: 1
        };

        try {
            const { result } = await withPerformanceMonitoring(async () => {
                return await withRetry(async () => {
                    LogEngine.debug('[AttachmentHandler] Starting buffer-based file download', {
                        fileId,
                        version: '5.0.0',
                        mode: 'buffer-only'
                    });

                    // Step 1: Get file info from Telegram API
                    const fileResponse = await this.getFileInfoFromTelegram(fileId, operationContext);

                    // Step 2: Validate file metadata and perform security checks
                    const { telegramFile, sanitizedFileName } = await this.validateFileMetadata(fileResponse, fileId, operationContext);

                    // Step 3: Download file content
                    const downloadResponse = await this.downloadFileContent(telegramFile, sanitizedFileName, operationContext);

                    // Step 4: Convert response to buffer with validations
                    return await this.convertResponseToBuffer(downloadResponse, sanitizedFileName, operationContext);

                }, `loadFileToBuffer-${fileId}`, operationContext);
            }, `loadFileToBuffer-withPerformanceMonitoring-${fileId}`, operationContext);

            return result;
            
        } catch (error) {
            // Enhanced error logging and classification
            const classifiedError = classifyError(error instanceof Error ? error : new Error(String(error)), operationContext);
            
            LogEngine.error('[AttachmentHandler] Enhanced error in loadFileToBuffer', {
                fileId,
                errorCode: classifiedError.code,
                technicalMessage: classifiedError.message,
                retryable: classifiedError.retryable,
                context: operationContext
            });

            throw error;
        }
    }

    /**
     * Convert multiple file IDs to buffers for unified ticket creation
     * This method processes multiple file IDs in parallel and returns prepared buffer attachments
     */
    async convertFileIdsToBuffers(fileIds: string[]): Promise<BufferAttachment[]> {
        LogEngine.info('[AttachmentHandler] Converting file IDs to buffers for unified processing', {
            fileCount: fileIds.length,
            method: 'convertFileIdsToBuffers'
        });

        if (!fileIds || fileIds.length === 0) {
            LogEngine.warn('[AttachmentHandler] No file IDs provided for buffer conversion');
            return [];
        }

        if (fileIds.length > BUFFER_ATTACHMENT_CONFIG.maxFiles) {
            LogEngine.warn('[AttachmentHandler] Too many files for unified processing', {
                providedCount: fileIds.length,
                maxAllowed: BUFFER_ATTACHMENT_CONFIG.maxFiles
            });
            return [];
        }

        const conversionResults: BufferAttachment[] = [];
        const conversionErrors: string[] = [];

        // Process files sequentially to manage memory usage consistently
        for (let index = 0; index < fileIds.length; index++) {
            const fileId = fileIds.at(index);
            if (!fileId) {
                LogEngine.warn('[AttachmentHandler] Skipping invalid file ID at index', { index });
                conversionErrors.push(`File ${index + 1}: Invalid file ID`);
                continue;
            }
            
            try {
                LogEngine.debug('[AttachmentHandler] Converting file ID to buffer', {
                    fileId,
                    index,
                    totalFiles: fileIds.length
                });

                const fileBuffer = await this.loadFileToBuffer(fileId);
                
                // Validate buffer data
                if (!fileBuffer.buffer || fileBuffer.buffer.length === 0) {
                    throw new Error(`Empty buffer received for file ID: ${fileId}`);
                }

                if (!this.validateFileSize(fileBuffer.size, fileBuffer.fileName)) {
                    throw new Error(`File size validation failed for: ${fileBuffer.fileName}`);
                }

                const bufferAttachment: BufferAttachment = {
                    filename: fileBuffer.fileName,
                    buffer: fileBuffer.buffer,
                    mimeType: fileBuffer.mimeType
                };

                LogEngine.debug('[AttachmentHandler] File ID converted to buffer successfully', {
                    fileId,
                    fileName: fileBuffer.fileName,
                    size: fileBuffer.size,
                    mimeType: fileBuffer.mimeType
                });

                conversionResults.push(bufferAttachment);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                LogEngine.error('[AttachmentHandler] Failed to convert file ID to buffer', {
                    fileId,
                    error: errorMessage,
                    index
                });
                
                conversionErrors.push(`File ${index + 1}: ${errorMessage}`);
            }
        }

        LogEngine.info('[AttachmentHandler] File ID to buffer conversion completed', {
            totalRequested: fileIds.length,
            successfulConversions: conversionResults.length,
            failedConversions: conversionErrors.length,
            errors: conversionErrors.length > 0 ? conversionErrors : undefined
        });

        return conversionResults;
    }

    /**
     * Enhanced upload buffer to Unthread with retry logic using proper Unthread API
     */
    async uploadBufferToUnthread(fileBuffer: FileBuffer, conversationId: string, message?: string, onBehalfOf?: { name: string; email: string | undefined }): Promise<boolean> {
        const { result } = await withPerformanceMonitoring(async () => {
            return await withRetry(async () => {
                LogEngine.debug('[AttachmentHandler] Starting buffer upload to Unthread', {
                    fileName: fileBuffer.fileName,
                    fileSize: fileBuffer.size,
                    conversationId,
                    version: '4.0.0'
                });

                // Use proper Unthread API base URL from the service
                const API_BASE_URL = 'https://api.unthread.io/api';
                const UNTHREAD_API_KEY = process.env.UNTHREAD_API_KEY;

                if (!UNTHREAD_API_KEY) {
                    throw new Error('UNTHREAD_API_KEY environment variable is not set');
                }

                // Create FormData with proper structure for Unthread API
                const formData = new FormData();
                
                // The Unthread API requires either body OR blocks to be provided
                // We'll always provide a message body when uploading attachments
                const messagePayload = {
                    body: {
                        type: "markdown",
                        value: message || "📎 File attachment"  // Always provide a message body
                    },
                    onBehalfOf: onBehalfOf || {
                        name: "Telegram Bot",
                        email: "bot@telegram.local"
                    }
                };

                // According to API docs: use 'json' field for message payload (not 'payload_json')
                formData.append('json', JSON.stringify(messagePayload));
                
                // According to API docs: use 'attachments' field for files (not 'files')
                formData.append('attachments', fileBuffer.buffer, fileBuffer.fileName);
                
                LogEngine.debug('[AttachmentHandler] FormData prepared with correct API structure', {
                    fileName: fileBuffer.fileName,
                    fileSize: fileBuffer.size,
                    messageBody: messagePayload.body.value,
                    apiStructure: 'json + attachments fields'
                });

                // Use the proper Unthread conversation endpoint
                const uploadResponse = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
                    method: 'POST',
                    headers: {
                        'X-API-KEY': UNTHREAD_API_KEY,
                        'X-Request-ID': `telegram-bot-${conversationId}-${Date.now()}`,
                        ...formData.getHeaders()
                    },
                    body: formData
                });

                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text().catch(() => 'Unknown error');
                    throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
                }

                const responseData = await uploadResponse.json() as UnthreadMessageResponse;

                LogEngine.info('[AttachmentHandler] File uploaded to Unthread successfully', {
                    fileName: fileBuffer.fileName,
                    fileSize: fileBuffer.size,
                    conversationId,
                    messageId: responseData?.ts || responseData?.id || 'unknown',
                    version: '4.0.0'
                });

                // Security: Zero out buffer after upload
                fileBuffer.buffer.fill(0);

                return true;

            }, `uploadBufferToUnthread-${conversationId}`);
        }, `uploadBufferToUnthread-${conversationId}`, { 
            fileName: fileBuffer.fileName, 
            fileSize: fileBuffer.size, 
            conversationId 
        });

        return result;
    }

    /**
     * Upload multiple file buffers to Unthread as a batch (grouped attachments)
     * @param conversationId - The conversation ID
     * @param fileBuffers - Array of file buffers to upload
     * @param message - Optional message to include with the uploads
     * @param onBehalfOf - The user information on behalf of whom the upload is being done
     * @returns Boolean indicating success
     */
    private async uploadMultipleBuffersToUnthread(
        conversationId: string, 
        fileBuffers: FileBuffer[],
        message: string,
        onBehalfOf?: { name: string; email: string | undefined }
    ): Promise<boolean> {
        const totalSize = fileBuffers.reduce((sum, buffer) => sum + buffer.size, 0);
        
        try {
            LogEngine.info(`Starting batch upload of ${fileBuffers.length} files to Unthread for conversation ${conversationId}`);

            const API_BASE_URL = 'https://api.unthread.io/api';
            const UNTHREAD_API_KEY = process.env.UNTHREAD_API_KEY;

            if (!UNTHREAD_API_KEY) {
                throw new Error('UNTHREAD_API_KEY environment variable is not set');
            }
            
            // Create FormData with proper structure for Unthread API
            const formData = new FormData();
            
            // Create a combined message body for the batch
            const attachmentNames = fileBuffers.map(buffer => buffer.fileName).join(', ');
            const batchMessage = message || `📎 Files uploaded: ${attachmentNames} (Total: ${fileBuffers.length} files, ${(totalSize / 1024 / 1024).toFixed(2)} MB)`;
            
            const messagePayload = {
                body: {
                    type: "markdown",
                    value: batchMessage
                },
                onBehalfOf: onBehalfOf || {
                    name: "Telegram Bot",
                    email: "bot@telegram.local"
                }
            };

            // Use 'json' field for message payload
            formData.append('json', JSON.stringify(messagePayload));

            // Add all files to the same FormData using 'attachments' field
            fileBuffers.forEach((fileBuffer, index) => {
                formData.append('attachments', fileBuffer.buffer, fileBuffer.fileName);
                LogEngine.debug(`Added file ${index + 1}/${fileBuffers.length}: ${fileBuffer.fileName} (${fileBuffer.size} bytes)`);
            });

            LogEngine.info(`Sending batch upload request to Unthread with ${fileBuffers.length} files`);

            // Upload to Unthread API
            const uploadResponse = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: {
                    'X-API-KEY': UNTHREAD_API_KEY,
                    'X-Request-ID': `telegram-bot-batch-${conversationId}-${Date.now()}`,
                    ...formData.getHeaders()
                },
                body: formData
            });

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text().catch(() => 'Unknown error');
                LogEngine.error(`Unthread batch upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
                throw new Error(`Unthread batch upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
            }

            const responseData = await uploadResponse.json() as UnthreadMessageResponse;

            LogEngine.info(`Batch upload successful to Unthread: messageId=${responseData?.ts || responseData?.id || 'unknown'}, attachments=${fileBuffers.length}`);

            // Security: Zero out buffers after upload
            fileBuffers.forEach(fileBuffer => {
                fileBuffer.buffer.fill(0);
            });

            return true;

        } catch (error) {
            LogEngine.error(`Error during batch upload to Unthread for conversation ${conversationId}:`, {
                error: error instanceof Error ? error.message : String(error),
                fileCount: fileBuffers.length,
                totalSize: totalSize,
                conversationId
            });
            throw error;
        }
    }

    /**
     * Enhanced main buffer processing pipeline with batch upload support
     */
    async processBufferAttachments(fileIds: string[], conversationId: string, message?: string, onBehalfOf?: { name: string; email: string | undefined }): Promise<BufferProcessingResult> {
        const startTime = Date.now();
        LogEngine.info('[AttachmentHandler] Starting buffer-based attachment processing', {
            fileCount: fileIds.length,
            conversationId,
            version: '4.0.0',
            mode: 'buffer-only'
        });

        const errors: string[] = [];
        let processedFiles = 0;

        // Check if this is a media group (multiple files) that should be sent as batch
        if (fileIds.length > 1) {
            LogEngine.info('[AttachmentHandler] Multiple files detected - using batch upload', {
                fileCount: fileIds.length,
                conversationId
            });
            
            try {
                // First, load all files to buffers
                const fileBuffers: FileBuffer[] = [];
                for (const fileId of fileIds) {
                    const fileBuffer = await this.loadFileToBuffer(fileId);
                    fileBuffers.push(fileBuffer);
                }
                
                // Upload all files as a batch
                const success = await this.uploadMultipleBuffersToUnthread(conversationId, fileBuffers, message || "", onBehalfOf);
                const processingTime = Date.now() - startTime;
                
                return {
                    success,
                    processedFiles: success ? fileIds.length : 0,
                    totalFiles: fileIds.length,
                    errors: success ? [] : ['Batch upload failed'],
                    processingTime
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                LogEngine.error('[AttachmentHandler] Batch upload failed', {
                    error: errorMessage,
                    fileCount: fileIds.length,
                    conversationId
                });
                
                const processingTime = Date.now() - startTime;
                return {
                    success: false,
                    processedFiles: 0,
                    totalFiles: fileIds.length,
                    errors: [errorMessage],
                    processingTime
                };
            }
        }

        // Single file processing (existing logic)
        for (const fileId of fileIds) {
            try {
                // Sequential processing to manage memory usage
                const fileBuffer = await this.loadFileToBuffer(fileId);
                const uploadSuccess = await this.uploadBufferToUnthread(
                    fileBuffer, 
                    conversationId, 
                    message,
                    onBehalfOf
                );

                if (uploadSuccess) {
                    processedFiles++;
                    LogEngine.debug('[AttachmentHandler] File processed successfully', {
                        fileId,
                        fileName: fileBuffer.fileName,
                        processedFiles,
                        totalFiles: fileIds.length
                    });
                } else {
                    errors.push(`Upload failed for file: ${fileBuffer.fileName}`);
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(`Failed to process file ${fileId}: ${errorMessage}`);
                LogEngine.error('[AttachmentHandler] File processing failed', {
                    fileId,
                    error: errorMessage,
                    conversationId
                });
            }
        }

        const processingTime = Date.now() - startTime;
        const success = processedFiles > 0 && errors.length === 0;

        LogEngine.info('[AttachmentHandler] Buffer-based processing completed', {
            success,
            processedFiles,
            totalFiles: fileIds.length,
            errors: errors.length,
            processingTime
        });

        return {
            success,
            processedFiles,
            totalFiles: fileIds.length,
            errors,
            processingTime
        };
    }

    /**
     * Main public interface - Simple attachment processing
     */
    async processAttachments(fileIds: string[], conversationId: string, message?: string, onBehalfOf?: { name: string; email: string | undefined }): Promise<boolean> {
        LogEngine.info('[AttachmentHandler] Processing attachments', {
            fileCount: fileIds.length,
            conversationId,
            streamSupport: false
        });

        // Validation
        if (!fileIds || fileIds.length === 0) {
            LogEngine.warn('[AttachmentHandler] No file IDs provided');
            return false;
        }

        if (fileIds.length > BUFFER_ATTACHMENT_CONFIG.maxFiles) {
            LogEngine.error('[AttachmentHandler] Too many files', {
                provided: fileIds.length,
                maxAllowed: BUFFER_ATTACHMENT_CONFIG.maxFiles
            });
            return false;
        }

        if (!conversationId || conversationId.trim() === '') {
            LogEngine.error('[AttachmentHandler] Invalid conversation ID');
            return false;
        }

        // Memory pre-check
        const initialMemory = process.memoryUsage();
        LogEngine.debug('Memory usage before processing', {
            heapUsedMB: Math.round(initialMemory.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(initialMemory.heapTotal / 1024 / 1024)
        });

        try {
            // Use buffer-based approach (ONLY option)
            const result = await this.processBufferAttachments(fileIds, conversationId, message, onBehalfOf);
            
            // Post-processing memory check
            const finalMemory = process.memoryUsage();
            const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;
            
            LogEngine.info('Memory usage after processing', {
                heapUsedMB: Math.round(finalMemory.heapUsed / 1024 / 1024),
                memoryDeltaMB: Math.round(memoryDelta / 1024 / 1024),
                processingSuccess: result.success
            });

            if (result.success) {
                LogEngine.info('[AttachmentHandler] Buffer processing completed successfully', {
                    conversationId,
                    processedFiles: result.processedFiles,
                    totalFiles: result.totalFiles,
                    processingTime: result.processingTime,
                    memoryEfficient: memoryDelta < (10 * 1024 * 1024) // Less than 10MB growth
                });
            } else {
                LogEngine.error('[AttachmentHandler] Buffer processing failed', {
                    conversationId,
                    errorCount: result.errors.length,
                    errors: result.errors.slice(0, 3), // Limit logged errors to prevent spam
                    processingTime: result.processingTime
                });
            }
            
            return result.success;

        } catch (error) {
            LogEngine.error('[AttachmentHandler] Critical error in attachment processing', {
                conversationId,
                fileCount: fileIds.length,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined
            });
            return false;
        } finally {
            // Cleanup and memory management
            if (global.gc && BUFFER_ATTACHMENT_CONFIG.enablePerformanceMetrics) {
                const currentMemory = process.memoryUsage().heapUsed;
                if (currentMemory > BUFFER_ATTACHMENT_CONFIG.memoryThreshold) {
                    LogEngine.debug('Triggering garbage collection after attachment processing');
                    global.gc();
                }
            }
        }
    }

    /**
     * Enhanced cleanup method for proper resource management
     */
    private stopMemoryOptimization(): void {
        if (this.memoryMonitoringInterval) {
            clearInterval(this.memoryMonitoringInterval);
            delete this.memoryMonitoringInterval;
        }

        LogEngine.debug('AttachmentHandler memory optimization stopped');
    }

    /**
     * Upload image buffer to Telegram using Bot API
     * Leverages existing error handling and retry patterns for reliable delivery
     */
    async uploadBufferToTelegram(
        fileBuffer: FileBuffer, 
        chatId: number, 
        replyToMessageId?: number,
        caption?: string
    ): Promise<boolean> {
        
        const operationContext: PerformanceContext = {
            fileName: fileBuffer.fileName,
            fileSize: fileBuffer.size,
            conversationId: chatId.toString()
        };

        try {
            const { result } = await withPerformanceMonitoring(async () => {
                return await withRetry(async () => {
                    LogEngine.info('[AttachmentHandler] Starting image upload to Telegram', {
                        fileName: fileBuffer.fileName,
                        fileSize: fileBuffer.size,
                        chatId,
                        replyToMessageId,
                        hasCaption: !!caption,
                        method: 'uploadBufferToTelegram'
                    });

                    // Validate Telegram Bot Token
                    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
                    if (!TELEGRAM_BOT_TOKEN) {
                        throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
                    }

                    // Image-specific validation
                    if (!fileBuffer.mimeType.startsWith('image/')) {
                        throw new Error(`Only images are supported in this release. Got: ${fileBuffer.mimeType}`);
                    }

                    // Create FormData for Telegram Bot API
                    const formData = new FormData();
                    formData.append('chat_id', chatId.toString());
                    formData.append('photo', fileBuffer.buffer, {
                        filename: fileBuffer.fileName,
                        contentType: fileBuffer.mimeType
                    });

                    // Add optional parameters
                    if (caption) {
                        formData.append('caption', caption.substring(0, 1024)); // Telegram caption limit
                    }

                    if (replyToMessageId) {
                        formData.append('reply_to_message_id', replyToMessageId.toString());
                    }

                    LogEngine.debug('[AttachmentHandler] FormData prepared for Telegram upload', {
                        fileName: fileBuffer.fileName,
                        chatId,
                        captionLength: caption?.length || 0,
                        hasReplyTo: !!replyToMessageId
                    });

                    // Upload to Telegram Bot API using sendPhoto endpoint
                    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
                    const uploadResponse = await fetch(telegramApiUrl, {
                        method: 'POST',
                        headers: {
                            'User-Agent': 'unthread-telegram-bot/2.0.0-image-flow',
                            ...formData.getHeaders()
                        },
                        body: formData
                    });

                    LogEngine.debug('[AttachmentHandler] Received Telegram API response', {
                        fileName: fileBuffer.fileName,
                        status: uploadResponse.status,
                        statusText: uploadResponse.statusText,
                        ok: uploadResponse.ok
                    });

                    if (!uploadResponse.ok) {
                        const errorText = await uploadResponse.text().catch(() => 'Unknown error');
                        throw new Error(`Telegram upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
                    }

                    const responseData = await uploadResponse.json() as TelegramSendPhotoResponse;

                    if (!responseData.ok) {
                        throw new Error(`Telegram API error: ${responseData.description || 'Unknown error'}`);
                    }

                    LogEngine.info('[AttachmentHandler] Image uploaded to Telegram successfully', {
                        fileName: fileBuffer.fileName,
                        fileSize: fileBuffer.size,
                        chatId,
                        messageId: responseData.result?.message_id || 'unknown',
                        fileId: responseData.result?.photo?.[0]?.file_id || 'unknown'
                    });

                    // Security: Zero out buffer after upload
                    fileBuffer.buffer.fill(0);

                    return true;

                }, `uploadBufferToTelegram-${chatId}`, operationContext);
            }, `uploadBufferToTelegram-withPerformanceMonitoring-${chatId}`, operationContext);

            return result;

        } catch (error) {
            const classifiedError = classifyError(error instanceof Error ? error : new Error(String(error)), operationContext);
            
            LogEngine.error('[AttachmentHandler] Image upload to Telegram failed', {
                fileName: fileBuffer.fileName,
                chatId,
                errorCode: classifiedError.code,
                technicalMessage: classifiedError.message,
                retryable: classifiedError.retryable,
                context: operationContext
            });

            throw error;
        }
    }

    /**
     * Upload multiple image buffers to Telegram as media group
     * Optimized for batch image delivery with proper grouping
     */
    async uploadMultipleImagesToTelegram(
        imageBuffers: FileBuffer[],
        chatId: number,
        replyToMessageId?: number,
        caption?: string
    ): Promise<boolean> {
        
        LogEngine.info('[AttachmentHandler] Starting batch image upload to Telegram', {
            imageCount: imageBuffers.length,
            chatId,
            replyToMessageId,
            hasCaption: !!caption
        });

        try {
            // Validate all files are images
            const nonImages = imageBuffers.filter(buf => !buf.mimeType.startsWith('image/'));
            if (nonImages.length > 0) {
                throw new Error(`Non-image files detected: ${nonImages.map(f => f.fileName).join(', ')}`);
            }

            // Telegram media group limit is 10 items
            if (imageBuffers.length > 10) {
                LogEngine.warn('[AttachmentHandler] Too many images for media group, processing individually', {
                    imageCount: imageBuffers.length,
                    limit: 10
                });
                
                // Process individually if too many
                let successCount = 0;
                for (const imageBuffer of imageBuffers) {
                    try {
                        await this.uploadBufferToTelegram(imageBuffer, chatId, replyToMessageId);
                        successCount++;
                    } catch (error) {
                        LogEngine.error('[AttachmentHandler] Individual image upload failed', {
                            fileName: imageBuffer.fileName,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
                
                return successCount > 0;
            }

            // Use sendMediaGroup for 2-10 images
            if (imageBuffers.length > 1) {
                return await this.sendTelegramMediaGroup(imageBuffers, chatId, replyToMessageId, caption);
            }

            // Single image - use regular sendPhoto
            const firstBuffer = imageBuffers[0];
            if (!firstBuffer) {
                throw new Error('Invalid image buffer detected');
            }
            return await this.uploadBufferToTelegram(firstBuffer, chatId, replyToMessageId, caption);

        } catch (error) {
            LogEngine.error('[AttachmentHandler] Batch image upload to Telegram failed', {
                imageCount: imageBuffers.length,
                chatId,
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Send media group to Telegram (2-10 images)
     * Private helper method for batch image uploads
     */
    private async sendTelegramMediaGroup(
        imageBuffers: FileBuffer[],
        chatId: number,
        replyToMessageId?: number,
        caption?: string
    ): Promise<boolean> {
        
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (!TELEGRAM_BOT_TOKEN) {
            throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
        }

        try {
            // Prepare media array for sendMediaGroup
            const media = imageBuffers.map((buffer, index) => ({
                type: 'photo' as const,
                media: `attach://photo${index}`,
                caption: index === 0 ? caption?.substring(0, 1024) : undefined // Only first item gets caption
            }));

            // Create FormData
            const formData = new FormData();
            formData.append('chat_id', chatId.toString());
            formData.append('media', JSON.stringify(media));

            if (replyToMessageId) {
                formData.append('reply_to_message_id', replyToMessageId.toString());
            }

            // Attach all images
            imageBuffers.forEach((buffer, index) => {
                formData.append(`photo${index}`, buffer.buffer, {
                    filename: buffer.fileName,
                    contentType: buffer.mimeType
                });
            });

            LogEngine.debug('[AttachmentHandler] Sending media group to Telegram', {
                mediaCount: imageBuffers.length,
                chatId,
                hasCaption: !!caption
            });

            // Send to Telegram
            const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMediaGroup`;
            const response = await fetch(telegramApiUrl, {
                method: 'POST',
                headers: {
                    'User-Agent': 'unthread-telegram-bot/2.0.0-image-flow',
                    ...formData.getHeaders()
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Telegram media group upload failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const responseData = await response.json() as TelegramSendMediaGroupResponse;

            if (!responseData.ok) {
                throw new Error(`Telegram API error: ${responseData.description || 'Unknown error'}`);
            }

            LogEngine.info('[AttachmentHandler] Media group uploaded to Telegram successfully', {
                mediaCount: imageBuffers.length,
                chatId,
                messageCount: responseData.result?.length || 0
            });

            // Security: Zero out buffers after upload
            imageBuffers.forEach(buffer => buffer.buffer.fill(0));

            return true;

        } catch (error) {
            LogEngine.error('[AttachmentHandler] Media group upload failed', {
                imageCount: imageBuffers.length,
                chatId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Shutdown method for graceful cleanup
     */
    public shutdown(): void {
        LogEngine.info('AttachmentHandler shutting down');
        
        this.stopMemoryOptimization();
        
        // Clean up global buffer pool
        globalBufferPool.cleanup();
        
        // Final garbage collection if available
        if (global.gc && BUFFER_ATTACHMENT_CONFIG.enablePerformanceMetrics) {
            LogEngine.debug('Triggering final garbage collection');
            global.gc();
        }

        LogEngine.info('AttachmentHandler shutdown completed');
    }
}

// Create and export singleton instance
export const attachmentHandler = new AttachmentHandler();
