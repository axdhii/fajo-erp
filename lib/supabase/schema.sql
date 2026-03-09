-- Create Enum Types
CREATE TYPE room_status AS ENUM ('Available', 'Occupied', 'Cleaning');
CREATE TYPE staff_role AS ENUM ('FrontDesk', 'Housekeeping', 'Admin');

-- Create Hotels Table
CREATE TABLE hotels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Rooms Table
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
    room_number TEXT NOT NULL,
    status room_status DEFAULT 'Available',
    current_staff_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(hotel_id, room_number)
);

-- Create Bookings Table
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    aadhar_url TEXT,
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    check_out_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Staff Table
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
    role staff_role NOT NULL,
    is_idle BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key from rooms to staff now that staff table exists
ALTER TABLE rooms ADD CONSTRAINT fk_rooms_current_staff 
FOREIGN KEY (current_staff_id) REFERENCES staff(id) ON DELETE SET NULL;

-- Setup Row Level Security (RLS) policies
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- For demo purposes: Allow all authenticated users full access
CREATE POLICY "Allow all authenticated users full access to hotels" ON hotels FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all authenticated users full access to rooms" ON rooms FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all authenticated users full access to bookings" ON bookings FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all authenticated users full access to staff" ON staff FOR ALL TO authenticated USING (true);
