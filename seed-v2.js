const { Client } = require('pg');

const connectionString = 'postgresql://postgres:aadhilishaan1234@db.pxpkwnyylynhqkbnpstc.supabase.co:5432/postgres';

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
      DELETE FROM auth.users WHERE email LIKE '%@fajo.com';

      -- 3. Insert specific Hotel "FAJO Rooms Kochi"
      INSERT INTO hotels (id, name, city) 
      VALUES ('11111111-1111-1111-1111-111111111111', 'FAJO Rooms Kochi', 'Kochi');

      -- Also add a second hotel for Admin dashboard demo
      INSERT INTO hotels (id, name, city) 
      VALUES ('22222222-2222-2222-2222-222222222222', 'FAJO Munnar Resort', 'Munnar');

      -- 4. Create Auth Users (Passwords: password123)
      -- Using a CTE to insert users and then staff records
      WITH new_users AS (
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
          created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES 
        -- Admin
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'admin@fajo.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        -- Front Desk
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'frontdesk@fajo.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        -- 5 Housekeepers
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'hk1@fajo.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'hk2@fajo.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'hk3@fajo.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'hk4@fajo.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'hk5@fajo.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', '')
        RETURNING id, email
      )
      -- 5. Map Auth Users to the "staff" table
      INSERT INTO staff (user_id, hotel_id, role, is_idle)
      SELECT 
        nu.id as user_id,
        '11111111-1111-1111-1111-111111111111' as hotel_id,
        CASE 
          WHEN nu.email LIKE 'admin%' THEN 'Admin'::staff_role
          WHEN nu.email LIKE 'frontdesk%' THEN 'FrontDesk'::staff_role
          ELSE 'Housekeeping'::staff_role
        END as role,
        true as is_idle
      FROM new_users nu;

      -- 6. Insert 10 Rooms for FAJO Rooms Kochi (101 to 110)
      INSERT INTO rooms (hotel_id, room_number, status)
      SELECT '11111111-1111-1111-1111-111111111111', '1' || lpad(i::text, 2, '0'), 'Available'::room_status
      FROM generate_series(1, 10) i;

      -- Insert 5 rooms for Munnar just for admin testing
      INSERT INTO rooms (hotel_id, room_number, status)
      SELECT '22222222-2222-2222-2222-222222222222', '2' || lpad(i::text, 2, '0'), 'Available'::room_status
      FROM generate_series(1, 5) i;
    `;

        console.log('Executing V2 Seed Script...');
        await client.query(sql);
        console.log('V2 Seed Successful! Users created (password: password123)');

    } catch (e) {
        console.error('Error seeding v2:', e);
    } finally {
        await client.end();
    }
}

seedV2();
