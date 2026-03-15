-- Operations Manager Schema: Restock Requests + Maintenance Tickets

-- Restock Requests
CREATE TABLE IF NOT EXISTS restock_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES units(id),
  hotel_id UUID NOT NULL REFERENCES hotels(id),
  items TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE')),
  requested_by UUID REFERENCES staff(id),
  completed_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Maintenance Tickets
CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES units(id),
  hotel_id UUID NOT NULL REFERENCES hotels(id),
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  reported_by UUID REFERENCES staff(id),
  resolved_by UUID REFERENCES staff(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE restock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY restock_select ON restock_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY restock_insert ON restock_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY restock_update ON restock_requests FOR UPDATE TO authenticated USING (true);

CREATE POLICY maint_select ON maintenance_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY maint_insert ON maintenance_tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY maint_update ON maintenance_tickets FOR UPDATE TO authenticated USING (true);
