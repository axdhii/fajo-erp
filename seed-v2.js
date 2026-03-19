const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL environment variable is required.');
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

      -- 2. Clean up previous demo data
      TRUNCATE TABLE hotels CASCADE;

      -- Clear auth users created by seed to avoid duplicates
      DELETE FROM auth.users WHERE email LIKE '%@fajo.local';
      DELETE FROM auth.users WHERE email LIKE '%@fajo';

      -- 3. Insert Hotels
      INSERT INTO hotels (id, name, city, status)
      VALUES ('11111111-1111-1111-1111-111111111111', 'FAJO Rooms Kaloor', 'Kochi', 'ACTIVE');

      INSERT INTO hotels (id, name, city, status)
      VALUES ('22222222-2222-2222-2222-222222222222', 'FAJO Rooms Aluva', 'Kochi', 'MAINTENANCE');

      -- 4. Create individual auth users per staff member (phone-based emails)
      WITH new_users AS (
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '9000000001@fajo.local', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '9000000002@fajo.local', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '9000000003@fajo.local', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '9000000004@fajo.local', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '9000000005@fajo.local', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '9000000006@fajo.local', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '9000000007@fajo.local', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '9000000008@fajo.local', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '9000000009@fajo.local', crypt('fajo123', gen_salt('bf')), now(), now(), now(), '', '', '', '')
        RETURNING id, email
      )
      -- 5. Create staff records linked to auth users
      INSERT INTO staff (user_id, hotel_id, role, is_idle, name, phone, base_salary)
      SELECT
        nu.id as user_id,
        '11111111-1111-1111-1111-111111111111' as hotel_id,
        CASE
          WHEN nu.email = '9000000001@fajo.local' THEN 'Admin'::staff_role
          WHEN nu.email = '9000000002@fajo.local' THEN 'FrontDesk'::staff_role
          WHEN nu.email = '9000000003@fajo.local' THEN 'FrontDesk'::staff_role
          WHEN nu.email = '9000000004@fajo.local' THEN 'Housekeeping'::staff_role
          WHEN nu.email = '9000000005@fajo.local' THEN 'Housekeeping'::staff_role
          WHEN nu.email = '9000000006@fajo.local' THEN 'HR'::staff_role
          WHEN nu.email = '9000000007@fajo.local' THEN 'ZonalManager'::staff_role
          WHEN nu.email = '9000000008@fajo.local' THEN 'ZonalOps'::staff_role
          WHEN nu.email = '9000000009@fajo.local' THEN 'ZonalHK'::staff_role
        END as role,
        true as is_idle,
        NULL as name,
        split_part(nu.email, '@', 1) as phone,
        NULL as base_salary
      FROM new_users nu;

      -- 6. Insert 8 Rooms for FAJO Rooms Kaloor (101 to 108) with individual pricing
      INSERT INTO units (hotel_id, unit_number, type, status, base_price) VALUES
      ('11111111-1111-1111-1111-111111111111', '101', 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 2500.00),
      ('11111111-1111-1111-1111-111111111111', '102', 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 2000.00),
      ('11111111-1111-1111-1111-111111111111', '103', 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 2000.00),
      ('11111111-1111-1111-1111-111111111111', '104', 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 2000.00),
      ('11111111-1111-1111-1111-111111111111', '105', 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 1750.00),
      ('11111111-1111-1111-1111-111111111111', '106', 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 1750.00),
      ('11111111-1111-1111-1111-111111111111', '107', 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 1650.00),
      ('11111111-1111-1111-1111-111111111111', '108', 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 1750.00);

      -- Insert 26 Dorm Beds (A1-A26) with lower/upper pricing
      INSERT INTO units (hotel_id, unit_number, type, status, base_price)
      SELECT '11111111-1111-1111-1111-111111111111', 'A' || i, 'DORM'::unit_type, 'AVAILABLE'::unit_status,
        CASE WHEN i <= 13 THEN 400.00 ELSE 450.00 END
      FROM generate_series(1, 26) i;

      -- Insert 5 rooms for Aluva just for admin testing
      INSERT INTO units (hotel_id, unit_number, type, status, base_price)
      SELECT '22222222-2222-2222-2222-222222222222', '2' || lpad(i::text, 2, '0'), 'ROOM'::unit_type, 'AVAILABLE'::unit_status, 2500.00
      FROM generate_series(1, 5) i;
    `;

        console.log('Executing V2 Seed Script...');
        await client.query(sql);
        console.log('V2 Seed Successful!');
        console.log('Logins: Admin 9000000001/password123, FrontDesk 9000000002/fajo123, FrontDesk 9000000003/fajo123, Housekeeping 9000000004/fajo123, Housekeeping 9000000005/fajo123, HR 9000000006/fajo123, ZonalManager 9000000007/fajo123, ZonalOps 9000000008/fajo123, ZonalHK 9000000009/fajo123');

    } catch (e) {
        console.error('Error seeding v2:', e);
    } finally {
        await client.end();
    }
}

seedV2();
