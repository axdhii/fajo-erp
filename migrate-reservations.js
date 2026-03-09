const { Client } = require('pg');

const DATABASE_URL = 'postgresql://postgres:aadhilishaan1234@db.pxpkwnyylynhqkbnpstc.supabase.co:5432/postgres';

async function run() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    try {
        console.log('🔌 Connecting...');
        await client.connect();
        console.log('✅ Connected!\n');

        // Step 1: Add new enum values to booking_status
        console.log('📋 Adding PENDING to booking_status...');
        await client.query(`ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'PENDING'`);
        console.log('   ✅ PENDING added');

        console.log('📋 Adding CONFIRMED to booking_status...');
        await client.query(`ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'CONFIRMED'`);
        console.log('   ✅ CONFIRMED added');

        console.log('📋 Adding CHECKED_IN to booking_status...');
        await client.query(`ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'CHECKED_IN'`);
        console.log('   ✅ CHECKED_IN added\n');

        // Step 2: Add reservation columns to bookings
        console.log('📋 Adding reservation columns...');

        await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS expected_arrival TIMESTAMPTZ`);
        console.log('   ✅ expected_arrival column added');

        await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(10,2) DEFAULT 0`);
        console.log('   ✅ advance_amount column added');

        await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_type TEXT`);
        console.log('   ✅ advance_type column added');

        // Step 3: Migrate existing ACTIVE bookings to CHECKED_IN
        console.log('\n📋 Migrating existing ACTIVE bookings to CHECKED_IN...');
        const result = await client.query(`
            UPDATE bookings SET status = 'CHECKED_IN' WHERE status = 'ACTIVE'
        `);
        console.log(`   ✅ ${result.rowCount} bookings migrated from ACTIVE → CHECKED_IN`);

        // Step 4: Add an index for reservation date range queries
        console.log('\n📋 Adding date range index...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(check_in, check_out)
        `);
        console.log('   ✅ Date range index added');

        // Step 5: Verify
        console.log('\n📊 Verification:');
        const statusCheck = await client.query(`
            SELECT status, COUNT(*) as count FROM bookings GROUP BY status
        `);
        for (const row of statusCheck.rows) {
            console.log(`   ${row.status}: ${row.count} bookings`);
        }

        // Check columns
        const cols = await client.query(`
            SELECT column_name, data_type FROM information_schema.columns 
            WHERE table_name = 'bookings' AND column_name IN ('expected_arrival', 'advance_amount', 'advance_type')
        `);
        console.log('\n   New columns:');
        for (const col of cols.rows) {
            console.log(`   ✅ ${col.column_name} (${col.data_type})`);
        }

        console.log('\n🎉 Migration complete!');
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

run();
