-- Supabase PostgreSQL Setup Schema
-- Run this script in the Supabase SQL Editor to initialize the database tables, triggers, indexes, and RLS policies.

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. UTILITIES TABLE
CREATE TABLE IF NOT EXISTS public.utilities (
  id TEXT PRIMARY KEY, -- normalized case-insensitive value (e.g. "motor")
  name TEXT NOT NULL,  -- display formatting name (e.g. "Motor")
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. VENDORS TABLE
CREATE TABLE IF NOT EXISTS public.vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  vendor_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  contact_person TEXT,
  mobile_number TEXT,
  alternative_mobile_number TEXT,
  email TEXT,
  website TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  pin_code TEXT,
  gstin TEXT,
  pan TEXT,
  business_reg_no TEXT,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  brand TEXT,
  product_status TEXT NOT NULL DEFAULT 'Active',
  utility_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,  -- matches auth.users id but no FK constraint for easier seeding
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Engineer', 'Trainee')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- Unique index on email (partial - allows future null emails)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_partial_key ON public.users(email);

-- 5. INVENTORY TABLE (Equipment / Instruments)
CREATE TABLE IF NOT EXISTS public.inventory (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'available',
  location TEXT NOT NULL DEFAULT 'warehouse',
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  serial TEXT NOT NULL,
  last_calibration_date TIMESTAMP WITH TIME ZONE,
  next_calibration_date TIMESTAMP WITH TIME ZONE,
  calibration_cycle_days INTEGER DEFAULT 365,
  calibration_certificate_url TEXT,
  product_images JSONB,
  product_overview TEXT,
  specifications TEXT,
  parameters_measured TEXT,
  accuracy TEXT,
  measurement_range TEXT,
  resolution TEXT,
  applications TEXT,
  operating_procedure TEXT,
  calibration_procedure TEXT,
  safety_instructions TEXT,
  user_manual_url TEXT,
  youtube_url TEXT,
  booked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  next_available_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. PURCHASE ORDERS TABLE (Bookings)
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  instrument_id TEXT NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  remarks TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied')),
  returned_date TIMESTAMP WITH TIME ZONE,
  returned_by_name TEXT,
  return_remarks TEXT,
  sheet_url TEXT,
  bulk_group_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- INDEXES FOR FASTER PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_products_vendor ON public.products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_user ON public.purchase_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_inst ON public.purchase_orders(instrument_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON public.inventory(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- TRIGGER FOR AUTOMATED AUTH -> PUBLIC USER SYNCHRONIZATION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Normalize role to match CHECK constraint
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'Engineer');
  v_role := CASE 
    WHEN LOWER(v_role) = 'admin' THEN 'Admin'
    WHEN LOWER(v_role) = 'trainee' THEN 'Trainee'
    ELSE 'Engineer'
  END;

  INSERT INTO public.users (id, name, email, phone, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'New User'),
    new.email,
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    v_role
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- TRIGGER TO AUTO-CONFIRM SIGNUPS (Bypasses email confirmation completely)
CREATE OR REPLACE FUNCTION public.handle_confirm_user()
RETURNS TRIGGER AS $$
BEGIN
  new.email_confirmed_at := COALESCE(new.email_confirmed_at, now());
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_confirm ON auth.users;
CREATE TRIGGER on_auth_user_created_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_confirm_user();

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.utilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Security helper to check user role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND LOWER(role) = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Utilities RLS
CREATE POLICY "Select allowed for authenticated" ON public.utilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Write allowed for admins only" ON public.utilities FOR ALL TO authenticated USING (public.is_admin());

-- 2. Vendors RLS
CREATE POLICY "Select allowed for authenticated" ON public.vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Write allowed for admins only" ON public.vendors FOR ALL TO authenticated USING (public.is_admin());

-- 3. Products RLS
CREATE POLICY "Select allowed for authenticated" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Write allowed for admins only" ON public.products FOR ALL TO authenticated USING (public.is_admin());

-- 4. Users RLS
CREATE POLICY "Select allowed for authenticated" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Write allowed for admins only" ON public.users FOR ALL TO authenticated USING (public.is_admin());

-- 5. Inventory RLS
CREATE POLICY "Select allowed for authenticated" ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Write allowed for admins only" ON public.inventory FOR ALL TO authenticated USING (public.is_admin());

-- 6. Purchase Orders RLS
CREATE POLICY "Select allowed for authenticated" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert allowed for authenticated" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update allowed for admins only" ON public.purchase_orders FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Delete allowed for admins only" ON public.purchase_orders FOR DELETE TO authenticated USING (public.is_admin());

-- 7. Audit Logs RLS
CREATE POLICY "Select allowed for authenticated" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert allowed for authenticated" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- PAGINATED, INDEX-FAST SEARCH FUNCTION (RPC)
CREATE OR REPLACE FUNCTION public.search_vendors(
  search_query TEXT,
  utility_filter TEXT,
  vendor_filter TEXT,
  product_filter TEXT,
  page_num INT,
  page_size INT,
  sort_by TEXT,
  sort_order TEXT
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  company_name TEXT,
  vendor_type TEXT,
  status TEXT,
  contact_person TEXT,
  mobile_number TEXT,
  alternative_mobile_number TEXT,
  email TEXT,
  website TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  pin_code TEXT,
  gstin TEXT,
  pan TEXT,
  business_reg_no TEXT,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  product_count INT,
  total_count INT
) AS $$
DECLARE
  offset_val INT;
BEGIN
  offset_val := (page_num - 1) * page_size;
  
  RETURN QUERY
  WITH filtered_vendors AS (
    SELECT DISTINCT v.*
    FROM public.vendors v
    LEFT JOIN public.products p ON p.vendor_id = v.id
    WHERE 
      (vendor_filter = '' OR v.id = vendor_filter) AND
      (utility_filter = '' OR LOWER(p.utility_name) = LOWER(utility_filter)) AND
      (product_filter = '' OR p.id = product_filter OR p.name ILIKE '%' || product_filter || '%') AND
      (search_query = '' OR 
        v.name ILIKE '%' || search_query || '%' OR 
        v.company_name ILIKE '%' || search_query || '%' OR 
        v.contact_person ILIKE '%' || search_query || '%' OR
        p.name ILIKE '%' || search_query || '%' OR
        p.category ILIKE '%' || search_query || '%' OR
        p.utility_name ILIKE '%' || search_query || '%'
      )
  ),
  total_cnt AS (
    SELECT COUNT(*)::INT AS cnt FROM filtered_vendors
  )
  SELECT 
    fv.id, fv.name, fv.company_name, fv.vendor_type, fv.status, fv.contact_person,
    fv.mobile_number, fv.alternative_mobile_number, fv.email, fv.website,
    fv.street_address, fv.city, fv.state, fv.country, fv.pin_code, fv.gstin, fv.pan,
    fv.business_reg_no, fv.remarks, fv.created_at,
    (SELECT COUNT(*)::INT FROM public.products pr WHERE pr.vendor_id = fv.id) AS product_count,
    tc.cnt AS total_count
  FROM filtered_vendors fv
  CROSS JOIN total_cnt tc
  ORDER BY 
    CASE WHEN sort_by = 'name' AND sort_order = 'asc' THEN fv.name END ASC,
    CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN fv.name END DESC,
    CASE WHEN sort_by = 'company_name' AND sort_order = 'asc' THEN fv.company_name END ASC,
    CASE WHEN sort_by = 'company_name' AND sort_order = 'desc' THEN fv.company_name END DESC
  LIMIT page_size
  OFFSET offset_val;
END;
$$ LANGUAGE plpgsql;
