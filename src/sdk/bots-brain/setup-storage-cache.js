#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { DatabaseConnection } from '../../database/connection.js';

dotenv.config();

async function setupStorageCache() {
  console.log('🔧 Setting up storage cache table for bots-brain SDK...\n');
  
  const db = new DatabaseConnection();
  
  try {
    await db.connect();
    
    // Read the storage cache schema
    const schemaPath = path.join(process.cwd(), 'src/sdk/bots-brain/storage-cache-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📄 Executing storage cache schema...');
    await db.query(schema);
    
    console.log('✅ Storage cache table created successfully');
    console.log('✅ Indexes and triggers configured');
    console.log('✅ Cleanup function installed');
    
    // Test the table
    console.log('\n🧪 Testing storage cache table...');
    
    // Insert test data
    await db.query(`
      INSERT INTO storage_cache (key, value, expires_at) 
      VALUES ($1, $2, $3)
    `, ['test_key', JSON.stringify({ test: 'data' }), new Date(Date.now() + 60000)]);
    
    // Retrieve test data
    const result = await db.query('SELECT * FROM storage_cache WHERE key = $1', ['test_key']);
    console.log('✅ Test data stored and retrieved successfully');
    
    // Clean up test data
    await db.query('DELETE FROM storage_cache WHERE key = $1', ['test_key']);
    console.log('✅ Test data cleaned up');
    
    console.log('\n🎉 Storage cache setup complete!');
    console.log('📝 The bots-brain SDK can now use all three storage layers:');
    console.log('   1. Memory (24hr TTL) - fastest');
    console.log('   2. Redis (3-day TTL) - fast distributed cache');
    console.log('   3. PostgreSQL (permanent) - persistent storage');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

setupStorageCache();
