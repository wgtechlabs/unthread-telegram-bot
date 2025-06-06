-- Unthread Telegram Bot Database Schema - Alpha Phase (Simplified)

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tickets table - Maps individual tickets/conversations between platforms (simplified)
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_message_id BIGINT NOT NULL UNIQUE,
    conversation_id VARCHAR(255) NOT NULL,
    ticket_id VARCHAR(255),
    friendly_id VARCHAR(100) NOT NULL,
    chat_id BIGINT NOT NULL,
    telegram_user_id BIGINT NOT NULL,
    ticket_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User states table - Simplified state tracking
CREATE TABLE IF NOT EXISTS user_states (
    telegram_user_id BIGINT PRIMARY KEY,
    state_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customers table - Simplified customer storage
CREATE TABLE IF NOT EXISTS customers (
    customer_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    chat_id BIGINT,
    customer_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes for fast lookups (simplified)
CREATE INDEX IF NOT EXISTS idx_tickets_telegram_message_id ON tickets(telegram_message_id);
CREATE INDEX IF NOT EXISTS idx_tickets_conversation_id ON tickets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tickets_chat_id ON tickets(chat_id);
CREATE INDEX IF NOT EXISTS idx_customers_chat_id ON customers(chat_id);

-- Function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at timestamps (simplified)
CREATE TRIGGER update_tickets_updated_at 
    BEFORE UPDATE ON tickets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_states_updated_at 
    BEFORE UPDATE ON user_states 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at 
    BEFORE UPDATE ON customers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- BOTS-BRAIN SDK: Storage Cache Table (3-Layer Storage System)
-- ================================================================
-- Optional table for three-layer storage (Memory + Redis + PostgreSQL)
-- This enables the full bots-brain SDK functionality with persistent caching

CREATE TABLE IF NOT EXISTS storage_cache (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient expiration cleanup
CREATE INDEX IF NOT EXISTS idx_storage_cache_expires_at ON storage_cache(expires_at);

-- Trigger for automatic updated_at timestamp (reuses existing function)
CREATE TRIGGER trigger_storage_cache_updated_at
    BEFORE UPDATE ON storage_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM storage_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
