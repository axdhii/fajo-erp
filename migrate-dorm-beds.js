const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://pxpkwnyylynhqkbnpstc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4cGt3bnl5bHluaHFrYm5wc3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTQ2MDksImV4cCI6MjA4ODMzMDYwOX0.pl4y6mLZsbE-V4zlPS3mmL7IeZuT1Xoz59Z20BqR9BU';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log('📋 Fetching dorm beds...');

    const { data: dorms, error } = await supabase
        .from('units')
        .select('*')
        .eq('type', 'DORM')
        .order('unit_number', { ascending: true });

    if (error) {
        console.error('❌ Fetch error:', error.message);
        return;
    }

    console.log(`   Found ${dorms.length} dorm beds\n`);

    for (const bed of dorms) {
        // Extract number from old name (D01 → 1, D10 → 10)
        const match = bed.unit_number.match(/D?(\d+)/);
        if (!match) {
            console.log(`   ⚠️ Skipping ${bed.unit_number} — unrecognized format`);
            continue;
        }

        const num = parseInt(match[1]);
        const newName = 'A' + num;
        const newPrice = num <= 13 ? 400 : 450;
        const bedType = num <= 13 ? 'Lower' : 'Upper';

        if (bed.unit_number === newName && Number(bed.base_price) === newPrice) {
            console.log(`   ✓ ${newName} already correct (${bedType} Bed, ₹${newPrice})`);
            continue;
        }

        const { error: updateError } = await supabase
            .from('units')
            .update({ unit_number: newName, base_price: newPrice })
            .eq('id', bed.id);

        if (updateError) {
            console.error(`   ❌ Failed to update ${bed.unit_number}:`, updateError.message);
        } else {
            console.log(`   ✅ ${bed.unit_number} → ${newName} (${bedType} Bed, ₹${newPrice})`);
        }
    }

    // Verify
    console.log('\n📊 Verification:');
    const { data: verify } = await supabase
        .from('units')
        .select('unit_number, base_price')
        .eq('type', 'DORM')
        .order('unit_number', { ascending: true });

    for (const bed of (verify || [])) {
        const num = parseInt(bed.unit_number.substring(1));
        const bedType = num <= 13 ? 'Lower' : 'Upper';
        console.log(`   ${bed.unit_number} — ${bedType} Bed — ₹${bed.base_price}`);
    }

    console.log('\n🎉 Done!');
}

run();
