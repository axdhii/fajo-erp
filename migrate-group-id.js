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

        console.log('📋 Adding group_id column to bookings...');
        await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_id UUID`);
        console.log('✅ group_id column added!\n');

        console.log('📋 Creating index on group_id...');
        await client.query(`CREATE INDEX IF NOT EXISTS idx_bookings_group ON bookings(group_id)`);
        console.log('✅ Index created!\n');

        console.log('🎉 Migration complete!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
