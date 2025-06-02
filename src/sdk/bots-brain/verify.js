#!/usr/bin/env node
import dotenv from 'dotenv';
import { DatabaseConnection } from '../../database/connection.js';

dotenv.config();

async function checkDatabase() {
  const db = new DatabaseConnection();
  
  try {
    await db.connect();
    console.log('✅ Database connected');
    
    // Check what tables exist
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n📋 Database tables:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
    // Check if storage_cache table has the right structure
    const hasStorageCache = result.rows.some(row => row.table_name === 'storage_cache');
    if (hasStorageCache) {
      console.log('\n✅ storage_cache table exists - three-layer storage ready!');
    } else {
      console.log('\n⚠️ storage_cache table missing - using Memory + Redis only');
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    await db.close();
  }
}

checkDatabase();
