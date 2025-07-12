/**
 * Unthread Telegram Bot - Bots Brain SDK Main Exports
 *
 * The Bots Brain SDK provides a multi-layer storage architecture specifically
 * designed for Telegram bots and conversational AI applications. This SDK
 * enables efficient state management and data persistence across bot conversations.
 *
 * Architecture Layers:
 * - Layer 1: Memory Cache (24hr TTL) - Ultra-fast in-memory storage
 * - Layer 2: Redis Cache (3-day TTL) - Distributed caching for scalability
 * - Layer 3: PostgreSQL (Permanent) - Persistent storage for critical data
 *
 * Key Components:
 * - UnifiedStorage: Low-level multi-layer storage engine
 * - BotsStore: High-level bot-specific operations and data management
 *
 * Use Cases:
 * - Conversation state persistence across bot restarts
 * - User preference and profile storage
 * - Support ticket data and conversation history * - Form data collection and multi-step workflows
 *
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */
// Multi-layer storage architecture for bots (Memory + Redis + PostgreSQL)

export { UnifiedStorage } from './UnifiedStorage.js';
export { BotsStore } from './BotsStore.js';
