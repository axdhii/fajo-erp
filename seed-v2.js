const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is required.');
    console.error('   Set it: export DATABASE_URL="postgresql://postgres:PASSWORD@db.XXXXX.supabase.co:5432/postgres"');
    process.exit(1);
}

async function seedV2() {
    const client = new Client({ connectionString });

    try {
        await client.connect();
        console.log('Connected to DB...');

        const sql = `
      -- 1. Enable pgcrypto for password hashing
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      -- 2. Clean up previous demo data (Optional: drop cascade to start fresh)
      TRUNCATE TABLE hotels CASCADE;

      -- Clear auth users created by seed to avoid duplicates
      DELETE FROM auth.users WHERE email LIKE '%@fajo%';

      -- 3. Insert specific Hotel "FAJO Rooms Kochi"
      INSERT INTO hotels (id, name, city)
      VALUES ('11111111-1111-1111-1111-111111111111', 'FAJO Rooms Kochi', 'Kochi');

      -- Also add a second hotel for Admin dashboard demo
      INSERT INTO hotels (id, name, city, status)
      VALUES ('22222222-2222-2222-2222-222222222222', 'FAJO Rooms Aluva', 'Kochi', 'MAINTENANCE');

      -- Set Kaloor hotel status to ACTIVE
      UPDATE hotels SET status = 'ACTIVE' WHERE id = '11111111-1111-1111-1111-111111111111';

      -- 4. Create Auth Users (role-based shared logins)
      WITH new_users AS (
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES
        -- Admin (unchanged)
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'admin@fajo', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        -- Front Desk shared login
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'frontdesk@fajo', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        -- Housekeeping shared login
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'hk@fajo', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        -- HR shared login
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'hr@fajo', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        -- Zonal Manager login
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'zonal@fajo', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        -- Zonal Ops login
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'zonalops@fajo', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        -- Zonal HK login
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'zonalhk@fajo', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', '')
        RETURNING id, email
      )
      -- 5. Create operator staff records (linked to auth users, no name/salary)
      INSERT INTO staff (user_id, hotel_id, role, is_idle, name)
      SELECT
        nu.id as user_id,
        '11111111-1111-1111-1111-111111111111' as hotel_id,
        CASE
          WHEN nu.email LIKE 'admin%' THEN 'Admin'::staff_role
          WHEN nu.email LIKE 'frontdesk%' THEN 'FrontDesk'::staff_role
          WHEN nu.email LIKE 'hr%' THEN 'HR'::staff_role
          WHEN nu.email LIKE 'zonalops%' THEN 'ZonalOps'::staff_role
          WHEN nu.email LIKE 'zonalhk%' THEN 'ZonalHK'::staff_role
          WHEN nu.email LIKE 'zonal%' THEN 'ZonalManager'::staff_role
          ELSE 'Housekeeping'::staff_role
        END as role,
        true as is_idle,
        CASE
          WHEN nu.email = 'zonal@fajo' THEN 'Faisal'
          ELSE NULL
        END as name
      FROM new_users nu;

      -- 6. Create trackable staff records (no auth login, for attendance/payroll)
      INSERT INTO staff (user_id, hotel_id, role, is_idle, name, phone, base_salary) VALUES
        (NULL, '11111111-1111-1111-1111-111111111111', 'FrontDesk', true, 'Aadhil', '9876543210', 15000),
        (NULL, '11111111-1111-1111-1111-111111111111', 'FrontDesk', true, 'Riyas', '9876543211', 15000),
        (NULL, '11111111-1111-1111-1111-111111111111', 'Housekeeping', true, 'Suresh', '9876543212', 12000),
        (NULL, '11111111-1111-1111-1111-111111111111', 'HR', true, 'Priya', '9876543213', 18000);

      -- 7. Insert 8 Rooms for FAJO Rooms Kochi (101 to 108)
      INSERT INTO units (hotel_id, unit_number, type, status, base_price)
      SELECT '11111111-1111-1111-1111-111111111111', '1' || lpad(i::text, 2, '0'), 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 2000.00
      FROM generate_series(1, 8) i;

      -- Insert 36 Dorm Beds (A1-A36) with lower/upper pricing
      INSERT INTO units (hotel_id, unit_number, type, status, base_price)
      SELECT '11111111-1111-1111-1111-111111111111', 'A' || i, 'DORM'::unit_type, 'AVAILABLE'::unit_status,
        CASE WHEN i <= 13 THEN 400.00 ELSE 450.00 END
      FROM generate_series(1, 36) i;

      -- Insert 5 rooms for Munnar just for admin testing
      INSERT INTO units (hotel_id, unit_number, type, status, base_price)
      SELECT '22222222-2222-2222-2222-222222222222', '2' || lpad(i::text, 2, '0'), 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 2500.00
      FROM generate_series(1, 5) i;
    `;

        console.log('Executing V2 Seed Script...');
        await client.query(sql);
        console.log('V2 Seed Successful! Logins: admin@fajo/password123, frontdesk@fajo/fajo123, hk@fajo/fajo123, hr@fajo/fajo123, zonal@fajo/fajo123, zonalops@fajo/fajo123, zonalhk@fajo/fajo123');

    } catch (e) {
        console.error('Error seeding v2:', e);
    } finally {
        await client.end();
    }
}

seedV2();
