import pkg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

console.log('🔄 Verifying database schema...');

try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL!');
    
    // Check tables exist
    const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('customers', 'tickets', 'user_states')
        ORDER BY table_name
    `);
    
    console.log('✅ Found tables:', result.rows.map(row => row.table_name));
    
    // Check table structure for customers
    const customersSchema = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'customers'
        ORDER BY ordinal_position
    `);
    
    console.log('✅ Customers table structure:');
    customersSchema.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    client.release();
    await pool.end();
    console.log('🎉 Database Phase 1 setup completed successfully!');
    
} catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
}
