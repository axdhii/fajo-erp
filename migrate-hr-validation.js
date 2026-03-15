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

        // 1. Create validation_status enum
        console.log('📋 Creating validation_status enum...');
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE validation_status AS ENUM ('PENDING_REVIEW','APPROVED','LATE');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);
        console.log('✅ Enum ready');

        // 2. Add columns to attendance
        console.log('📋 Adding validation columns to attendance...');
        await client.query(`
            ALTER TABLE attendance ADD COLUMN IF NOT EXISTS validation_status validation_status NOT NULL DEFAULT 'PENDING_REVIEW';
            ALTER TABLE attendance ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES staff(id);
            ALTER TABLE attendance ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
        `);
        console.log('✅ Columns added');

        // 3. Index
        console.log('📋 Creating index...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_attendance_validation ON attendance(validation_status);
        `);
        console.log('✅ Index created');

        // 4. Set existing records to APPROVED so HR doesn't see a backlog
        const result = await client.query(`
            UPDATE attendance SET validation_status = 'APPROVED' WHERE validation_status = 'PENDING_REVIEW';
        `);
        console.log(`✅ Set ${result.rowCount} existing records to APPROVED`);

        console.log('\n🎉 HR validation migration complete!');
    } catch (err) {
        console.error('❌ Error:', err.message);
        if (err.detail) console.error('   Detail:', err.detail);
    } finally {
        await client.end();
    }
}

run();
