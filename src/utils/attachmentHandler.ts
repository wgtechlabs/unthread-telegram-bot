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
 * File attachment result after processing
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
 * Attachment upload parameters
 */
export interface AttachmentUploadParams {
    conversationId: string;
    filePaths: string[];
    message?: string;
}

/**
 * Configuration for attachment handling
 */
export const ATTACHMENT_CONFIG = {
    // Maximum file size (20MB in bytes)
    maxFileSize: 20 * 1024 * 1024,
    
    // Maximum number of files per message
    maxFiles: 10,
    
    // Temporary directory for file storage
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
                
                if (message) {
                    uploadParams.message = message;
                }
                
                const uploadSuccess = await this.uploadToUnthread(uploadParams);

                return uploadSuccess;
            }

            return false;

        } catch (error) {
            console.error('[AttachmentHandler] Failed to process attachments:', {
                fileIds,
                conversationId,
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
            
        } finally {
            // Always cleanup temporary files
            if (tempFiles.length > 0) {
                await this.cleanupTempFiles(tempFiles);
            }
        }
    }
}

// Export singleton instance
export const attachmentHandler = new AttachmentHandler();
