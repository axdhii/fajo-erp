const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://pxpkwnyylynhqkbnpstc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cGt3bnl5bHluaHFrYm5wc3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTQ2MDksImV4cCI6MjA4ODMzMDYwOX0.pl4y6mLZsbE-V4zlPS3mmL7IeZuT1Xoz59Z20BqR9BU';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    // We need to use the admin API to delete auth users
    // But since we can't do that with anon key, let's just use the API route approach
    // For now, we'll create an API endpoint to handle this
    console.log('This needs to be run via the authenticated API endpoint.');
    console.log('Use: POST /api/cleanup-hk');
}

run();
