/**
 * Smart Input Validator for Support System
 * 
 * Demonstrates advanced TypeScript patterns, input validation,
 * and educational user feedback systems.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

/**
 * Validation result interface with comprehensive feedback
 */
export interface ValidationResult {
    isValid: boolean;
    severity: 'error' | 'warning' | 'info' | 'success';
    message: string;
    suggestion?: string;
    metadata?: {
        score?: number;
        wordCount?: number;
        characterCount?: number;
        detectedIssues?: string[];
        improvements?: string[];
    };
}

/**
 * Input analysis interface for educational feedback
 */
export interface InputAnalysis {
    qualityScore: number;
    hasKeywords: boolean;
    hasTechnicalTerms: boolean;
    hasContext: boolean;
    readabilityScore: number;
    suggestions: string[];
    strengths: string[];
}

/**
 * Smart Input Validator Class
 * Demonstrates advanced validation patterns with educational feedback
 */
export class SmartInputValidator {
    private static readonly MIN_LENGTH = 10;
    private static readonly MAX_LENGTH = 2000;
    private static readonly MIN_WORDS = 3;
    
    // Technical keywords for support context - optimized with Set for O(1) lookup
    private static readonly TECHNICAL_KEYWORDS = new Set([
        'error', 'bug', 'issue', 'problem', 'broken', 'not working',
        'crash', 'freeze', 'slow', 'timeout', 'connection', 'loading',
        'feature', 'function', 'button', 'page', 'screen', 'menu'
    ]);
    
    // Context indicator words - optimized with Set for O(1) lookup
    private static readonly CONTEXT_WORDS = new Set([
        'when', 'how', 'why', 'where', 'after', 'before', 'during',
        'while', 'tried', 'attempt', 'step', 'process'
    ]);

    /**
     * Validates support ticket summary input with comprehensive feedback
     * 
     * @param input - The user input to validate
     * @returns ValidationResult with detailed feedback
     */
    public static validateSummary(input: string): ValidationResult {
        const trimmed = input.trim();
        
        // Basic length validation
        if (trimmed.length < this.MIN_LENGTH) {
            return {
                isValid: false,
                severity: 'error',
                message: 'Description too short',
                suggestion: `Please provide at least ${this.MIN_LENGTH} characters. Current: ${trimmed.length}`,
                metadata: {
                    characterCount: trimmed.length,
                    detectedIssues: ['insufficient_length']
                }
            };
        }
        
        if (trimmed.length > this.MAX_LENGTH) {
            return {
                isValid: false,
                severity: 'error',
                message: 'Description too long',
                suggestion: `Please keep under ${this.MAX_LENGTH} characters. Current: ${trimmed.length}`,
                metadata: {
                    characterCount: trimmed.length,
                    detectedIssues: ['excessive_length']
                }
            };
        }
        
        // Word count validation
        const words = this.extractWords(trimmed);
        if (words.length < this.MIN_WORDS) {
            return {
                isValid: false,
                severity: 'warning',
                message: 'More detail needed',
                suggestion: `Please provide at least ${this.MIN_WORDS} words for clarity. Current: ${words.length}`,
                metadata: {
                    wordCount: words.length,
                    characterCount: trimmed.length,
                    detectedIssues: ['insufficient_words']
                }
            };
        }
        
        // Content quality analysis
        const analysis = this.analyzeInputQuality(trimmed);
        
        // Low quality check
        if (analysis.qualityScore < 0.4) {
            return {
                isValid: false,
                severity: 'warning',
                message: 'Description needs improvement',
                suggestion: this.generateImprovementSuggestion(analysis),
                metadata: {
                    score: analysis.qualityScore,
                    wordCount: words.length,
                    characterCount: trimmed.length,
                    detectedIssues: ['low_quality'],
                    improvements: analysis.suggestions.slice(0, 3)
                }
            };
        }
        
        // Success with quality feedback
        return {
            isValid: true,
            severity: 'success',
            message: 'Good description provided',
            metadata: {
                score: analysis.qualityScore,
                wordCount: words.length,
                characterCount: trimmed.length,
                improvements: analysis.strengths
            }
        };
    }

    /**
     * Analyzes input quality using multiple heuristics
     * Demonstrates natural language processing patterns
     */
    private static analyzeInputQuality(input: string): InputAnalysis {
        const text = input.toLowerCase();
        const words = this.extractWords(text);
        const sentences = this.extractSentences(input);
        
        let score = 0.3; // Base score
        const suggestions: string[] = [];
        const strengths: string[] = [];
        
        // Length scoring
        if (words.length >= 10) {
            score += 0.2;
            strengths.push('Good length');
        } else {
            suggestions.push('Add more details about the issue');
        }
        
        // Technical terms detection with optimized Set lookup
        const hasTechnicalTerms = words.some(word => 
            this.TECHNICAL_KEYWORDS.has(word)
        );
        if (hasTechnicalTerms) {
            score += 0.2;
            strengths.push('Contains relevant keywords');
        } else {
            suggestions.push('Include specific error messages or feature names');
        }
        
        // Context analysis with optimized Set lookup
        const hasContext = words.some(word => 
            this.CONTEXT_WORDS.has(word)
        );
        if (hasContext) {
            score += 0.15;
            strengths.push('Provides context');
        } else {
            suggestions.push('Mention when or how the issue occurs');
        }
        
        // Structure analysis
        if (sentences.length >= 2) {
            score += 0.1;
            strengths.push('Well structured');
        } else {
            suggestions.push('Break description into multiple sentences');
        }
        
        // Specific details check
        const hasSpecifics = /\b(button|page|screen|menu|option|setting|file)\b/i.test(text);
        if (hasSpecifics) {
            score += 0.1;
            strengths.push('Mentions specific elements');
        } else {
            suggestions.push('Specify which buttons or pages are affected');
        }
        
        // Readability scoring
        const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
        const readabilityScore = avgWordsPerSentence > 20 ? 0.5 : 
                               avgWordsPerSentence > 10 ? 0.7 : 0.9;
        
        return {
            qualityScore: Math.min(score, 1.0),
            hasKeywords: hasTechnicalTerms, // Keep for backward compatibility
            hasTechnicalTerms,
            hasContext,
            readabilityScore,
            suggestions,
            strengths
        };
    }

    /**
     * Generates improvement suggestions based on analysis
     */
    private static generateImprovementSuggestion(analysis: InputAnalysis): string {
        const topSuggestions = analysis.suggestions.slice(0, 2);
        if (topSuggestions.length === 0) {
            return 'Please provide more specific details about your issue.';
        }
        
        return topSuggestions.join('. ') + '.';
    }

    /**
     * Extracts meaningful words from text
     */
    private static extractWords(text: string): string[] {
        return text
            .split(/\s+/)
            .filter(word => word.length > 0)
            .filter(word => /[a-zA-Z]/.test(word)); // Contains at least one letter
    }

    /**
     * Extracts sentences from text
     */
    private static extractSentences(text: string): string[] {
        return text
            .split(/[.!?]+/)
            .map(sentence => sentence.trim())
            .filter(sentence => sentence.length > 0);
    }

    /**
     * Gets quality indicator emoji and text
     */
    public static getQualityIndicator(score: number): string {
        if (score >= 0.8) {return '🟢 Excellent detail';}
        if (score >= 0.6) {return '🟡 Good information';}
        if (score >= 0.4) {return '🔵 Basic details';}
        return '🔴 Needs improvement';
    }

    /**
     * Gets severity icon for UI display
     */
    public static getSeverityIcon(severity: ValidationResult['severity']): string {
        const icons = {
            error: '❌',
            warning: '⚠️',
            info: '💡',
            success: '✅'
        };
        return icons[severity] || '💬';
    }
}

/**
 * Email validation utilities with enhanced feedback
 */
export class SmartEmailValidator {
    private static readonly PERSONAL_DOMAINS = [
        'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
        'icloud.com', 'live.com', 'aol.com'
    ];

    /**
     * Enhanced email validation with business context
     */
    public static validateEmail(email: string): ValidationResult {
        const trimmed = email.trim().toLowerCase();
        
        // Safe email regex pattern - simplified to prevent ReDoS attacks
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        
        if (!emailRegex.test(trimmed)) {
            let suggestion = 'Please enter a valid email address.';
            
            if (!email.includes('@')) {
                suggestion = 'Email must contain @ symbol (e.g., user@company.com)';
            } else if (email.startsWith('@') || email.endsWith('@')) {
                suggestion = 'Email cannot start or end with @';
            } else if (!trimmed.includes('.')) {
                suggestion = 'Email must include domain extension (e.g., .com, .org)';
            }
            
            return {
                isValid: false,
                severity: 'error',
                message: 'Invalid email format',
                suggestion,
                metadata: {
                    detectedIssues: ['invalid_format']
                }
            };
        }
        
        // Domain analysis
        const domain = trimmed.split('@')[1];
        if (!domain) {
            return {
                isValid: false,
                severity: 'error',
                message: 'Invalid email format',
                suggestion: 'Email must include a valid domain (e.g., user@company.com)',
                metadata: {
                    detectedIssues: ['missing_domain']
                }
            };
        }
        
        const isPersonalEmail = this.PERSONAL_DOMAINS.includes(domain);
        
        if (isPersonalEmail) {
            return {
                isValid: true,
                severity: 'info',
                message: 'Personal email detected',
                suggestion: 'Consider using your work email for better support coverage and SLA response times.',
                metadata: {
                    detectedIssues: ['personal_domain'],
                    improvements: ['work_email_recommended']
                }
            };
        }
        
        return {
            isValid: true,
            severity: 'success',
            message: 'Email format valid',
            metadata: {
                improvements: ['business_email_detected']
            }
        };
    }
}
