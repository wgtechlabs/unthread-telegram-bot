/**
 * Simple Input Validators for Support System
 * 
 * Focused on practical validation without unnecessary complexity.
 * Designed for enterprise users who communicate professionally.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

/**
 * Simple validation result interface
 */
export interface SimpleValidationResult {
    isValid: boolean;
    message?: string;
    suggestion?: string;
}

/**
 * Simple Input Validator Class
 * Clean, straightforward validation for professional users
 */
export class SimpleInputValidator {
    // Telegram's message length limits
    private static readonly MIN_LENGTH = 10;
    private static readonly MAX_LENGTH = 4096; // Telegram's message limit
    
    /**
     * Validate support ticket summary
     * Simple length check for enterprise users
     */
    static validateSummary(input: string): SimpleValidationResult {
        const trimmed = input.trim();
        
        // Empty check
        if (!trimmed) {
            return {
                isValid: false,
                message: "Please provide a description of your issue",
                suggestion: "Tell us what problem you're experiencing"
            };
        }
        
        // Too short
        if (trimmed.length < this.MIN_LENGTH) {
            return {
                isValid: false,
                message: `Description too brief (${trimmed.length} characters)`,
                suggestion: `Please provide at least ${this.MIN_LENGTH} characters with more details about the issue`
            };
        }
        
        // Too long (Telegram limit)
        if (trimmed.length > this.MAX_LENGTH) {
            return {
                isValid: false,
                message: `Description too long (${trimmed.length} characters)`,
                suggestion: `Please keep it under ${this.MAX_LENGTH} characters. Break it into smaller parts if needed.`
            };
        }
        
        // All good!
        return {
            isValid: true
        };
    }
    
    /**
     * Get a simple stats string for user feedback
     */
    static getStats(input: string): string {
        const trimmed = input.trim();
        const wordCount = trimmed.split(/\s+/).filter(word => word.length > 0).length;
        return `${trimmed.length} characters, ${wordCount} words`;
    }
}
