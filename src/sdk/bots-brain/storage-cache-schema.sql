-- Storage cache table for bots-brain SDK
-- Optional table for three-layer storage (Memory + Redis + PostgreSQL)
-- This extends the existing schema with a general-purpose key-value cache

CREATE TABLE IF NOT EXISTS storage_cache (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient expiration cleanup
CREATE INDEX IF NOT EXISTS idx_storage_cache_expires_at ON storage_cache(expires_at);

-- Trigger for automatic updated_at timestamp
CREATE OR REPLACE FUNCTION update_storage_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_storage_cache_updated_at
    BEFORE UPDATE ON storage_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_storage_cache_updated_at();

-- Cleanup function for expired entries (can be run via cron or manually)
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
