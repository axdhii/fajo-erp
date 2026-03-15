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

        // Create the aadhars storage bucket
        console.log('📦 Creating "aadhars" storage bucket...');
        await client.query(`
            INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
            VALUES ('aadhars', 'aadhars', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
            ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
        `);
        console.log('✅ Bucket created!\n');

        // Allow authenticated users to upload
        console.log('🔐 Setting RLS policies...');

        // Drop existing policies if any
        await client.query(`
            DO $$ BEGIN
                DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
                DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
                DROP POLICY IF EXISTS "Allow authenticated delete" ON storage.objects;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;
        `);

        // Policy: authenticated users can upload to aadhars bucket
        await client.query(`
            CREATE POLICY "Allow authenticated uploads"
            ON storage.objects FOR INSERT
            TO authenticated
            WITH CHECK (bucket_id = 'aadhars');
        `);
        console.log('   ✅ Upload policy set');

        // Policy: public can read (for displaying photos)
        await client.query(`
            CREATE POLICY "Allow public read"
            ON storage.objects FOR SELECT
            TO public
            USING (bucket_id = 'aadhars');
        `);
        console.log('   ✅ Read policy set');

        // Policy: authenticated users can delete/update their uploads
        await client.query(`
            CREATE POLICY "Allow authenticated delete"
            ON storage.objects FOR DELETE
            TO authenticated
            USING (bucket_id = 'aadhars');
        `);
        console.log('   ✅ Delete policy set');

        console.log('\n🎉 Storage bucket ready! Aadhar uploads should work now.');
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

run();
