const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pxpkwnyylynhqkbnpstc.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cGt3bnl5bHluaHFrYm5wc3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTQ2MDksImV4cCI6MjA4ODMzMDYwOX0.pl4y6mLZsbE-V4zlPS3mmL7IeZuT1Xoz59Z20BqR9BU';

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
