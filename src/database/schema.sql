-- Unthread Telegram Bot Database Schema
-- Phase 1: Database Foundation

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customers table - Maps Telegram groups to Unthread customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unthread_customer_id VARCHAR(255) NOT NULL UNIQUE,
    telegram_chat_id BIGINT NOT NULL,
    chat_title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tickets table - Maps individual tickets/conversations between platforms
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unthread_ticket_id VARCHAR(255) NOT NULL UNIQUE,
    unthread_conversation_id VARCHAR(255) NOT NULL UNIQUE,
    friendly_id VARCHAR(100) NOT NULL,
    telegram_message_id BIGINT NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    telegram_user_id BIGINT NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User states table - Tracks ongoing ticket creation conversations
CREATE TABLE IF NOT EXISTS user_states (
    telegram_user_id BIGINT PRIMARY KEY,
    current_field VARCHAR(50) NOT NULL,
    ticket_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_customers_telegram_chat_id ON customers(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_customers_unthread_customer_id ON customers(unthread_customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_telegram_message_id ON tickets(telegram_message_id);
CREATE INDEX IF NOT EXISTS idx_tickets_unthread_conversation_id ON tickets(unthread_conversation_id);
CREATE INDEX IF NOT EXISTS idx_tickets_telegram_chat_id ON tickets(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_chat_message ON tickets(telegram_chat_id, telegram_message_id);
CREATE INDEX IF NOT EXISTS idx_user_states_created_at ON user_states(created_at);

-- Function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at timestamps
CREATE TRIGGER update_customers_updated_at 
    BEFORE UPDATE ON customers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at 
    BEFORE UPDATE ON tickets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_states_updated_at 
    BEFORE UPDATE ON user_states 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
