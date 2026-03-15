const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetch() {
    console.log('Fetching staff...');
    const { data, error } = await supabase
        .from('staff')
        .select('id, user_id, role, hotel_id')
        .eq('role', 'Housekeeping');

    console.log('Data:', data);
    console.log('Error:', error);
}

testFetch();
