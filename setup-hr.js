const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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
        console.log('🔌 Connecting to Supabase PostgreSQL...');
        await client.connect();
        console.log('✅ Connected!\n');

        // Run hr-schema.sql
        console.log('📋 Running hr-schema.sql...');
        const schemaPath = path.join(__dirname, 'lib', 'supabase', 'hr-schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
        await client.query(schemaSql);
        console.log('✅ HR schema applied successfully!\n');

        // Verify tables exist
        console.log('📊 Verification:');
        const tables = ['attendance', 'staff_incidents', 'payroll'];
        for (const table of tables) {
            const result = await client.query(
                `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = $1`,
                [table]
            );
            const exists = parseInt(result.rows[0].count) > 0;
            console.log(`   ${exists ? '✅' : '❌'} ${table}`);
        }

        // Verify staff columns
        const staffCols = await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'staff' AND column_name IN ('name', 'phone', 'base_salary')`
        );
        console.log(`   ✅ staff columns added: ${staffCols.rows.map(r => r.column_name).join(', ')}`);

        console.log('\n🎉 HR module database setup complete!');
    } catch (err) {
        console.error('❌ Error:', err.message);
        if (err.detail) console.error('   Detail:', err.detail);
    } finally {
        await client.end();
    }
}

run();
