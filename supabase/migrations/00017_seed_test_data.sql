-- ============================================================
-- 00017_seed_test_data.sql
-- Seed realistic test data for local dev UX testing.
-- Safe to re-run: auth.users and public.users use ON CONFLICT DO NOTHING.
-- KPIs, reviews, appraisals: plain INSERT (tables start empty after db reset).
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- SECTION 1: AUTH USERS
-- ──────────────────────────────────────────────────────────
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  ('00000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'admin@test.com',    crypt('admin123',    gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','',''),
  ('00000001-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'hrbp@test.com',     crypt('hrbp123',     gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','',''),
  ('00000001-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'manager@test.com',  crypt('manager123',  gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','',''),
  ('00000001-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'frank@test.com',    crypt('frank123',    gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','',''),
  ('00000001-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'employee@test.com', crypt('employee123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','',''),
  ('00000001-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'dave@test.com',     crypt('dave123',     gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','',''),
  ('00000001-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'eve@test.com',      crypt('eve123',      gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','',''),
  ('00000001-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'grace@test.com',    crypt('grace123',    gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','',''),
  ('00000001-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'henry@test.com',    crypt('henry123',    gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','',''),
  ('00000001-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'irene@test.com',    crypt('irene123',    gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{}', now(), now(), '','','','')
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- SECTION 2: PUBLIC USERS
-- Managers inserted before employees (FK manager_id self-reference).
-- ──────────────────────────────────────────────────────────
INSERT INTO public.users (id, email, full_name, role, department, designation, variable_pay) VALUES
  ('00000001-0000-0000-0000-000000000001', 'admin@test.com',   'Admin User',  'admin',   'Administration',   'System Admin',          0),
  ('00000001-0000-0000-0000-000000000002', 'hrbp@test.com',    'Priya HRBP',  'hrbp',    'Human Resources',  'HR Business Partner',   0),
  ('00000001-0000-0000-0000-000000000003', 'manager@test.com', 'Alice Chen',  'manager', 'Engineering',      'Engineering Manager',   120000),
  ('00000001-0000-0000-0000-000000000004', 'frank@test.com',   'Frank Ramos', 'manager', 'Product',          'Product Manager',       100000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role, department, designation, manager_id, variable_pay) VALUES
  ('00000001-0000-0000-0000-000000000005', 'employee@test.com', 'Bob Kumar',    'employee', 'Engineering', 'Software Engineer',  '00000001-0000-0000-0000-000000000003', 80000),
  ('00000001-0000-0000-0000-000000000006', 'dave@test.com',     'Dave Singh',   'employee', 'Engineering', 'Software Engineer',  '00000001-0000-0000-0000-000000000003', 75000),
  ('00000001-0000-0000-0000-000000000007', 'eve@test.com',      'Eve Nair',     'employee', 'Engineering', 'Senior Engineer',    '00000001-0000-0000-0000-000000000003', 72000),
  ('00000001-0000-0000-0000-000000000008', 'grace@test.com',    'Grace Liu',    'employee', 'Product',     'Product Analyst',    '00000001-0000-0000-0000-000000000004', 68000),
  ('00000001-0000-0000-0000-000000000009', 'henry@test.com',    'Henry Park',   'employee', 'Product',     'UX Designer',        '00000001-0000-0000-0000-000000000004', 65000),
  ('00000001-0000-0000-0000-000000000010', 'irene@test.com',    'Irene Thomas', 'employee', 'Product',     'Business Analyst',   '00000001-0000-0000-0000-000000000004', 60000)
ON CONFLICT (id) DO NOTHING;
