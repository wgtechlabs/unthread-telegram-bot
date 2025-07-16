/**
 * Unthread Telegram Bot - File Attachment Handler
 * 
 * Handles file attachments from Telegram users to Unthread platform.
 * Manages file download, validation, temporary storage, and cleanup.
 * 
 * Core Features:
 * - Download files from Telegram Bot API
 * - Validate file types and sizes according to Unthread limits
 * - Temporary file storage and cleanup
 * - Upload files to Unthread with multipart/form-data
 * 
 * File Limits (Unthread API):
 * - Maximum file size: 20MB per file
 * - Maximum files: 10 files per conversation/message
 * - Supported formats: Common images, documents, and archives
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import FormData from 'form-data';
import dotenv from 'dotenv';
import { Readable } from 'stream';

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
 * Configuration for attachment handling (Legacy - kept for backward compatibility)
 */
export const ATTACHMENT_CONFIG = {
    // Maximum file size (20MB in bytes)
    maxFileSize: 20 * 1024 * 1024,
    
    // Maximum number of files per message
    maxFiles: 10,
    
    // Temporary directory for file storage (DEPRECATED - will be removed)
    tempDir: path.join(__dirname, '../../temp/attachments'),
    
    // Supported MIME types (common and safe file types)
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
 * Stream-based attachment configuration for new implementation
 */
export const STREAM_ATTACHMENT_CONFIG = {
    // API Limits
    telegramMaxSize: 20 * 1024 * 1024,       // 20MB (Telegram limit)
    unthreadMaxSize: 20 * 1024 * 1024,       // 20MB (Unthread limit)  
    unthreadMaxFiles: 10,                     // 10 files max per message
    
    // Stream Processing
    chunkSize: 64 * 1024,                     // 64KB chunks
    streamTimeout: 30000,                     // 30 seconds
    maxConcurrentStreams: 3,                  // Parallel processing limit
    
    // Memory Management
    maxMemoryBuffer: 5 * 1024 * 1024,        // 5MB in-memory buffer
    enableBackpressure: true,                 // Flow control
    
    // Validation
    validateDuringStream: true,               // Real-time validation
    earlyTermination: true,                   // Stop invalid streams early
    
    // Supported MIME types (inherited from legacy config)
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
 * AttachmentHandler Class
 * 
 * Manages the complete lifecycle of file attachments from Telegram to Unthread
 */
export class AttachmentHandler {
    private botToken: string;
    private unthreadApiKey: string;
    private unthreadBaseUrl: string;

    constructor() {
        console.log('[AttachmentHandler] Initializing...');
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
        this.unthreadApiKey = process.env.UNTHREAD_API_KEY || '';
        this.unthreadBaseUrl = 'https://api.unthread.io/api';
        
        // Ensure temp directory exists
        this.ensureTempDirectory();
    }

    /**
     * Ensures the temporary directory exists for file storage
     */
    private ensureTempDirectory(): void {
        try {
            if (!fs.existsSync(ATTACHMENT_CONFIG.tempDir)) {
                fs.mkdirSync(ATTACHMENT_CONFIG.tempDir, { recursive: true });
                console.log('[AttachmentHandler] Created temporary attachments directory:', ATTACHMENT_CONFIG.tempDir);
            }
        } catch (error) {
            console.error('[AttachmentHandler] Failed to create temp directory:', {
                error: error instanceof Error ? error.message : String(error),
                path: ATTACHMENT_CONFIG.tempDir 
            });
        }
    }

    /**
     * Validates file type against allowed MIME types
     * 
     * @param mimeType - MIME type to validate
     * @param fileName - File name for extension fallback
     * @returns True if file type is allowed
     */
    private isValidFileType(mimeType: string, fileName: string): boolean {
        // First check direct MIME type
        if (ATTACHMENT_CONFIG.allowedMimeTypes.includes(mimeType)) {
            return true;
        }
        
        // Fallback to file extension
        const extension = path.extname(fileName).toLowerCase();
        const expectedMime = ATTACHMENT_CONFIG.extensionToMime[extension as keyof typeof ATTACHMENT_CONFIG.extensionToMime];
        
        return expectedMime ? ATTACHMENT_CONFIG.allowedMimeTypes.includes(expectedMime) : false;
    }

    /**
     * Downloads a file from Telegram Bot API
     * 
     * @param fileId - Telegram file ID
     * @returns Promise<AttachmentResult> - Download result with local path
     */
    async downloadTelegramFile(fileId: string): Promise<AttachmentResult> {
        try {
            console.log('[AttachmentHandler] Starting Telegram file download, fileId:', fileId);

            // Step 1: Get file info from Telegram
            const fileInfoUrl = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`;
            const fileInfoResponse = await fetch(fileInfoUrl);
            const fileInfo = await fileInfoResponse.json() as TelegramApiResponse;

            if (!fileInfo.ok) {
                throw new Error(`Telegram API error: ${fileInfo.description}`);
            }

            const telegramFile = fileInfo.result;
            if (!telegramFile?.file_path) {
                throw new Error('No file path received from Telegram API');
            }

            // Step 2: Validate file size
            if (telegramFile.file_size && telegramFile.file_size > ATTACHMENT_CONFIG.maxFileSize) {
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
                mimeType = ATTACHMENT_CONFIG.extensionToMime[fileExtension as keyof typeof ATTACHMENT_CONFIG.extensionToMime] || 'application/octet-stream';
            }

            // Step 4: Validate file type
            if (!this.isValidFileType(mimeType, fileName)) {
                return {
                    success: false,
                    error: `File type not supported: ${mimeType} (.${fileExtension})`
                };
            }

            // Step 5: Download the actual file
            const fileDownloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${telegramFile.file_path}`;
            const fileResponse = await fetch(fileDownloadUrl);
            
            if (!fileResponse.ok) {
                throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
            }

            // Step 6: Save to temporary location
            const tempFileName = `${Date.now()}_${fileName}`;
            const localPath = path.join(ATTACHMENT_CONFIG.tempDir, tempFileName);
            
            const fileBuffer = await fileResponse.buffer();
            fs.writeFileSync(localPath, fileBuffer);

            console.log('[AttachmentHandler] File downloaded successfully:', {
                fileName,
                fileSize: telegramFile.file_size,
                mimeType,
                localPath
            });

            return {
                success: true,
                localPath,
                fileName,
                fileSize: telegramFile.file_size || 0,
                mimeType
            };

        } catch (error) {
            console.error('[AttachmentHandler] Failed to download Telegram file:', {
                fileId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                error: `Download failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Downloads a file from Telegram Bot API using streams (NEW IMPLEMENTATION)
     * 
     * @param fileId - Telegram file ID
     * @returns Promise<StreamResult> - Stream result with readable stream
     */
    async downloadTelegramFileAsStream(fileId: string): Promise<StreamResult> {
        try {
            console.log('[AttachmentHandler] Starting Telegram file stream download, fileId:', fileId);

            // Step 1: Get file info from Telegram
            const fileInfoUrl = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`;
            const fileInfoResponse = await fetch(fileInfoUrl);
            const fileInfo = await fileInfoResponse.json() as TelegramApiResponse;

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
                mimeType = STREAM_ATTACHMENT_CONFIG.extensionToMime[fileExtension as keyof typeof STREAM_ATTACHMENT_CONFIG.extensionToMime] || 'application/octet-stream';
            }

            // Step 4: Validate file type using stream config
            if (!this.isValidFileTypeStream(mimeType, fileName)) {
                return {
                    success: false,
                    error: `File type not supported: ${mimeType} (${fileExtension})`
                };
            }

            // Step 5: Create streaming download
            const fileDownloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${telegramFile.file_path}`;
            const fileResponse = await fetch(fileDownloadUrl);
            
            if (!fileResponse.ok) {
                throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
            }

            // Step 6: Convert response body to Node.js Readable stream
            if (!fileResponse.body) {
                throw new Error('No response body received from Telegram API');
            }
            
            let stream = Readable.fromWeb(fileResponse.body as any);
            
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
        const expectedMime = STREAM_ATTACHMENT_CONFIG.extensionToMime[extension as keyof typeof STREAM_ATTACHMENT_CONFIG.extensionToMime];
        
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

    /**
     * Uploads files to Unthread using multipart/form-data
     * 
     * @param params - Upload parameters with conversation ID and file paths
     * @returns Promise<boolean> - Success status
     */
    async uploadToUnthread(params: AttachmentUploadParams): Promise<boolean> {
        try {
            console.log('[AttachmentHandler] Starting Unthread file upload:', {
                conversationId: params.conversationId,
                fileCount: params.filePaths.length
            });

            // Create form data
            const form = new FormData();
            
            // Add the message payload as JSON
            const messagePayload = {
                conversationId: params.conversationId,
                message: params.message || 'File attachment(s) uploaded via Telegram'
            };
            
            form.append('payload_json', JSON.stringify(messagePayload));

            // Add each file to the form
            for (const filePath of params.filePaths) {
                if (!fs.existsSync(filePath)) {
                    console.warn('[AttachmentHandler] File not found, skipping:', filePath);
                    continue;
                }

                const fileName = path.basename(filePath);
                const fileStream = fs.createReadStream(filePath);
                form.append('files', fileStream, fileName);
            }

            // Upload to Unthread
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
            
            console.log('[AttachmentHandler] Files uploaded to Unthread successfully:', {
                conversationId: params.conversationId,
                messageId: result.ts,
                fileCount: params.filePaths.length
            });

            return true;

        } catch (error) {
            console.error('[AttachmentHandler] Failed to upload files to Unthread:', {
                conversationId: params.conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Cleans up temporary files after processing
     * 
     * @param filePaths - Array of file paths to clean up
     */
    async cleanupTempFiles(filePaths: string[]): Promise<void> {
        for (const filePath of filePaths) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log('[AttachmentHandler] Cleaned up temporary file:', filePath);
                }
            } catch (error) {
                console.warn('[AttachmentHandler] Failed to cleanup temporary file:', {
                    filePath,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    /**
     * Processes multiple file attachments from Telegram to Unthread
     * 
     * @param fileIds - Array of Telegram file IDs
     * @param conversationId - Unthread conversation ID
     * @param message - Optional message to include with files
     * @returns Promise<boolean> - Success status
     */
    async processAttachments(fileIds: string[], conversationId: string, message?: string): Promise<boolean> {
        const tempFiles: string[] = [];
        
        try {
            // Validate file count
            if (fileIds.length > ATTACHMENT_CONFIG.maxFiles) {
                throw new Error(`Too many files: ${fileIds.length} (max: ${ATTACHMENT_CONFIG.maxFiles})`);
            }

            // Download all files from Telegram
            const downloadResults: AttachmentResult[] = [];
            for (const fileId of fileIds) {
                const result = await this.downloadTelegramFile(fileId);
                downloadResults.push(result);
                
                if (result.success && result.localPath) {
                    tempFiles.push(result.localPath);
                }
            }

            // Check if any downloads failed
            const failures = downloadResults.filter(r => !r.success);
            if (failures.length > 0) {
                console.error('[AttachmentHandler] Some file downloads failed:', failures);
                return false;
            }

            // Upload successfully downloaded files to Unthread
            if (tempFiles.length > 0) {
                const uploadParams: AttachmentUploadParams = {
                    conversationId,
                    filePaths: tempFiles
                };
                
                return await this.uploadToUnthread(uploadParams);
            }
            
            return false;
        } catch (error) {
            console.error('[AttachmentHandler] Error processing attachments:', error);
            
            // Clean up any downloaded files
            for (const tempFile of tempFiles) {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                } catch (cleanupError) {
                    console.error('[AttachmentHandler] Error cleaning up temp file:', tempFile, cleanupError);
                }
            }
            
            return false;
        }
    }

    /**
     * Stream error handling utility
     * 
     * @param stream - Stream to add error handling to
     * @param fileName - File name for logging context
     * @returns Stream with error handling attached
     */
    private addStreamErrorHandling(stream: Readable, fileName: string): Readable {
        stream.on('error', (error) => {
            console.error(`[AttachmentHandler] Stream error for ${fileName}:`, error);
        });

        stream.on('timeout', () => {
            console.warn(`[AttachmentHandler] Stream timeout for ${fileName}`);
            stream.destroy();
        });

        return stream;
    }

    /**
     * Stream Validation Engine - Real-time validation during streaming
     * 
     * Validates files as they are being streamed to catch issues early
     * and prevent resource waste on invalid files.
     */

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
        return STREAM_ATTACHMENT_CONFIG.extensionToMime[extension as keyof typeof STREAM_ATTACHMENT_CONFIG.extensionToMime] || null;
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
     * Batch download with validation for multiple files
     * 
     * @param fileIds - Array of Telegram file IDs
     * @returns Promise<StreamResult[]> - Array of validated stream results
     */
    async downloadMultipleFilesAsValidatedStreams(fileIds: string[]): Promise<StreamResult[]> {
        console.log(`[AttachmentHandler] Starting batch validated stream downloads for ${fileIds.length} files`);
        
        // Validate file count
        if (fileIds.length > STREAM_ATTACHMENT_CONFIG.unthreadMaxFiles) {
            throw new Error(`Too many files: ${fileIds.length} (max: ${STREAM_ATTACHMENT_CONFIG.unthreadMaxFiles})`);
        }

        // Process files with controlled concurrency
        const results: StreamResult[] = [];
        const concurrencyLimit = STREAM_ATTACHMENT_CONFIG.maxConcurrentStreams;
        
        for (let i = 0; i < fileIds.length; i += concurrencyLimit) {
            const batch = fileIds.slice(i, i + concurrencyLimit);
            const batchPromises = batch.map(fileId => 
                STREAM_ATTACHMENT_CONFIG.validateDuringStream 
                    ? this.downloadTelegramFileAsStreamWithValidation(fileId)
                    : this.downloadTelegramFileAsStream(fileId)
            );
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        const successCount = results.filter(r => r.success).length;
        const validationMode = STREAM_ATTACHMENT_CONFIG.validateDuringStream ? 'with validation' : 'basic';
        
        console.log(`[AttachmentHandler] Completed batch stream downloads ${validationMode}: ${successCount}/${fileIds.length} successful`);

        return results;
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
                
                // Add message if provided
                if (params.message) {
                    form.append('message', params.message);
                }
                
                // Add conversation ID
                form.append('conversation_id', params.conversationId);

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
                    const response = await fetch(`${process.env.UNTHREAD_WEBHOOK_URL}/messages`, {
                        method: 'POST',
                        body: form,
                        headers: {
                            'Authorization': `Bearer ${process.env.UNTHREAD_TOKEN}`,
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
                error: streamError.message,
                retryAttempts: streamError.retryAttempt || 0,
                processingTime: `${Date.now() - startTime}ms`
            });

            return false;
        }
    }

    /**
     * Enhanced end-to-end stream processing with comprehensive error handling
     */
    async processAttachmentsAsStreamsWithRecovery(
        fileIds: string[],
        conversationId: string,
        message?: string
    ): Promise<BatchStreamResult> {
        const startTime = Date.now();
        console.log(`[AttachmentHandler] Starting enhanced end-to-end stream processing for ${fileIds.length} files`);

        try {
            // Validate input parameters
            if (!fileIds.length || fileIds.length > STREAM_ATTACHMENT_CONFIG.unthreadMaxFiles) {
                throw this.createStreamError(
                    StreamErrorType.VALIDATION_ERROR,
                    `Invalid file count: ${fileIds.length} (max: ${STREAM_ATTACHMENT_CONFIG.unthreadMaxFiles})`,
                    undefined,
                    { fileIds: fileIds.length, conversationId }
                );
            }

            // Download files with enhanced error handling
            const downloadResult = await this.downloadMultipleFilesWithRecovery(fileIds);
            
            // If no successful downloads, return failure
            if (downloadResult.successfulStreams.length === 0) {
                console.error('[AttachmentHandler] No streams downloaded successfully');
                return {
                    ...downloadResult,
                    overallSuccess: false
                };
            }

            // Upload successful streams with recovery
            const uploadParams: StreamUploadParams = {
                conversationId,
                streams: downloadResult.successfulStreams,
                ...(message && { message })
            };
            
            const uploadSuccess = await this.uploadStreamsToUnthreadWithRecovery(uploadParams);
            
            const totalProcessingTime = Date.now() - startTime;

            console.log(`[AttachmentHandler] Enhanced end-to-end processing completed:`, {
                fileIds: fileIds.length,
                downloaded: downloadResult.successfulStreams.length,
                uploaded: uploadSuccess ? downloadResult.successfulStreams.length : 0,
                failed: downloadResult.failedStreams.length,
                totalTime: `${totalProcessingTime}ms`,
                overallSuccess: uploadSuccess && downloadResult.successfulStreams.length > 0
            });

            return {
                ...downloadResult,
                overallSuccess: uploadSuccess && downloadResult.successfulStreams.length > 0,
                processingTime: totalProcessingTime
            };

        } catch (error) {
            const streamError = error instanceof Error && 'type' in error && 'recoverable' in error && 'timestamp' in error ? 
                error as StreamError : 
                this.createStreamError(
                    StreamErrorType.UNKNOWN_ERROR,
                    `End-to-end processing failed: ${error instanceof Error ? error.message : String(error)}`,
                    error instanceof Error ? error : undefined,
                    { fileIds: fileIds.length, conversationId }
                );

            console.error('[AttachmentHandler] Enhanced end-to-end processing failed:', {
                fileIds: fileIds.length,
                conversationId,
                error: streamError.message,
                processingTime: `${Date.now() - startTime}ms`
            });

            return {
                overallSuccess: false,
                successfulStreams: [],
                failedStreams: [],
                partialSuccesses: [],
                totalFiles: fileIds.length,
                processingTime: Date.now() - startTime,
                aggregatedErrors: [streamError]
            };
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

    /**
     * Downloads Telegram file as stream with comprehensive error recovery
     */
    async downloadTelegramFileAsStreamWithRecovery(
        fileId: string,
        fileName: string = 'unknown'
    ): Promise<EnhancedStreamResult> {
        const startTime = Date.now();
        const errors: StreamError[] = [];
        let bytesProcessed = 0;

        try {
            const result = await this.retryWithBackoff(async () => {
                // Get file info using existing method
                const fileInfoResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
                const fileInfoData = await fileInfoResponse.json() as TelegramApiResponse;
                
                if (!fileInfoData.ok || !fileInfoData.result?.file_path) {
                    throw new Error(`Failed to get file info for ${fileId}`);
                }

                // Enhanced stream download with monitoring
                const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfoData.result.file_path}`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), STREAM_ERROR_CONFIG.networkTimeout);

                try {
                    const response = await fetch(downloadUrl, {
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    if (!response.body) {
                        throw new Error('No response body available for streaming');
                    }

                    // Convert ReadableStream to Node.js Readable
                    const stream = new Readable({
                        read() {}
                    });

                    let streamBytesProcessed = 0;
                    
                    // Process the response body
                    if (response.body) {
                        try {
                            // Use response.body as async iterable for Node.js compatibility
                            const responseBuffer = await response.arrayBuffer();
                            const uint8Array = new Uint8Array(responseBuffer);
                            
                            streamBytesProcessed = uint8Array.length;
                            bytesProcessed = streamBytesProcessed;

                            // Check size limits
                            if (streamBytesProcessed > STREAM_ATTACHMENT_CONFIG.telegramMaxSize) {
                                throw this.createStreamError(
                                    StreamErrorType.SIZE_LIMIT_ERROR,
                                    `File exceeds size limit: ${streamBytesProcessed} > ${STREAM_ATTACHMENT_CONFIG.telegramMaxSize}`,
                                    undefined,
                                    { fileName, fileSize: streamBytesProcessed }
                                );
                            }

                            // Create stream from buffer
                            stream.push(uint8Array);
                            stream.push(null); // End stream
                            
                        } catch (error) {
                            stream.destroy(error instanceof Error ? error : new Error(String(error)));
                        }
                    } else {
                        stream.push(null); // Empty stream
                    }

                    // Add error handling to stream
                    stream.on('error', (error) => {
                        const streamError = this.createStreamError(
                            StreamErrorType.STREAM_CORRUPTED,
                            `Stream error: ${error.message}`,
                            error,
                            { fileName, bytesProcessed: streamBytesProcessed }
                        );
                        errors.push(streamError);
                    });

                    return {
                        success: true,
                        stream,
                        fileName,
                        fileSize: fileInfoData.result.file_size,
                        mimeType: this.getMimeTypeFromFileNameStream(fileName)
                    };

                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            }, { fileName, fileSize: bytesProcessed });

            const processingTime = Date.now() - startTime;

            return {
                ...result,
                errors: errors.length > 0 ? errors : undefined,
                totalProcessingTime: processingTime,
                networkStats: {
                    downloadTime: processingTime,
                    bytesTransferred: bytesProcessed
                }
            } as EnhancedStreamResult;

        } catch (error) {
            const streamError = error instanceof Error && 'type' in error && 'recoverable' in error && 'timestamp' in error ? 
                error as StreamError : 
                this.createStreamError(
                    this.classifyError(error),
                    error instanceof Error ? error.message : String(error),
                    error instanceof Error ? error : undefined,
                    { fileName, bytesProcessed }
                );

            errors.push(streamError);

            return {
                success: false,
                error: streamError.message,
                errors,
                totalProcessingTime: Date.now() - startTime
            } as EnhancedStreamResult;
        }
    }

    /**
     * Downloads multiple files with enhanced error handling and recovery
     */
    async downloadMultipleFilesWithRecovery(
        fileIds: string[],
        fileNames: string[] = []
    ): Promise<BatchStreamResult> {
        const startTime = Date.now();
        const results: EnhancedStreamResult[] = [];
        const aggregatedErrors: StreamError[] = [];

        console.log(`[AttachmentHandler] Starting enhanced batch download for ${fileIds.length} files`);

        try {
            // Process files in controlled batches with recovery
            const batchSize = STREAM_ATTACHMENT_CONFIG.maxConcurrentStreams;
            
            for (let i = 0; i < fileIds.length; i += batchSize) {
                const batch = fileIds.slice(i, i + batchSize);
                const batchNames = fileNames.slice(i, i + batchSize);

                console.log(`[AttachmentHandler] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(fileIds.length / batchSize)}`);

                const batchPromises = batch.map(async (fileId, index) => {
                    const fileName = batchNames[index] || `file_${fileId}`;
                    return await this.downloadTelegramFileAsStreamWithRecovery(fileId, fileName);
                });

                const batchResults = await Promise.allSettled(batchPromises);
                
                // Process batch results
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        results.push(result.value);
                        if (result.value.errors) {
                            aggregatedErrors.push(...result.value.errors);
                        }
                    } else {
                        const fileName = batchNames[index] || `file_${batch[index]}`;
                        const errorResult: EnhancedStreamResult = {
                            success: false,
                            error: result.reason?.message || 'Unknown batch processing error',
                            errors: [this.createStreamError(
                                StreamErrorType.UNKNOWN_ERROR,
                                result.reason?.message || 'Batch processing failed',
                                result.reason,
                                { fileName }
                            )]
                        };
                        results.push(errorResult);
                        aggregatedErrors.push(...(errorResult.errors || []));
                    }
                });

                // Add delay between batches for backpressure control
                if (i + batchSize < fileIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            const processingTime = Date.now() - startTime;
            const successfulStreams = results.filter(r => r.success);
            const failedStreams = results.filter(r => !r.success);
            const partialSuccesses = results.filter(r => r.success && r.errors && r.errors.length > 0);

            console.log(`[AttachmentHandler] Enhanced batch download completed:`, {
                total: results.length,
                successful: successfulStreams.length,
                failed: failedStreams.length,
                partialSuccesses: partialSuccesses.length,
                processingTime: `${processingTime}ms`
            });

            return {
                overallSuccess: successfulStreams.length > 0,
                successfulStreams,
                failedStreams,
                partialSuccesses,
                totalFiles: fileIds.length,
                processingTime,
                aggregatedErrors
            };

        } catch (error) {
            console.error('[AttachmentHandler] Fatal error in enhanced batch download:', error);
            
            const fatalError = this.createStreamError(
                StreamErrorType.UNKNOWN_ERROR,
                `Batch download failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            );

            aggregatedErrors.push(fatalError);

            return {
                overallSuccess: false,
                successfulStreams: [],
                failedStreams: results,
                partialSuccesses: [],
                totalFiles: fileIds.length,
                processingTime: Date.now() - startTime,
                aggregatedErrors
            };
        }
    }
}

// Create and export singleton instance for backward compatibility
export const attachmentHandler = new AttachmentHandler();
