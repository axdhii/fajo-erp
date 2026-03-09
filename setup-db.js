const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = 'postgresql://postgres:aadhilishaan1234@db.pxpkwnyylynhqkbnpstc.supabase.co:5432/postgres';

async function run() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    try {
        console.log('🔌 Connecting to Supabase PostgreSQL...');
        await client.connect();
        console.log('✅ Connected!\n');

        // Step 1: Run schema-v2.sql
        console.log('📋 Running schema-v2.sql...');
        const schemaPath = path.join(__dirname, 'lib', 'supabase', 'schema-v2.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
        await client.query(schemaSql);
        console.log('✅ Schema created successfully!\n');

        // Step 2: Get hotel_id from hotels table
        console.log('🏨 Looking up hotel_id...');
        const hotelsResult = await client.query('SELECT id, name FROM hotels LIMIT 5');

        if (hotelsResult.rows.length === 0) {
            console.log('⚠️  No hotels found. Creating "Fajo Rooms, Kochi"...');
            const insertResult = await client.query(
                `INSERT INTO hotels (name, city) VALUES ('Fajo Rooms', 'Kochi') RETURNING id, name`
            );
            var hotelId = insertResult.rows[0].id;
            console.log(`✅ Created hotel: ${insertResult.rows[0].name} (${hotelId})\n`);
        } else {
            var hotelId = hotelsResult.rows[0].id;
            console.log(`✅ Found hotel: ${hotelsResult.rows[0].name} (${hotelId})\n`);
        }

        // Step 3: Check if units already exist
        const existingUnits = await client.query(
            'SELECT COUNT(*) as count FROM units WHERE hotel_id = $1',
            [hotelId]
        );

        if (parseInt(existingUnits.rows[0].count) > 0) {
            console.log(`⚠️  ${existingUnits.rows[0].count} units already exist for this hotel. Skipping seed.`);
        } else {
            // Step 4: Seed rooms 101-108
            console.log('🛏️  Seeding Private Rooms (101-108)...');
            const roomPrices = {
                '101': 1600, '102': 1600, '103': 1800, '104': 1800,
                '105': 2000, '106': 2000, '107': 2500, '108': 2500,
            };

            for (const [num, price] of Object.entries(roomPrices)) {
                await client.query(
                    `INSERT INTO units (hotel_id, unit_number, type, base_price) VALUES ($1, $2, 'ROOM', $3)`,
                    [hotelId, num, price]
                );
            }
            console.log('✅ 8 rooms seeded!\n');

            // Step 5: Seed dorm beds D01-D36
            console.log('🛏️  Seeding Dorm Beds (D01-D36)...');
            for (let i = 1; i <= 36; i++) {
                const bedNum = 'D' + String(i).padStart(2, '0');
                await client.query(
                    `INSERT INTO units (hotel_id, unit_number, type, base_price) VALUES ($1, $2, 'DORM', $3)`,
                    [hotelId, bedNum, 400]
                );
            }
            console.log('✅ 36 dorm beds seeded!\n');
        }

        // Step 6: Verify
        console.log('📊 Verification:');
        const roomCount = await client.query(
            `SELECT type, COUNT(*) as count, MIN(base_price) as min_price, MAX(base_price) as max_price FROM units WHERE hotel_id = $1 GROUP BY type ORDER BY type`,
            [hotelId]
        );

        for (const row of roomCount.rows) {
            console.log(`   ${row.type}: ${row.count} units (₹${row.min_price} - ₹${row.max_price})`);
        }

        console.log('\n🎉 All done! Database is ready.');
        console.log(`   Hotel ID: ${hotelId}`);

    } catch (err) {
        console.error('❌ Error:', err.message);
        if (err.message.includes('connection')) {
            console.error('\n💡 If connection fails, try using the pooler connection string from Supabase Dashboard > Settings > Database.');
        }
    } finally {
        await client.end();
    }
}

run();
