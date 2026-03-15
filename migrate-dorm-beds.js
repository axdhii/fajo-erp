const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables are required.');
    process.exit(1);
}

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
