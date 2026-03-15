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

        // Run RLS lockdown SQL
        console.log('🔒 Applying RLS lockdown policies...');
        const sqlPath = path.join(__dirname, 'lib', 'supabase', 'rls-lockdown.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        await client.query(sql);
        console.log('✅ RLS policies applied successfully!\n');

        // Verify: list policies per table
        console.log('📊 Verification — current policies:');
        const result = await client.query(`
            SELECT tablename, policyname, cmd, roles
            FROM pg_policies
            WHERE schemaname = 'public'
            ORDER BY tablename, cmd
        `);

        let currentTable = '';
        for (const row of result.rows) {
            if (row.tablename !== currentTable) {
                currentTable = row.tablename;
                console.log(`\n   ${currentTable}:`);
            }
            console.log(`     ${row.cmd.padEnd(8)} → ${row.policyname} (${row.roles})`);
        }

        // Check storage
        console.log('\n\n📦 Storage bucket status:');
        const buckets = await client.query(
            `SELECT id, public FROM storage.buckets WHERE id = 'aadhars'`
        );
        if (buckets.rows.length > 0) {
            const b = buckets.rows[0];
            console.log(`   aadhars: public=${b.public} ${b.public ? '⚠️  STILL PUBLIC' : '✅ PRIVATE'}`);
        } else {
            console.log('   aadhars bucket not found (will be created on first upload)');
        }

        // Check storage policies
        const storagePolicies = await client.query(`
            SELECT policyname, cmd, roles
            FROM pg_policies
            WHERE schemaname = 'storage' AND tablename = 'objects'
              AND policyname LIKE 'aadhars%'
            ORDER BY cmd
        `);
        if (storagePolicies.rows.length > 0) {
            console.log('   Storage policies:');
            for (const row of storagePolicies.rows) {
                console.log(`     ${row.cmd.padEnd(8)} → ${row.policyname} (${row.roles})`);
            }
        }

        console.log('\n🎉 RLS lockdown complete!');

    } catch (err) {
        console.error('❌ Error:', err.message);
        if (err.message.includes('connection')) {
            console.error('\n💡 If connection fails, try using the pooler connection string from Supabase Dashboard > Settings > Database.');
        }
        process.exit(1);
    } finally {
        await client.end();
    }
}

run();
