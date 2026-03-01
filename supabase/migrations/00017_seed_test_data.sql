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

-- ──────────────────────────────────────────────────────────
-- SECTION 3: CYCLES
-- ──────────────────────────────────────────────────────────
INSERT INTO cycles (
  id, name, quarter, year, status,
  kpi_setting_deadline, self_review_deadline, manager_review_deadline, calibration_deadline,
  sme_multiplier, business_multiplier, total_budget, budget_currency,
  published_at, created_by
) VALUES
  -- Q1 2025: published (fully complete)
  ('00000002-0000-0000-0000-000000000001',
   'Annual Review FY2025-Q1', 'Q1', 2025, 'published',
   '2025-01-20', '2025-02-10', '2025-02-28', '2025-03-10',
   0.25, 0.9, 500000, 'INR',
   '2025-03-15 12:00:00+00', '00000001-0000-0000-0000-000000000001'),

  -- Q2 2025: calibrating (manager reviews done, HRBP calibrating)
  ('00000002-0000-0000-0000-000000000002',
   'Mid-Year Review FY2025-Q2', 'Q2', 2025, 'calibrating',
   '2025-04-20', '2025-05-10', '2025-05-28', '2025-06-10',
   0.25, 1.0, 550000, 'INR',
   NULL, '00000001-0000-0000-0000-000000000001'),

  -- Q3 2025: manager_review (self-reviews done, managers rating)
  ('00000002-0000-0000-0000-000000000003',
   'Q3 Review FY2025', 'Q3', 2025, 'manager_review',
   '2025-07-20', '2025-08-10', '2025-08-28', '2025-09-10',
   NULL, 1.0, NULL, 'INR',
   NULL, '00000001-0000-0000-0000-000000000001'),

  -- Q4 2025: self_review (KPIs set, employees reviewing)
  ('00000002-0000-0000-0000-000000000004',
   'Q4 Review FY2025', 'Q4', 2025, 'self_review',
   '2025-10-20', '2025-11-10', '2025-11-28', '2025-12-10',
   NULL, 1.0, NULL, 'INR',
   NULL, '00000001-0000-0000-0000-000000000001'),

  -- Q1 2026: kpi_setting (just started)
  ('00000002-0000-0000-0000-000000000005',
   'Q1 Review FY2026', 'Q1', 2026, 'kpi_setting',
   '2026-01-20', '2026-02-10', '2026-02-28', '2026-03-10',
   NULL, 1.0, NULL, 'INR',
   NULL, '00000001-0000-0000-0000-000000000001');

-- ──────────────────────────────────────────────────────────
-- SECTION 4: KPIs
-- 3 KPIs per employee, weights 40+35+25=100.
-- Q1-Q4: all 6 employees. Q1 FY2026: Bob/Dave/Eve only (Alice's team).
-- ──────────────────────────────────────────────────────────
INSERT INTO kpis (cycle_id, employee_id, manager_id, title, description, weight) VALUES
-- ── Q1 2025 (published) ──────────────────────────────────
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),

  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),

  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),

  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),

  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),

  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),

-- ── Q2 2025 (calibrating) ────────────────────────────────
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),

  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003'

-- ──────────────────────────────────────────────────────────
-- SECTION 3: CYCLES
-- ──────────────────────────────────────────────────────────
INSERT INTO cycles (
  id, name, quarter, year, status,
  kpi_setting_deadline, self_review_deadline, manager_review_deadline, calibration_deadline,
  sme_multiplier, business_multiplier, total_budget, budget_currency,
  published_at, created_by
) VALUES
  -- Q1 2025: published (fully complete)
  ('00000002-0000-0000-0000-000000000001',
   'Annual Review FY2025-Q1', 'Q1', 2025, 'published',
   '2025-01-20', '2025-02-10', '2025-02-28', '2025-03-10',
   0.25, 0.9, 500000, 'INR',
   '2025-03-15 12:00:00+00', '00000001-0000-0000-0000-000000000001'),

  -- Q2 2025: calibrating (manager reviews done, HRBP calibrating)
  ('00000002-0000-0000-0000-000000000002',
   'Mid-Year Review FY2025-Q2', 'Q2', 2025, 'calibrating',
   '2025-04-20', '2025-05-10', '2025-05-28', '2025-06-10',
   0.25, 1.0, 550000, 'INR',
   NULL, '00000001-0000-0000-0000-000000000001'),

  -- Q3 2025: manager_review (self-reviews done, managers rating)
  ('00000002-0000-0000-0000-000000000003',
   'Q3 Review FY2025', 'Q3', 2025, 'manager_review',
   '2025-07-20', '2025-08-10', '2025-08-28', '2025-09-10',
   NULL, 1.0, NULL, 'INR',
   NULL, '00000001-0000-0000-0000-000000000001'),

  -- Q4 2025: self_review (KPIs set, employees reviewing)
  ('00000002-0000-0000-0000-000000000004',
   'Q4 Review FY2025', 'Q4', 2025, 'self_review',
   '2025-10-20', '2025-11-10', '2025-11-28', '2025-12-10',
   NULL, 1.0, NULL, 'INR',
   NULL, '00000001-0000-0000-0000-000000000001'),

  -- Q1 2026: kpi_setting (just started)
  ('00000002-0000-0000-0000-000000000005',
   'Q1 Review FY2026', 'Q1', 2026, 'kpi_setting',
   '2026-01-20', '2026-02-10', '2026-02-28', '2026-03-10',
   NULL, 1.0, NULL, 'INR',
   NULL, '00000001-0000-0000-0000-000000000001');

-- ──────────────────────────────────────────────────────────
-- SECTION 4: KPIs
-- 3 KPIs per employee, weights 40+35+25=100.
-- Q1-Q4: all 6 employees. Q1 FY2026: Bob/Dave/Eve only (Alice's team).
-- ──────────────────────────────────────────────────────────
INSERT INTO kpis (cycle_id, employee_id, manager_id, title, description, weight) VALUES
-- ── Q1 2025 (published) ──────────────────────────────────,
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000001','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),

-- ── Q2 2025 (calibrating) ────────────────────────────────,
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000002','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),

-- ── Q3 2025 (manager_review) ─────────────────────────────,
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000003','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),

-- ── Q4 2025 (self_review) ────────────────────────────────,
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000008','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000009','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000004','00000001-0000-0000-0000-000000000010','00000001-0000-0000-0000-000000000004','Learning & Development','Continuous skill growth and knowledge sharing',25),

-- ── Q1 2026 (kpi_setting) — Alice's team only ————————,
  ('00000002-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000006','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25),
  ('00000002-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Delivery Quality','Maintain high standard across all deliverables',40),
  ('00000002-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Collaboration & Communication','Effective teamwork and stakeholder communication',35),
  ('00000002-0000-0000-0000-000000000005','00000001-0000-0000-0000-000000000007','00000001-0000-0000-0000-000000000003','Learning & Development','Continuous skill growth and knowledge sharing',25);
