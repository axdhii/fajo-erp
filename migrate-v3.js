const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required.');
    console.error('   Set it: export DATABASE_URL="postgresql://postgres:PASSWORD@db.XXXXX.supabase.co:5432/postgres"');
    process.exit(1);
}

async function run() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    try {
        console.log('🔌 Connecting...');
        await client.connect();
        console.log('✅ Connected!\n');

        // Add MAINTENANCE to unit_status enum
        console.log('📋 Adding MAINTENANCE to unit_status enum...');
        await client.query(`ALTER TYPE unit_status ADD VALUE IF NOT EXISTS 'MAINTENANCE'`);
        console.log('✅ MAINTENANCE status added!\n');

        // Add maintenance_reason column
        console.log('📋 Adding maintenance_reason column to units...');
        await client.query(`ALTER TABLE units ADD COLUMN IF NOT EXISTS maintenance_reason TEXT`);
        console.log('✅ maintenance_reason column added!\n');

        // Add aadhar_url column to guests
        console.log('📋 Adding aadhar_url column to guests...');
        await client.query(`ALTER TABLE guests ADD COLUMN IF NOT EXISTS aadhar_url TEXT`);
        console.log('✅ aadhar_url column added!\n');

        console.log('🎉 Migration complete!');
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

run();
