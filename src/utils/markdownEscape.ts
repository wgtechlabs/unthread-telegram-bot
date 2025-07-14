/**
 * Markdown Escape Utilities
 * 
 * Provides safe text escaping for Telegram Markdown formatting.
 * Essential for preventing entity parsing errors when user input
 * contains special Markdown characters.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

/**
 * Escapes special Markdown characters in user-provided text
 * 
 * This prevents Telegram API entity parsing errors when user input
 * contains characters like *, _, `, [, ], (, ), ~, >, #, +, -, =, |, {, }, ., !
 * 
 * @param text - The text to escape
 * @returns Safely escaped text for use in Markdown messages
 * 
 * @example
 * ```typescript
 * const userInput = "User's summary with *special* characters!";
 * const safeText = escapeMarkdown(userInput);
 * const message = `**Summary:** ${safeText}`;
 * ```
 */
export function escapeMarkdown(text: string): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // Escape all special Markdown characters that can break entity parsing
    // Order matters - backslash must be first to avoid double-escaping
    return text
        .replace(/\\/g, '\\\\')   // Backslash (must be first)
        .replace(/\*/g, '\\*')    // Asterisk (bold)
        .replace(/_/g, '\\_')     // Underscore (italic)
        .replace(/`/g, '\\`')     // Backtick (code)
        .replace(/\[/g, '\\[')    // Left square bracket (links)
        .replace(/\]/g, '\\]')    // Right square bracket (links)
        .replace(/\(/g, '\\(')    // Left parenthesis (links)
        .replace(/\)/g, '\\)')    // Right parenthesis (links)
        .replace(/~/g, '\\~')     // Tilde (strikethrough)
        .replace(/>/g, '\\>')     // Greater than (blockquote)
        .replace(/#/g, '\\#')     // Hash (heading)
        .replace(/\+/g, '\\+')    // Plus (list)
        .replace(/-/g, '\\-')     // Minus (list)
        .replace(/=/g, '\\=')     // Equals (heading)
        .replace(/\|/g, '\\|')    // Pipe (table)
        .replace(/\{/g, '\\{')    // Left brace
        .replace(/\}/g, '\\}')    // Right brace
        .replace(/\./g, '\\.')    // Period (list)
        .replace(/!/g, '\\!');    // Exclamation (emphasis)
}

/**
 * Escapes text specifically for use in Markdown code blocks
 * Only escapes backticks to prevent code block breaking
 * 
 * @param text - The text to escape for code blocks
 * @returns Text safe for use in code blocks
 */
export function escapeMarkdownCode(text: string): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text.replace(/`/g, '\\`');
}

/**
 * Truncates text safely and adds ellipsis if needed
 * Useful for preventing overly long messages that might cause issues
 * 
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation (default: 100)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number = 100): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    if (text.length <= maxLength) {
        return text;
    }

    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Creates a safe Markdown message with escaped user content
 * 
 * @param template - The message template with placeholders
 * @param replacements - Object with values to safely insert
 * @returns Safely formatted Markdown message
 * 
 * @example
 * ```typescript
 * const message = createSafeMarkdownMessage(
 *   "**Name:** {name}\n**Email:** {email}",
 *   { name: userInput.name, email: userInput.email }
 * );
 * ```
 */
export function createSafeMarkdownMessage(
    template: string, 
    replacements: Record<string, string>
): string {
    let message = template;
    
    for (const [key, value] of Object.entries(replacements)) {
        const escapedValue = escapeMarkdown(value || '');
        message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), escapedValue);
    }
    
    return message;
}

/**
 * Formats email addresses for Telegram display with beautiful presentation
 * Uses code formatting to prevent markdown interference while maintaining readability
 * 
 * @param email - The email address to format
 * @returns Beautifully formatted email for Telegram display
 * 
 * @example
 * ```typescript
 * const email = "user@example.com";
 * const formatted = formatEmailForTelegram(email);
 * // Returns: `user@example.com`
 * ```
 */
export function formatEmailForTelegram(email: string): string {
    if (!email || typeof email !== 'string') {
        return '`Not provided`';
    }

    // Use code formatting (backticks) to preserve email readability
    // This prevents markdown interference without ugly escaping
    return `\`${email}\``;
}

/**
 * Light escaping for displaying user content in Markdown
 * Only escapes the most critical characters that break Telegram parsing
 * 
 * @param text - The text to lightly escape
 * @returns Text with minimal safe escaping for display
 */
export function lightEscapeMarkdown(text: string): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // Only escape characters that commonly break Telegram message parsing
    return text
        .replace(/\[/g, '\\[')    // Left square bracket (links)
        .replace(/\]/g, '\\]')    // Right square bracket (links)
        .replace(/`/g, '\\`');    // Backtick (inline code)
}