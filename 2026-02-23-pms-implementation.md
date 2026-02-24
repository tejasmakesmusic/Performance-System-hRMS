# PMS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Performance Management System as an evaluation layer on top of Zimyo HRMS, with a 7-stage cycle state machine, RLS-enforced data visibility, and payroll CSV export.

**Architecture:** Next.js 14+ App Router frontend with Supabase backend (PostgreSQL + Auth + RLS + Edge Functions). Four role-based portals (Employee, Manager, HRBP, Admin). Resend for email. Deployed on Vercel + Supabase Cloud.

**Tech Stack:** Next.js 14 (TypeScript), Supabase (PostgreSQL, Auth, RLS, Edge Functions), Tailwind CSS, shadcn/ui, Vitest, Playwright, Resend

**Design Doc:** `docs/plans/2026-02-23-pms-design.md`

**Note:** The design doc references `employee_variable_pay_component` in payout calculation but omits it from the `users` schema. We add `variable_pay numeric(12,2)` to the `users` table.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.env.local.example`, `.gitignore`, `vitest.config.ts`

**Step 1: Initialize Next.js project**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```
Expected: Project scaffolded with App Router structure.

**Step 2: Install core dependencies**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr resend
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test
```

**Step 3: Create env example file**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RESEND_API_KEY=your-resend-key
ZIMYO_API_BASE_URL=https://api.zimyo.com
ZIMYO_API_KEY=your-zimyo-key
```

Add `.env.local` to `.gitignore` (should already be there).

**Step 4: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

Create `src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest'
```

**Step 5: Install and init shadcn/ui**

Run:
```bash
npx shadcn@latest init -d
```

**Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js 14 project with Supabase, Tailwind, shadcn/ui, Vitest"
```

---

### Task 2: Supabase Setup & Database Schema

**Files:**
- Create: `supabase/migrations/00001_create_enums.sql`
- Create: `supabase/migrations/00002_create_tables.sql`

**Step 1: Initialize Supabase locally**

Run:
```bash
npx supabase init
```

**Step 2: Create enums migration**

Create `supabase/migrations/00001_create_enums.sql`:
```sql
CREATE TYPE user_role AS ENUM ('employee', 'manager', 'hrbp', 'admin');
CREATE TYPE cycle_status AS ENUM ('draft', 'kpi_setting', 'self_review', 'manager_review', 'calibrating', 'locked', 'published');
CREATE TYPE rating_tier AS ENUM ('FEE', 'EE', 'ME', 'SME', 'BE');
CREATE TYPE review_status AS ENUM ('draft', 'submitted');
CREATE TYPE notification_type AS ENUM ('cycle_kpi_setting_open', 'cycle_self_review_open', 'cycle_manager_review_open', 'cycle_published');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
```

**Step 3: Create tables migration**

Create `supabase/migrations/00002_create_tables.sql`:
```sql
-- Users (synced from Zimyo)
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zimyo_id text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  department text,
  designation text,
  manager_id uuid REFERENCES users(id),
  variable_pay numeric(12,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Cycles (state machine)
CREATE TABLE cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  quarter text NOT NULL,
  year integer NOT NULL,
  status cycle_status NOT NULL DEFAULT 'draft',
  kpi_setting_deadline date,
  self_review_deadline date,
  manager_review_deadline date,
  calibration_deadline date,
  published_at timestamptz,
  sme_multiplier numeric(5,4),
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- KPIs (manager-defined goals)
CREATE TABLE kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES cycles(id) NOT NULL,
  employee_id uuid REFERENCES users(id) NOT NULL,
  manager_id uuid REFERENCES users(id) NOT NULL,
  title text NOT NULL,
  description text,
  weight numeric(5,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reviews (employee self-assessment)
CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES cycles(id) NOT NULL,
  employee_id uuid REFERENCES users(id) NOT NULL,
  self_rating rating_tier,
  self_comments text NOT NULL DEFAULT '',
  status review_status DEFAULT 'draft',
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);

-- Appraisals (financial record - strictest RLS)
CREATE TABLE appraisals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES cycles(id) NOT NULL,
  employee_id uuid REFERENCES users(id) NOT NULL,
  manager_id uuid REFERENCES users(id) NOT NULL,
  manager_rating rating_tier,
  manager_comments text,
  manager_submitted_at timestamptz,
  final_rating rating_tier,
  final_rating_set_by uuid REFERENCES users(id),
  payout_multiplier numeric(5,4),
  payout_amount numeric(12,2),
  locked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);

-- Audit logs (immutable - insert only)
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid REFERENCES cycles(id),
  changed_by uuid REFERENCES users(id) NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  justification text,
  created_at timestamptz DEFAULT now()
);

-- Notifications (email queue)
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES users(id) NOT NULL,
  type notification_type NOT NULL,
  payload jsonb,
  status notification_status DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_users_manager ON users(manager_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_kpis_cycle_employee ON kpis(cycle_id, employee_id);
CREATE INDEX idx_reviews_cycle_employee ON reviews(cycle_id, employee_id);
CREATE INDEX idx_appraisals_cycle_employee ON appraisals(cycle_id, employee_id);
CREATE INDEX idx_audit_logs_cycle ON audit_logs(cycle_id);
CREATE INDEX idx_notifications_status ON notifications(status);
```

**Step 4: Apply migrations locally**

Run:
```bash
npx supabase start
npx supabase db reset
```
Expected: All tables and enums created successfully.

**Step 5: Commit**

```bash
git add supabase/ && git commit -m "feat: add database schema with enums, 7 tables, and indexes"
```

---

### Task 3: RLS Policies

**Files:**
- Create: `supabase/migrations/00003_enable_rls.sql`
- Create: `supabase/migrations/00004_rls_policies.sql`

**Step 1: Create helper function and enable RLS**

Create `supabase/migrations/00003_enable_rls.sql`:
```sql
-- Helper: extract role from JWT
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS user_role AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'user_role')::user_role;
$$ LANGUAGE sql STABLE;

-- Helper: extract user_id from JWT
CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS uuid AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'user_id')::uuid;
$$ LANGUAGE sql STABLE;

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
```

**Step 2: Create RLS policies**

Create `supabase/migrations/00004_rls_policies.sql`:
```sql
-- ============ USERS ============
-- Employees see own row
CREATE POLICY users_employee_select ON users FOR SELECT
  USING (auth.user_role() = 'employee' AND id = auth.user_id());

-- Managers see own + direct reports
CREATE POLICY users_manager_select ON users FOR SELECT
  USING (auth.user_role() = 'manager' AND (id = auth.user_id() OR manager_id = auth.user_id()));

-- HRBP/Admin see all
CREATE POLICY users_hr_select ON users FOR SELECT
  USING (auth.user_role() IN ('hrbp', 'admin'));

-- ============ CYCLES ============
-- Everyone can read cycles (employees only see non-draft)
CREATE POLICY cycles_employee_select ON cycles FOR SELECT
  USING (auth.user_role() = 'employee' AND status != 'draft');

CREATE POLICY cycles_staff_select ON cycles FOR SELECT
  USING (auth.user_role() IN ('manager', 'hrbp', 'admin'));

-- Only admin/hrbp can insert/update cycles
CREATE POLICY cycles_admin_insert ON cycles FOR INSERT
  WITH CHECK (auth.user_role() IN ('admin', 'hrbp'));

CREATE POLICY cycles_admin_update ON cycles FOR UPDATE
  USING (auth.user_role() IN ('admin', 'hrbp'));

-- ============ KPIS ============
-- Employees see own KPIs (cycle must be past draft)
CREATE POLICY kpis_employee_select ON kpis FOR SELECT
  USING (
    auth.user_role() = 'employee'
    AND employee_id = auth.user_id()
    AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status != 'draft')
  );

-- Managers see own + direct reports' KPIs
CREATE POLICY kpis_manager_select ON kpis FOR SELECT
  USING (
    auth.user_role() = 'manager'
    AND (employee_id = auth.user_id() OR manager_id = auth.user_id())
  );

-- Managers can insert/update KPIs for their direct reports during kpi_setting
CREATE POLICY kpis_manager_insert ON kpis FOR INSERT
  WITH CHECK (
    auth.user_role() = 'manager'
    AND manager_id = auth.user_id()
    AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status = 'kpi_setting')
  );

CREATE POLICY kpis_manager_update ON kpis FOR UPDATE
  USING (
    auth.user_role() = 'manager'
    AND manager_id = auth.user_id()
    AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status = 'kpi_setting')
  );

-- HRBP/Admin see all KPIs
CREATE POLICY kpis_hr_select ON kpis FOR SELECT
  USING (auth.user_role() IN ('hrbp', 'admin'));

CREATE POLICY kpis_hr_insert ON kpis FOR INSERT
  WITH CHECK (auth.user_role() IN ('hrbp', 'admin'));

CREATE POLICY kpis_hr_update ON kpis FOR UPDATE
  USING (auth.user_role() IN ('hrbp', 'admin'));

-- ============ REVIEWS ============
-- Employees see own review (cycle past self_review)
CREATE POLICY reviews_employee_select ON reviews FOR SELECT
  USING (
    auth.user_role() = 'employee'
    AND employee_id = auth.user_id()
  );

-- Employees insert/update own draft review during self_review
CREATE POLICY reviews_employee_insert ON reviews FOR INSERT
  WITH CHECK (
    auth.user_role() = 'employee'
    AND employee_id = auth.user_id()
    AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status = 'self_review')
  );

CREATE POLICY reviews_employee_update ON reviews FOR UPDATE
  USING (
    auth.user_role() = 'employee'
    AND employee_id = auth.user_id()
    AND status = 'draft'
    AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status = 'self_review')
  );

-- Managers see direct reports' reviews (after manager_review stage)
CREATE POLICY reviews_manager_select ON reviews FOR SELECT
  USING (
    auth.user_role() = 'manager'
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = employee_id AND u.manager_id = auth.user_id())
    AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status IN ('manager_review', 'calibrating', 'locked', 'published'))
  );

-- HRBP/Admin see all
CREATE POLICY reviews_hr_select ON reviews FOR SELECT
  USING (auth.user_role() IN ('hrbp', 'admin'));

-- ============ APPRAISALS ============
-- Employees see own appraisal ONLY when cycle is published
CREATE POLICY appraisals_employee_select ON appraisals FOR SELECT
  USING (
    auth.user_role() = 'employee'
    AND employee_id = auth.user_id()
    AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status = 'published')
  );

-- Managers see direct reports (rating + comments only, enforced at app layer)
CREATE POLICY appraisals_manager_select ON appraisals FOR SELECT
  USING (
    auth.user_role() = 'manager'
    AND manager_id = auth.user_id()
  );

-- Managers insert/update during manager_review
CREATE POLICY appraisals_manager_insert ON appraisals FOR INSERT
  WITH CHECK (
    auth.user_role() = 'manager'
    AND manager_id = auth.user_id()
    AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status = 'manager_review')
  );

CREATE POLICY appraisals_manager_update ON appraisals FOR UPDATE
  USING (
    auth.user_role() = 'manager'
    AND manager_id = auth.user_id()
    AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status = 'manager_review')
  );

-- HRBP/Admin full access
CREATE POLICY appraisals_hr_select ON appraisals FOR SELECT
  USING (auth.user_role() IN ('hrbp', 'admin'));

CREATE POLICY appraisals_hr_update ON appraisals FOR UPDATE
  USING (auth.user_role() IN ('hrbp', 'admin') AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = cycle_id AND c.status = 'calibrating'));

-- ============ AUDIT LOGS ============
-- Insert only for any authenticated user (via service role in edge functions)
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (true);

-- Only HRBP/Admin can read
CREATE POLICY audit_logs_hr_select ON audit_logs FOR SELECT
  USING (auth.user_role() IN ('hrbp', 'admin'));

-- No update/delete ever
-- (RLS + no policy = denied)

-- ============ NOTIFICATIONS ============
-- Only HRBP/Admin can read
CREATE POLICY notifications_hr_select ON notifications FOR SELECT
  USING (auth.user_role() IN ('hrbp', 'admin'));

-- Insert via service role (edge functions)
CREATE POLICY notifications_service_insert ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY notifications_service_update ON notifications FOR UPDATE
  USING (auth.user_role() IN ('hrbp', 'admin'));
```

**Step 3: Apply and verify**

Run:
```bash
npx supabase db reset
```
Expected: All migrations applied, no errors.

**Step 4: Commit**

```bash
git add supabase/ && git commit -m "feat: add RLS policies for all tables with role-based access"
```

---

### Task 4: Supabase Client & Auth Middleware

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`

**Step 1: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 2: Create server Supabase client**

Create `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  )
}

export async function createServiceClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

**Step 3: Create middleware helper**

Create `src/lib/supabase/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login (except /login and /auth routes)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

**Step 4: Create Next.js middleware**

Create `src/middleware.ts`:
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

**Step 5: Commit**

```bash
git add src/lib/supabase/ src/middleware.ts && git commit -m "feat: add Supabase client (browser + server) and auth middleware"
```

---

### Task 5: Shared Types & Constants

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/constants.ts`
- Test: `src/lib/__tests__/constants.test.ts`

**Step 1: Write the failing test for payout multiplier mapping**

Create `src/lib/__tests__/constants.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { getPayoutMultiplier, RATING_TIERS } from '@/lib/constants'

describe('getPayoutMultiplier', () => {
  it('returns 1.25 for FEE', () => {
    expect(getPayoutMultiplier('FEE', 0.5)).toBe(1.25)
  })

  it('returns 1.10 for EE', () => {
    expect(getPayoutMultiplier('EE', 0.5)).toBe(1.1)
  })

  it('returns 1.00 for ME', () => {
    expect(getPayoutMultiplier('ME', 0.5)).toBe(1.0)
  })

  it('returns cycle sme_multiplier for SME', () => {
    expect(getPayoutMultiplier('SME', 0.75)).toBe(0.75)
  })

  it('returns 0 for BE', () => {
    expect(getPayoutMultiplier('BE', 0.5)).toBe(0)
  })
})

describe('RATING_TIERS', () => {
  it('has 5 tiers', () => {
    expect(RATING_TIERS).toHaveLength(5)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/constants.test.ts`
Expected: FAIL — modules not found.

**Step 3: Create types**

Create `src/lib/types.ts`:
```typescript
export type UserRole = 'employee' | 'manager' | 'hrbp' | 'admin'
export type CycleStatus = 'draft' | 'kpi_setting' | 'self_review' | 'manager_review' | 'calibrating' | 'locked' | 'published'
export type RatingTier = 'FEE' | 'EE' | 'ME' | 'SME' | 'BE'
export type ReviewStatus = 'draft' | 'submitted'
export type NotificationType = 'cycle_kpi_setting_open' | 'cycle_self_review_open' | 'cycle_manager_review_open' | 'cycle_published'
export type NotificationStatus = 'pending' | 'sent' | 'failed'

export interface User {
  id: string
  zimyo_id: string
  email: string
  full_name: string
  role: UserRole
  department: string | null
  designation: string | null
  manager_id: string | null
  variable_pay: number
  is_active: boolean
  synced_at: string
  created_at: string
}

export interface Cycle {
  id: string
  name: string
  quarter: string
  year: number
  status: CycleStatus
  kpi_setting_deadline: string | null
  self_review_deadline: string | null
  manager_review_deadline: string | null
  calibration_deadline: string | null
  published_at: string | null
  sme_multiplier: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Kpi {
  id: string
  cycle_id: string
  employee_id: string
  manager_id: string
  title: string
  description: string | null
  weight: number | null
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  cycle_id: string
  employee_id: string
  self_rating: RatingTier | null
  self_comments: string
  status: ReviewStatus
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export interface Appraisal {
  id: string
  cycle_id: string
  employee_id: string
  manager_id: string
  manager_rating: RatingTier | null
  manager_comments: string | null
  manager_submitted_at: string | null
  final_rating: RatingTier | null
  final_rating_set_by: string | null
  payout_multiplier: number | null
  payout_amount: number | null
  locked_at: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  cycle_id: string | null
  changed_by: string
  action: string
  entity_type: string
  entity_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  justification: string | null
  created_at: string
}
```

**Step 4: Create constants**

Create `src/lib/constants.ts`:
```typescript
import type { RatingTier, CycleStatus } from './types'

export const RATING_TIERS: { code: RatingTier; name: string; fixedMultiplier: number | null }[] = [
  { code: 'FEE', name: 'Far Exceeds Expectations', fixedMultiplier: 1.25 },
  { code: 'EE', name: 'Exceeds Expectations', fixedMultiplier: 1.1 },
  { code: 'ME', name: 'Meets Expectations', fixedMultiplier: 1.0 },
  { code: 'SME', name: 'Some Meets Expectations', fixedMultiplier: null },
  { code: 'BE', name: 'Below Expectations', fixedMultiplier: 0 },
]

export function getPayoutMultiplier(rating: RatingTier, smeMultiplier: number): number {
  if (rating === 'SME') return smeMultiplier
  const tier = RATING_TIERS.find(t => t.code === rating)
  return tier?.fixedMultiplier ?? 0
}

export const CYCLE_STATUS_ORDER: CycleStatus[] = [
  'draft', 'kpi_setting', 'self_review', 'manager_review', 'calibrating', 'locked', 'published',
]

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  draft: 'Draft',
  kpi_setting: 'KPI Setting',
  self_review: 'Self Review',
  manager_review: 'Manager Review',
  calibrating: 'Calibrating',
  locked: 'Locked',
  published: 'Published',
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/constants.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/ && git commit -m "feat: add shared types, constants, and payout multiplier logic"
```

---

### Task 6: Cycle State Machine Logic

**Files:**
- Create: `src/lib/cycle-machine.ts`
- Test: `src/lib/__tests__/cycle-machine.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/__tests__/cycle-machine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { getNextStatus, canTransition, getTransitionRequirements } from '@/lib/cycle-machine'

describe('canTransition', () => {
  it('allows draft -> kpi_setting', () => {
    expect(canTransition('draft', 'kpi_setting')).toBe(true)
  })

  it('blocks draft -> self_review (must go through kpi_setting)', () => {
    expect(canTransition('draft', 'self_review')).toBe(false)
  })

  it('blocks published -> anything', () => {
    expect(canTransition('published', 'draft')).toBe(false)
  })

  it('allows full forward chain', () => {
    expect(canTransition('kpi_setting', 'self_review')).toBe(true)
    expect(canTransition('self_review', 'manager_review')).toBe(true)
    expect(canTransition('manager_review', 'calibrating')).toBe(true)
    expect(canTransition('calibrating', 'locked')).toBe(true)
    expect(canTransition('locked', 'published')).toBe(true)
  })
})

describe('getNextStatus', () => {
  it('returns kpi_setting for draft', () => {
    expect(getNextStatus('draft')).toBe('kpi_setting')
  })

  it('returns null for published', () => {
    expect(getNextStatus('published')).toBeNull()
  })
})

describe('getTransitionRequirements', () => {
  it('returns role requirement for each transition', () => {
    const req = getTransitionRequirements('draft', 'kpi_setting')
    expect(req).toBeDefined()
    expect(req!.allowedRoles).toContain('admin')
    expect(req!.allowedRoles).toContain('hrbp')
  })

  it('locked -> published only allowed by hrbp', () => {
    const req = getTransitionRequirements('locked', 'published')
    expect(req!.allowedRoles).toEqual(['hrbp'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/cycle-machine.test.ts`
Expected: FAIL

**Step 3: Implement state machine**

Create `src/lib/cycle-machine.ts`:
```typescript
import type { CycleStatus, UserRole } from './types'

interface TransitionRule {
  from: CycleStatus
  to: CycleStatus
  allowedRoles: UserRole[]
}

const TRANSITIONS: TransitionRule[] = [
  { from: 'draft', to: 'kpi_setting', allowedRoles: ['admin', 'hrbp'] },
  { from: 'kpi_setting', to: 'self_review', allowedRoles: ['admin', 'hrbp'] },
  { from: 'self_review', to: 'manager_review', allowedRoles: ['admin', 'hrbp'] },
  { from: 'manager_review', to: 'calibrating', allowedRoles: ['admin', 'hrbp'] },
  { from: 'calibrating', to: 'locked', allowedRoles: ['hrbp'] },
  { from: 'locked', to: 'published', allowedRoles: ['hrbp'] },
]

export function canTransition(from: CycleStatus, to: CycleStatus): boolean {
  return TRANSITIONS.some(t => t.from === from && t.to === to)
}

export function getNextStatus(current: CycleStatus): CycleStatus | null {
  const t = TRANSITIONS.find(t => t.from === current)
  return t?.to ?? null
}

export function getTransitionRequirements(from: CycleStatus, to: CycleStatus): TransitionRule | null {
  return TRANSITIONS.find(t => t.from === from && t.to === to) ?? null
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/cycle-machine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/cycle-machine.ts src/lib/__tests__/cycle-machine.test.ts && git commit -m "feat: add cycle state machine with transition rules and tests"
```

---

### Task 7: Auth Helpers & Login Page

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`

**Step 1: Create auth helper to get current user with role**

Create `src/lib/auth.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User, UserRole } from './types'

export async function getCurrentUser(): Promise<User> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: dbUser, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', authUser.email)
    .single()

  if (error || !dbUser) redirect('/login')
  return dbUser as User
}

export async function requireRole(allowedRoles: UserRole[]): Promise<User> {
  const user = await getCurrentUser()
  if (!allowedRoles.includes(user.role)) {
    redirect('/unauthorized')
  }
  return user
}

export function getRoleDashboardPath(role: UserRole): string {
  switch (role) {
    case 'employee': return '/employee'
    case 'manager': return '/manager'
    case 'hrbp': return '/hrbp'
    case 'admin': return '/admin'
  }
}
```

**Step 2: Create login page**

Create `src/app/login/page.tsx`:
```tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Check your email for the login link.')
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 p-8">
        <h1 className="text-2xl font-bold text-center">PMS Login</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Sending...' : 'Send Magic Link'}
        </Button>
        {message && <p className="text-sm text-center text-muted-foreground">{message}</p>}
      </form>
    </div>
  )
}
```

**Step 3: Create auth callback route**

Create `src/app/auth/callback/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Fetch user role and redirect to appropriate dashboard
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: dbUser } = await supabase
          .from('users')
          .select('role')
          .eq('email', user.email)
          .single()

        const rolePath = dbUser?.role === 'admin' ? '/admin'
          : dbUser?.role === 'hrbp' ? '/hrbp'
          : dbUser?.role === 'manager' ? '/manager'
          : '/employee'

        return NextResponse.redirect(`${origin}${rolePath}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

**Step 4: Commit**

```bash
git add src/lib/auth.ts src/app/login/ src/app/auth/ && git commit -m "feat: add auth helpers, magic link login page, and auth callback"
```

---

### Task 8: Layout Shell & Role-Based Routing

**Files:**
- Create: `src/components/sidebar.tsx`
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/employee/layout.tsx`
- Create: `src/app/(dashboard)/manager/layout.tsx`
- Create: `src/app/(dashboard)/hrbp/layout.tsx`
- Create: `src/app/(dashboard)/admin/layout.tsx`

**Step 1: Install shadcn sidebar and navigation components**

Run:
```bash
npx shadcn@latest add sidebar-07
npx shadcn@latest add badge avatar dropdown-menu separator
```

**Step 2: Create sidebar component**

Create `src/components/sidebar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/types'
import { cn } from '@/lib/utils'

interface NavItem { label: string; href: string }

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  employee: [
    { label: 'My Review', href: '/employee' },
    { label: 'My History', href: '/employee/history' },
  ],
  manager: [
    { label: 'My Team', href: '/manager' },
    { label: 'My Review', href: '/manager/my-review' },
  ],
  hrbp: [
    { label: 'Cycles', href: '/hrbp' },
    { label: 'Calibration', href: '/hrbp/calibration' },
    { label: 'Audit Log', href: '/hrbp/audit-log' },
  ],
  admin: [
    { label: 'Cycles', href: '/admin' },
    { label: 'Users', href: '/admin/users' },
    { label: 'Audit Log', href: '/admin/audit-log' },
  ],
}

export function Sidebar({ role, userName }: { role: UserRole; userName: string }) {
  const pathname = usePathname()
  const items = NAV_ITEMS[role]

  return (
    <aside className="flex w-64 flex-col border-r bg-muted/40 p-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">PMS</h2>
        <p className="text-sm text-muted-foreground">{userName}</p>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
              pathname === item.href && 'bg-accent font-medium'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
```

**Step 3: Create dashboard layout**

Create `src/app/(dashboard)/layout.tsx`:
```tsx
import { getCurrentUser } from '@/lib/auth'
import { Sidebar } from '@/components/sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  return (
    <div className="flex h-screen">
      <Sidebar role={user.role} userName={user.full_name} />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  )
}
```

**Step 4: Create role layout shells with role guards**

Create `src/app/(dashboard)/employee/layout.tsx`:
```tsx
import { requireRole } from '@/lib/auth'

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['employee'])
  return <>{children}</>
}
```

Create identical layouts for manager (`requireRole(['manager'])`), hrbp (`requireRole(['hrbp'])`), and admin (`requireRole(['admin'])`).

**Step 5: Create placeholder pages for each portal**

Create `src/app/(dashboard)/employee/page.tsx`:
```tsx
export default function EmployeeHome() {
  return <h1 className="text-2xl font-bold">My Review</h1>
}
```

Create similar placeholder pages for `/manager/page.tsx`, `/hrbp/page.tsx`, `/admin/page.tsx`.

**Step 6: Commit**

```bash
git add src/components/ src/app/ && git commit -m "feat: add dashboard layout with sidebar, role-based routing, and placeholder pages"
```

---

### Task 9: Admin — Cycle Management

**Files:**
- Create: `src/app/(dashboard)/admin/actions.ts`
- Modify: `src/app/(dashboard)/admin/page.tsx`
- Create: `src/app/(dashboard)/admin/cycles/new/page.tsx`
- Create: `src/components/cycle-status-badge.tsx`

**Step 1: Create server actions for cycle CRUD**

Create `src/app/(dashboard)/admin/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { canTransition, getTransitionRequirements } from '@/lib/cycle-machine'
import type { CycleStatus } from '@/lib/types'
import { revalidatePath } from 'next/cache'

export async function createCycle(formData: FormData) {
  const user = await requireRole(['admin', 'hrbp'])
  const supabase = await createClient()

  const { error } = await supabase.from('cycles').insert({
    name: formData.get('name') as string,
    quarter: formData.get('quarter') as string,
    year: Number(formData.get('year')),
    sme_multiplier: Number(formData.get('sme_multiplier')),
    kpi_setting_deadline: formData.get('kpi_setting_deadline') as string || null,
    self_review_deadline: formData.get('self_review_deadline') as string || null,
    manager_review_deadline: formData.get('manager_review_deadline') as string || null,
    calibration_deadline: formData.get('calibration_deadline') as string || null,
    created_by: user.id,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function advanceCycleStatus(cycleId: string, currentStatus: CycleStatus) {
  const user = await requireRole(['admin', 'hrbp'])
  const supabase = await createClient()

  const rule = getTransitionRequirements(currentStatus, '' as CycleStatus)
  // Find valid next status
  const nextMap: Record<string, CycleStatus> = {
    draft: 'kpi_setting',
    kpi_setting: 'self_review',
    self_review: 'manager_review',
    manager_review: 'calibrating',
    calibrating: 'locked',
    locked: 'published',
  }
  const nextStatus = nextMap[currentStatus]
  if (!nextStatus || !canTransition(currentStatus, nextStatus)) {
    throw new Error(`Cannot advance from ${currentStatus}`)
  }

  const req = getTransitionRequirements(currentStatus, nextStatus)
  if (!req?.allowedRoles.includes(user.role)) {
    throw new Error('Not authorized for this transition')
  }

  const updateData: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  }
  if (nextStatus === 'published') {
    updateData.published_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('cycles')
    .update(updateData)
    .eq('id', cycleId)

  if (error) throw new Error(error.message)

  // Audit log
  await supabase.from('audit_logs').insert({
    cycle_id: cycleId,
    changed_by: user.id,
    action: 'cycle_status_change',
    entity_type: 'cycle',
    entity_id: cycleId,
    old_value: { status: currentStatus },
    new_value: { status: nextStatus },
  })

  revalidatePath('/admin')
  revalidatePath('/hrbp')
}
```

**Step 2: Create cycle status badge component**

Create `src/components/cycle-status-badge.tsx`:
```tsx
import { Badge } from '@/components/ui/badge'
import { CYCLE_STATUS_LABELS } from '@/lib/constants'
import type { CycleStatus } from '@/lib/types'

const STATUS_COLORS: Record<CycleStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  kpi_setting: 'bg-blue-100 text-blue-800',
  self_review: 'bg-yellow-100 text-yellow-800',
  manager_review: 'bg-orange-100 text-orange-800',
  calibrating: 'bg-purple-100 text-purple-800',
  locked: 'bg-red-100 text-red-800',
  published: 'bg-green-100 text-green-800',
}

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  return (
    <Badge className={STATUS_COLORS[status]} variant="outline">
      {CYCLE_STATUS_LABELS[status]}
    </Badge>
  )
}
```

**Step 3: Build admin cycles list page**

Modify `src/app/(dashboard)/admin/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { CycleStatusBadge } from '@/components/cycle-status-badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { advanceCycleStatus } from './actions'
import { getNextStatus } from '@/lib/cycle-machine'
import { CYCLE_STATUS_LABELS } from '@/lib/constants'
import type { Cycle } from '@/lib/types'

export default async function AdminCyclesPage() {
  const user = await requireRole(['admin'])
  const supabase = await createClient()

  const { data: cycles } = await supabase
    .from('cycles')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cycle Management</h1>
        <Link href="/admin/cycles/new">
          <Button>Create Cycle</Button>
        </Link>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Year</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(cycles as Cycle[] ?? []).map(cycle => {
              const next = getNextStatus(cycle.status)
              return (
                <tr key={cycle.id} className="border-b">
                  <td className="p-3">{cycle.name}</td>
                  <td className="p-3"><CycleStatusBadge status={cycle.status} /></td>
                  <td className="p-3">{cycle.year}</td>
                  <td className="p-3">
                    {next && (
                      <form action={advanceCycleStatus.bind(null, cycle.id, cycle.status)}>
                        <Button variant="outline" size="sm" type="submit">
                          Advance to {CYCLE_STATUS_LABELS[next]}
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 4: Build create cycle form page**

Create `src/app/(dashboard)/admin/cycles/new/page.tsx`:
```tsx
import { requireRole } from '@/lib/auth'
import { createCycle } from '../../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function NewCyclePage() {
  await requireRole(['admin', 'hrbp'])

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Create New Cycle</h1>
      <form action={createCycle} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Cycle Name</Label>
          <Input id="name" name="name" placeholder="Q1 2026" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="quarter">Quarter</Label>
            <Input id="quarter" name="quarter" placeholder="Q1" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" type="number" defaultValue={2026} required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sme_multiplier">SME Payout Multiplier</Label>
          <Input id="sme_multiplier" name="sme_multiplier" type="number" step="0.01" placeholder="0.50" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="kpi_setting_deadline">KPI Setting Deadline</Label>
            <Input id="kpi_setting_deadline" name="kpi_setting_deadline" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="self_review_deadline">Self Review Deadline</Label>
            <Input id="self_review_deadline" name="self_review_deadline" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manager_review_deadline">Manager Review Deadline</Label>
            <Input id="manager_review_deadline" name="manager_review_deadline" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calibration_deadline">Calibration Deadline</Label>
            <Input id="calibration_deadline" name="calibration_deadline" type="date" />
          </div>
        </div>
        <Button type="submit">Create Cycle</Button>
      </form>
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add src/ && git commit -m "feat: add admin cycle management with create, list, and status advancement"
```

---

### Task 10: Admin — User Management & Zimyo Sync

**Files:**
- Create: `src/app/(dashboard)/admin/users/page.tsx`
- Create: `src/app/(dashboard)/admin/users/actions.ts`
- Create: `src/lib/zimyo.ts`
- Test: `src/lib/__tests__/zimyo.test.ts`

**Step 1: Write failing test for Zimyo data transformation**

Create `src/lib/__tests__/zimyo.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { transformZimyoEmployee } from '@/lib/zimyo'

describe('transformZimyoEmployee', () => {
  it('maps Zimyo API fields to user fields', () => {
    const zimyoData = {
      employee_id: 'Z001',
      email: 'alice@company.com',
      name: 'Alice Smith',
      department: 'Engineering',
      designation: 'Senior Engineer',
    }
    const result = transformZimyoEmployee(zimyoData)
    expect(result).toEqual({
      zimyo_id: 'Z001',
      email: 'alice@company.com',
      full_name: 'Alice Smith',
      department: 'Engineering',
      designation: 'Senior Engineer',
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/zimyo.test.ts`
Expected: FAIL

**Step 3: Implement Zimyo module**

Create `src/lib/zimyo.ts`:
```typescript
interface ZimyoEmployee {
  employee_id: string
  email: string
  name: string
  department: string
  designation: string
  reporting_manager_email?: string
}

export function transformZimyoEmployee(data: ZimyoEmployee) {
  return {
    zimyo_id: data.employee_id,
    email: data.email,
    full_name: data.name,
    department: data.department,
    designation: data.designation,
  }
}

export async function fetchZimyoEmployees(): Promise<ZimyoEmployee[]> {
  const res = await fetch(`${process.env.ZIMYO_API_BASE_URL}/employees`, {
    headers: { Authorization: `Bearer ${process.env.ZIMYO_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Zimyo API error: ${res.status}`)
  const data = await res.json()
  return data.employees
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/zimyo.test.ts`
Expected: PASS

**Step 5: Create user management server actions**

Create `src/app/(dashboard)/admin/users/actions.ts`:
```typescript
'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchZimyoEmployees, transformZimyoEmployee } from '@/lib/zimyo'
import { revalidatePath } from 'next/cache'

export async function triggerZimyoSync() {
  const user = await requireRole(['admin'])
  const supabase = await createServiceClient()

  const zimyoEmployees = await fetchZimyoEmployees()
  let added = 0, updated = 0, deactivated = 0

  // Build email->id map for manager resolution
  const emailToId = new Map<string, string>()

  for (const emp of zimyoEmployees) {
    const transformed = transformZimyoEmployee(emp)
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('zimyo_id', transformed.zimyo_id)
      .single()

    if (existing) {
      await supabase.from('users').update({ ...transformed, is_active: true, synced_at: new Date().toISOString() }).eq('zimyo_id', transformed.zimyo_id)
      emailToId.set(transformed.email, existing.id)
      updated++
    } else {
      const { data: newUser } = await supabase.from('users').insert({ ...transformed, synced_at: new Date().toISOString() }).select('id').single()
      if (newUser) emailToId.set(transformed.email, newUser.id)
      added++
    }
  }

  // Resolve manager_id from reporting_manager_email
  for (const emp of zimyoEmployees) {
    if (emp.reporting_manager_email) {
      const managerId = emailToId.get(emp.reporting_manager_email)
      if (managerId) {
        await supabase.from('users').update({ manager_id: managerId }).eq('zimyo_id', emp.employee_id)
      }
    }
  }

  // Deactivate users no longer in Zimyo
  const activeZimyoIds = zimyoEmployees.map(e => e.employee_id)
  const { data: allUsers } = await supabase.from('users').select('zimyo_id').eq('is_active', true)
  for (const u of allUsers ?? []) {
    if (!activeZimyoIds.includes(u.zimyo_id)) {
      await supabase.from('users').update({ is_active: false }).eq('zimyo_id', u.zimyo_id)
      deactivated++
    }
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    changed_by: user.id,
    action: 'zimyo_sync',
    entity_type: 'user',
    new_value: { added, updated, deactivated },
  })

  revalidatePath('/admin/users')
  return { added, updated, deactivated }
}

export async function updateUserRole(userId: string, role: string) {
  const user = await requireRole(['admin'])
  const supabase = await createServiceClient()

  const { data: target } = await supabase.from('users').select('role').eq('id', userId).single()

  await supabase.from('users').update({ role }).eq('id', userId)

  await supabase.from('audit_logs').insert({
    changed_by: user.id,
    action: 'role_change',
    entity_type: 'user',
    entity_id: userId,
    old_value: { role: target?.role },
    new_value: { role },
  })

  revalidatePath('/admin/users')
}
```

**Step 6: Build user management page**

Create `src/app/(dashboard)/admin/users/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { triggerZimyoSync } from './actions'
import type { User } from '@/lib/types'

export default async function AdminUsersPage() {
  await requireRole(['admin'])
  const supabase = await createClient()
  const { data: users } = await supabase.from('users').select('*').order('full_name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
        <form action={triggerZimyoSync}>
          <Button type="submit">Sync from Zimyo</Button>
        </form>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Department</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {(users as User[] ?? []).map(u => (
              <tr key={u.id} className="border-b">
                <td className="p-3">{u.full_name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.department}</td>
                <td className="p-3"><Badge variant="outline">{u.role}</Badge></td>
                <td className="p-3">{u.is_active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 7: Commit**

```bash
git add src/ && git commit -m "feat: add user management with Zimyo sync and role editing"
```

---

### Task 11: Manager — KPI Setting

**Files:**
- Create: `src/app/(dashboard)/manager/page.tsx`
- Create: `src/app/(dashboard)/manager/actions.ts`
- Create: `src/app/(dashboard)/manager/[employeeId]/kpis/page.tsx`

**Step 1: Create manager server actions**

Create `src/app/(dashboard)/manager/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function addKpi(formData: FormData) {
  const user = await requireRole(['manager'])
  const supabase = await createClient()

  const { error } = await supabase.from('kpis').insert({
    cycle_id: formData.get('cycle_id') as string,
    employee_id: formData.get('employee_id') as string,
    manager_id: user.id,
    title: formData.get('title') as string,
    description: formData.get('description') as string || null,
    weight: Number(formData.get('weight')) || null,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/manager/${formData.get('employee_id')}/kpis`)
}

export async function deleteKpi(kpiId: string, employeeId: string) {
  await requireRole(['manager'])
  const supabase = await createClient()
  await supabase.from('kpis').delete().eq('id', kpiId)
  revalidatePath(`/manager/${employeeId}/kpis`)
}

export async function submitManagerRating(formData: FormData) {
  const user = await requireRole(['manager'])
  const supabase = await createClient()

  const cycleId = formData.get('cycle_id') as string
  const employeeId = formData.get('employee_id') as string
  const rating = formData.get('manager_rating') as string
  const comments = formData.get('manager_comments') as string

  // Upsert appraisal
  const { error } = await supabase.from('appraisals').upsert({
    cycle_id: cycleId,
    employee_id: employeeId,
    manager_id: user.id,
    manager_rating: rating,
    manager_comments: comments,
    manager_submitted_at: new Date().toISOString(),
    final_rating: rating, // default final = manager's rating
    payout_multiplier: null, // calculated later by HR
  }, { onConflict: 'cycle_id,employee_id' })

  if (error) throw new Error(error.message)
  revalidatePath('/manager')
}
```

**Step 2: Build My Team page**

Replace `src/app/(dashboard)/manager/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { User, Cycle } from '@/lib/types'

export default async function ManagerTeamPage() {
  const user = await requireRole(['manager'])
  const supabase = await createClient()

  // Get active cycle
  const { data: cycles } = await supabase
    .from('cycles')
    .select('*')
    .neq('status', 'draft')
    .neq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)

  const activeCycle = (cycles as Cycle[])?.[0]

  // Get direct reports
  const { data: reports } = await supabase
    .from('users')
    .select('*')
    .eq('manager_id', user.id)
    .eq('is_active', true)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Team</h1>
      {!activeCycle && <p className="text-muted-foreground">No active review cycle.</p>}
      {activeCycle && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Department</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(reports as User[] ?? []).map(emp => (
                <tr key={emp.id} className="border-b">
                  <td className="p-3">{emp.full_name}</td>
                  <td className="p-3">{emp.department}</td>
                  <td className="p-3">
                    {activeCycle.status === 'kpi_setting' && (
                      <Link href={`/manager/${emp.id}/kpis?cycle=${activeCycle.id}`} className="text-blue-600 hover:underline">
                        Set KPIs
                      </Link>
                    )}
                    {activeCycle.status === 'manager_review' && (
                      <Link href={`/manager/${emp.id}/review?cycle=${activeCycle.id}`} className="text-blue-600 hover:underline">
                        Submit Review
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

**Step 3: Build KPI setting page for an employee**

Create `src/app/(dashboard)/manager/[employeeId]/kpis/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { addKpi, deleteKpi } from '../../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Kpi, User } from '@/lib/types'

export default async function KpiSettingPage({
  params, searchParams,
}: {
  params: Promise<{ employeeId: string }>
  searchParams: Promise<{ cycle?: string }>
}) {
  await requireRole(['manager'])
  const { employeeId } = await params
  const { cycle: cycleId } = await searchParams
  const supabase = await createClient()

  const { data: employee } = await supabase.from('users').select('*').eq('id', employeeId).single()
  const { data: kpis } = await supabase.from('kpis').select('*').eq('cycle_id', cycleId).eq('employee_id', employeeId)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">KPIs for {(employee as User)?.full_name}</h1>

      {/* Existing KPIs */}
      <div className="space-y-2">
        {(kpis as Kpi[] ?? []).map(kpi => (
          <div key={kpi.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="font-medium">{kpi.title}</p>
              <p className="text-sm text-muted-foreground">Weight: {kpi.weight}%</p>
            </div>
            <form action={deleteKpi.bind(null, kpi.id, employeeId)}>
              <Button variant="ghost" size="sm" type="submit">Remove</Button>
            </form>
          </div>
        ))}
      </div>

      {/* Add KPI form */}
      <form action={addKpi} className="space-y-4 rounded border p-4">
        <h2 className="text-lg font-semibold">Add KPI</h2>
        <input type="hidden" name="cycle_id" value={cycleId} />
        <input type="hidden" name="employee_id" value={employeeId} />
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input id="description" name="description" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="weight">Weight (%)</Label>
          <Input id="weight" name="weight" type="number" min="0" max="100" />
        </div>
        <Button type="submit">Add KPI</Button>
      </form>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add src/ && git commit -m "feat: add manager KPI setting, team list, and rating submission"
```

---

### Task 12: Employee — Self Review

**Files:**
- Create: `src/app/(dashboard)/employee/page.tsx` (replace placeholder)
- Create: `src/app/(dashboard)/employee/actions.ts`

**Step 1: Create employee server actions**

Create `src/app/(dashboard)/employee/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function submitSelfReview(formData: FormData) {
  const user = await requireRole(['employee'])
  const supabase = await createClient()

  const cycleId = formData.get('cycle_id') as string
  const selfRating = formData.get('self_rating') as string
  const selfComments = formData.get('self_comments') as string

  // Upsert review
  const { error } = await supabase.from('reviews').upsert({
    cycle_id: cycleId,
    employee_id: user.id,
    self_rating: selfRating,
    self_comments: selfComments,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'cycle_id,employee_id' })

  if (error) throw new Error(error.message)
  revalidatePath('/employee')
}

export async function saveDraftReview(formData: FormData) {
  const user = await requireRole(['employee'])
  const supabase = await createClient()

  const { error } = await supabase.from('reviews').upsert({
    cycle_id: formData.get('cycle_id') as string,
    employee_id: user.id,
    self_rating: formData.get('self_rating') as string || null,
    self_comments: formData.get('self_comments') as string,
    status: 'draft',
  }, { onConflict: 'cycle_id,employee_id' })

  if (error) throw new Error(error.message)
  revalidatePath('/employee')
}
```

**Step 2: Build employee My Review page**

Replace `src/app/(dashboard)/employee/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { CycleStatusBadge } from '@/components/cycle-status-badge'
import { submitSelfReview, saveDraftReview } from './actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RATING_TIERS } from '@/lib/constants'
import type { Cycle, Kpi, Review, Appraisal } from '@/lib/types'

export default async function EmployeeReviewPage() {
  const user = await requireRole(['employee'])
  const supabase = await createClient()

  // Get latest non-draft cycle
  const { data: cycles } = await supabase
    .from('cycles').select('*')
    .neq('status', 'draft')
    .order('created_at', { ascending: false }).limit(1)
  const cycle = (cycles as Cycle[])?.[0]

  if (!cycle) return <p className="text-muted-foreground">No active review cycle.</p>

  // Get KPIs, review, and appraisal
  const [kpiRes, reviewRes, appraisalRes] = await Promise.all([
    supabase.from('kpis').select('*').eq('cycle_id', cycle.id).eq('employee_id', user.id),
    supabase.from('reviews').select('*').eq('cycle_id', cycle.id).eq('employee_id', user.id).single(),
    supabase.from('appraisals').select('*').eq('cycle_id', cycle.id).eq('employee_id', user.id).single(),
  ])

  const kpis = kpiRes.data as Kpi[] ?? []
  const review = reviewRes.data as Review | null
  const appraisal = appraisalRes.data as Appraisal | null
  const isSelfReview = cycle.status === 'self_review'
  const isPublished = cycle.status === 'published'

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">My Review — {cycle.name}</h1>
        <CycleStatusBadge status={cycle.status} />
      </div>

      {/* KPIs */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">My KPIs</h2>
        {kpis.length === 0 && <p className="text-muted-foreground">No KPIs assigned yet.</p>}
        {kpis.map(kpi => (
          <div key={kpi.id} className="rounded border p-3">
            <p className="font-medium">{kpi.title}</p>
            {kpi.description && <p className="text-sm text-muted-foreground">{kpi.description}</p>}
            <p className="text-sm">Weight: {kpi.weight}%</p>
          </div>
        ))}
      </section>

      {/* Self Review Form (only during self_review) */}
      {isSelfReview && review?.status !== 'submitted' && (
        <section className="space-y-4 rounded border p-4">
          <h2 className="text-lg font-semibold">Self Assessment</h2>
          <form className="space-y-4">
            <input type="hidden" name="cycle_id" value={cycle.id} />
            <div className="space-y-2">
              <Label htmlFor="self_rating">Self Rating</Label>
              <select id="self_rating" name="self_rating" className="w-full rounded border p-2" defaultValue={review?.self_rating ?? ''}>
                <option value="">Select...</option>
                {RATING_TIERS.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="self_comments">Comments</Label>
              <Textarea id="self_comments" name="self_comments" rows={5} defaultValue={review?.self_comments ?? ''} required />
            </div>
            <div className="flex gap-2">
              <Button formAction={saveDraftReview} variant="outline">Save Draft</Button>
              <Button formAction={submitSelfReview}>Submit</Button>
            </div>
          </form>
        </section>
      )}

      {review?.status === 'submitted' && !isPublished && (
        <p className="text-green-600 font-medium">Self assessment submitted.</p>
      )}

      {/* Final Result (only when published) */}
      {isPublished && appraisal && (
        <section className="rounded border bg-muted/30 p-4 space-y-2">
          <h2 className="text-lg font-semibold">Final Result</h2>
          <p>Final Rating: <span className="font-bold">{appraisal.final_rating}</span></p>
          <p>Payout Multiplier: <span className="font-bold">{appraisal.payout_multiplier ? `${(appraisal.payout_multiplier * 100).toFixed(0)}%` : 'N/A'}</span></p>
        </section>
      )}
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/ && git commit -m "feat: add employee self-review page with KPI display and assessment form"
```

---

### Task 13: Manager — Review Submission

**Files:**
- Create: `src/app/(dashboard)/manager/[employeeId]/review/page.tsx`

**Step 1: Build manager review page**

Create `src/app/(dashboard)/manager/[employeeId]/review/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { submitManagerRating } from '../../actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RATING_TIERS } from '@/lib/constants'
import type { User, Kpi, Review, Appraisal } from '@/lib/types'

export default async function ManagerReviewPage({
  params, searchParams,
}: {
  params: Promise<{ employeeId: string }>
  searchParams: Promise<{ cycle?: string }>
}) {
  await requireRole(['manager'])
  const { employeeId } = await params
  const { cycle: cycleId } = await searchParams
  const supabase = await createClient()

  const [empRes, kpiRes, reviewRes, appraisalRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', employeeId).single(),
    supabase.from('kpis').select('*').eq('cycle_id', cycleId).eq('employee_id', employeeId),
    supabase.from('reviews').select('*').eq('cycle_id', cycleId).eq('employee_id', employeeId).single(),
    supabase.from('appraisals').select('*').eq('cycle_id', cycleId).eq('employee_id', employeeId).single(),
  ])

  const employee = empRes.data as User
  const kpis = kpiRes.data as Kpi[] ?? []
  const review = reviewRes.data as Review | null
  const appraisal = appraisalRes.data as Appraisal | null

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Review: {employee?.full_name}</h1>

      {/* KPIs */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">KPIs</h2>
        {kpis.map(kpi => (
          <div key={kpi.id} className="rounded border p-3">
            <p className="font-medium">{kpi.title} ({kpi.weight}%)</p>
            {kpi.description && <p className="text-sm text-muted-foreground">{kpi.description}</p>}
          </div>
        ))}
      </section>

      {/* Employee Self Assessment */}
      {review && (
        <section className="rounded border bg-muted/30 p-4 space-y-2">
          <h2 className="text-lg font-semibold">Employee Self Assessment</h2>
          <p>Rating: <span className="font-bold">{review.self_rating}</span></p>
          <p className="whitespace-pre-wrap">{review.self_comments}</p>
        </section>
      )}

      {/* Manager Rating Form */}
      {!appraisal?.manager_submitted_at && (
        <form action={submitManagerRating} className="space-y-4 rounded border p-4">
          <h2 className="text-lg font-semibold">Your Rating</h2>
          <input type="hidden" name="cycle_id" value={cycleId} />
          <input type="hidden" name="employee_id" value={employeeId} />
          <div className="space-y-2">
            <Label htmlFor="manager_rating">Rating</Label>
            <select id="manager_rating" name="manager_rating" className="w-full rounded border p-2" required>
              <option value="">Select...</option>
              {RATING_TIERS.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="manager_comments">Comments</Label>
            <Textarea id="manager_comments" name="manager_comments" rows={5} required />
          </div>
          <Button type="submit">Submit Rating</Button>
        </form>
      )}

      {appraisal?.manager_submitted_at && (
        <p className="text-green-600 font-medium">Rating submitted: {appraisal.manager_rating}</p>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/ && git commit -m "feat: add manager review submission page with KPI and self-assessment display"
```

---

### Task 14: HRBP — Calibration Dashboard

**Files:**
- Create: `src/app/(dashboard)/hrbp/page.tsx`
- Create: `src/app/(dashboard)/hrbp/calibration/page.tsx`
- Create: `src/app/(dashboard)/hrbp/actions.ts`
- Create: `src/components/bell-curve-chart.tsx`

**Step 1: Create HRBP server actions**

Create `src/app/(dashboard)/hrbp/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { getPayoutMultiplier } from '@/lib/constants'
import type { RatingTier } from '@/lib/types'
import { revalidatePath } from 'next/cache'

export async function overrideRating(formData: FormData) {
  const user = await requireRole(['hrbp'])
  const supabase = await createClient()

  const appraisalId = formData.get('appraisal_id') as string
  const newRating = formData.get('final_rating') as RatingTier
  const justification = formData.get('justification') as string

  if (!justification?.trim()) throw new Error('Justification is required for rating overrides')

  // Get current appraisal
  const { data: appraisal } = await supabase
    .from('appraisals').select('*, cycles(sme_multiplier)').eq('id', appraisalId).single()

  if (!appraisal) throw new Error('Appraisal not found')

  const smeMultiplier = (appraisal as any).cycles?.sme_multiplier ?? 0
  const multiplier = getPayoutMultiplier(newRating, smeMultiplier)

  // Get employee variable pay
  const { data: employee } = await supabase
    .from('users').select('variable_pay').eq('id', appraisal.employee_id).single()

  const payoutAmount = (employee?.variable_pay ?? 0) * multiplier

  // Update appraisal
  await supabase.from('appraisals').update({
    final_rating: newRating,
    final_rating_set_by: user.id,
    payout_multiplier: multiplier,
    payout_amount: payoutAmount,
  }).eq('id', appraisalId)

  // Audit log
  await supabase.from('audit_logs').insert({
    cycle_id: appraisal.cycle_id,
    changed_by: user.id,
    action: 'rating_override',
    entity_type: 'appraisal',
    entity_id: appraisalId,
    old_value: { final_rating: appraisal.final_rating },
    new_value: { final_rating: newRating },
    justification,
  })

  revalidatePath('/hrbp/calibration')
}

export async function lockCycle(cycleId: string) {
  const user = await requireRole(['hrbp'])
  const supabase = await createClient()

  // Calculate payout for all appraisals that don't have it yet
  const { data: cycle } = await supabase.from('cycles').select('sme_multiplier').eq('id', cycleId).single()
  const { data: appraisals } = await supabase.from('appraisals').select('id, employee_id, final_rating, manager_rating').eq('cycle_id', cycleId)

  for (const a of appraisals ?? []) {
    const rating = (a.final_rating ?? a.manager_rating) as RatingTier
    if (!rating) continue
    const multiplier = getPayoutMultiplier(rating, cycle?.sme_multiplier ?? 0)
    const { data: emp } = await supabase.from('users').select('variable_pay').eq('id', a.employee_id).single()
    await supabase.from('appraisals').update({
      final_rating: rating,
      payout_multiplier: multiplier,
      payout_amount: (emp?.variable_pay ?? 0) * multiplier,
      locked_at: new Date().toISOString(),
    }).eq('id', a.id)
  }

  // Advance to locked
  await supabase.from('cycles').update({ status: 'locked', updated_at: new Date().toISOString() }).eq('id', cycleId)

  await supabase.from('audit_logs').insert({
    cycle_id: cycleId, changed_by: user.id, action: 'cycle_locked', entity_type: 'cycle', entity_id: cycleId, new_value: { status: 'locked' },
  })

  revalidatePath('/hrbp')
}

export async function publishCycle(cycleId: string) {
  const user = await requireRole(['hrbp'])
  const supabase = await createClient()

  await supabase.from('cycles').update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', cycleId)

  // Queue notifications for all active employees
  const { data: employees } = await supabase.from('users').select('id').eq('is_active', true)
  const notifications = (employees ?? []).map(e => ({
    recipient_id: e.id,
    type: 'cycle_published' as const,
    payload: { cycle_id: cycleId },
  }))
  if (notifications.length) await supabase.from('notifications').insert(notifications)

  await supabase.from('audit_logs').insert({
    cycle_id: cycleId, changed_by: user.id, action: 'cycle_published', entity_type: 'cycle', entity_id: cycleId, new_value: { status: 'published' },
  })

  revalidatePath('/hrbp')
}
```

**Step 2: Create bell curve chart component**

Create `src/components/bell-curve-chart.tsx`:
```tsx
'use client'

import { RATING_TIERS } from '@/lib/constants'
import type { RatingTier } from '@/lib/types'

interface Props {
  distribution: Record<RatingTier, number>
  total: number
}

export function BellCurveChart({ distribution, total }: Props) {
  const maxCount = Math.max(...Object.values(distribution), 1)

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Rating Distribution</h3>
      <div className="flex items-end gap-4 h-48">
        {RATING_TIERS.map(tier => {
          const count = distribution[tier.code] ?? 0
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0'
          const height = maxCount > 0 ? (count / maxCount) * 100 : 0
          return (
            <div key={tier.code} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs">{count} ({pct}%)</span>
              <div className="w-full bg-primary/20 rounded-t" style={{ height: `${height}%` }}>
                <div className="w-full h-full bg-primary rounded-t" />
              </div>
              <span className="text-xs font-medium">{tier.code}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 3: Build HRBP cycles overview page**

Replace `src/app/(dashboard)/hrbp/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { CycleStatusBadge } from '@/components/cycle-status-badge'
import Link from 'next/link'
import type { Cycle } from '@/lib/types'

export default async function HrbpPage() {
  await requireRole(['hrbp'])
  const supabase = await createClient()
  const { data: cycles } = await supabase.from('cycles').select('*').order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Review Cycles</h1>
      <div className="grid gap-4">
        {(cycles as Cycle[] ?? []).map(cycle => (
          <div key={cycle.id} className="flex items-center justify-between rounded border p-4">
            <div>
              <p className="font-medium">{cycle.name}</p>
              <CycleStatusBadge status={cycle.status} />
            </div>
            {['calibrating', 'locked'].includes(cycle.status) && (
              <Link href={`/hrbp/calibration?cycle=${cycle.id}`} className="text-blue-600 hover:underline">
                Calibrate
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 4: Build calibration page**

Create `src/app/(dashboard)/hrbp/calibration/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { BellCurveChart } from '@/components/bell-curve-chart'
import { overrideRating, lockCycle, publishCycle } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RATING_TIERS } from '@/lib/constants'
import type { RatingTier, Appraisal, Cycle } from '@/lib/types'

export default async function CalibrationPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const user = await requireRole(['hrbp'])
  const { cycle: cycleId } = await searchParams
  const supabase = await createClient()

  if (!cycleId) return <p>Select a cycle from the overview page.</p>

  const { data: cycle } = await supabase.from('cycles').select('*').eq('id', cycleId).single()
  const { data: appraisals } = await supabase
    .from('appraisals')
    .select('*, users!appraisals_employee_id_fkey(full_name, department)')
    .eq('cycle_id', cycleId)

  // Build distribution
  const distribution: Record<RatingTier, number> = { FEE: 0, EE: 0, ME: 0, SME: 0, BE: 0 }
  for (const a of appraisals ?? []) {
    const rating = (a as Appraisal).final_rating ?? (a as Appraisal).manager_rating
    if (rating) distribution[rating as RatingTier]++
  }

  const isCalibrating = (cycle as Cycle)?.status === 'calibrating'
  const isLocked = (cycle as Cycle)?.status === 'locked'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Calibration — {(cycle as Cycle)?.name}</h1>

      <BellCurveChart distribution={distribution} total={appraisals?.length ?? 0} />

      {/* Calibration table */}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Employee</th>
              <th className="p-3 text-left">Department</th>
              <th className="p-3 text-left">Manager Rating</th>
              <th className="p-3 text-left">Final Rating</th>
              {isCalibrating && <th className="p-3 text-left">Override</th>}
            </tr>
          </thead>
          <tbody>
            {(appraisals ?? []).map((a: any) => (
              <tr key={a.id} className="border-b">
                <td className="p-3">{a.users?.full_name}</td>
                <td className="p-3">{a.users?.department}</td>
                <td className="p-3">{a.manager_rating}</td>
                <td className="p-3 font-medium">{a.final_rating ?? a.manager_rating}</td>
                {isCalibrating && (
                  <td className="p-3">
                    <form action={overrideRating} className="flex gap-2">
                      <input type="hidden" name="appraisal_id" value={a.id} />
                      <select name="final_rating" className="rounded border px-2 py-1 text-sm">
                        {RATING_TIERS.map(t => <option key={t.code} value={t.code}>{t.code}</option>)}
                      </select>
                      <Input name="justification" placeholder="Justification" className="text-sm" required />
                      <Button size="sm" type="submit">Save</Button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cycle controls */}
      <div className="flex gap-3">
        {isCalibrating && (
          <form action={lockCycle.bind(null, cycleId!)}>
            <Button variant="destructive" type="submit">Lock Cycle</Button>
          </form>
        )}
        {isLocked && (
          <form action={publishCycle.bind(null, cycleId!)}>
            <Button type="submit">Publish Cycle</Button>
          </form>
        )}
      </div>
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add src/ && git commit -m "feat: add HRBP calibration dashboard with bell curve, rating override, lock/publish"
```

---

### Task 15: Payroll CSV Export

**Files:**
- Create: `src/app/api/payroll-export/route.ts`
- Test: `src/lib/__tests__/payroll-csv.test.ts`
- Create: `src/lib/payroll-csv.ts`

**Step 1: Write failing test for CSV generation**

Create `src/lib/__tests__/payroll-csv.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { generatePayrollCsv } from '@/lib/payroll-csv'

describe('generatePayrollCsv', () => {
  it('generates correct CSV headers and rows', () => {
    const data = [
      { zimyo_id: 'Z001', full_name: 'Alice', department: 'Eng', final_rating: 'EE', payout_multiplier: 1.1, payout_amount: 11000 },
      { zimyo_id: 'Z002', full_name: 'Bob', department: 'Sales', final_rating: 'ME', payout_multiplier: 1.0, payout_amount: 10000 },
    ]
    const csv = generatePayrollCsv(data)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('zimyo_employee_id,employee_name,department,final_rating,payout_multiplier,payout_amount')
    expect(lines[1]).toBe('Z001,Alice,Eng,EE,1.1,11000')
    expect(lines[2]).toBe('Z002,Bob,Sales,ME,1,10000')
  })

  it('handles empty data', () => {
    const csv = generatePayrollCsv([])
    expect(csv).toBe('zimyo_employee_id,employee_name,department,final_rating,payout_multiplier,payout_amount')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/payroll-csv.test.ts`
Expected: FAIL

**Step 3: Implement CSV generator**

Create `src/lib/payroll-csv.ts`:
```typescript
interface PayrollRow {
  zimyo_id: string
  full_name: string
  department: string
  final_rating: string
  payout_multiplier: number
  payout_amount: number
}

export function generatePayrollCsv(data: PayrollRow[]): string {
  const header = 'zimyo_employee_id,employee_name,department,final_rating,payout_multiplier,payout_amount'
  const rows = data.map(r =>
    `${r.zimyo_id},${r.full_name},${r.department},${r.final_rating},${r.payout_multiplier},${r.payout_amount}`
  )
  return [header, ...rows].join('\n')
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/payroll-csv.test.ts`
Expected: PASS

**Step 5: Create API route for CSV download**

Create `src/app/api/payroll-export/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { generatePayrollCsv } from '@/lib/payroll-csv'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  await requireRole(['hrbp', 'admin'])
  const { searchParams } = new URL(request.url)
  const cycleId = searchParams.get('cycle')
  if (!cycleId) return NextResponse.json({ error: 'cycle required' }, { status: 400 })

  const supabase = await createClient()

  // Verify cycle is locked or published
  const { data: cycle } = await supabase.from('cycles').select('status, name').eq('id', cycleId).single()
  if (!cycle || !['locked', 'published'].includes(cycle.status)) {
    return NextResponse.json({ error: 'Cycle must be locked or published' }, { status: 400 })
  }

  const { data: rows } = await supabase
    .from('appraisals')
    .select('final_rating, payout_multiplier, payout_amount, users!appraisals_employee_id_fkey(zimyo_id, full_name, department)')
    .eq('cycle_id', cycleId)

  const csvData = (rows ?? []).map((r: any) => ({
    zimyo_id: r.users.zimyo_id,
    full_name: r.users.full_name,
    department: r.users.department ?? '',
    final_rating: r.final_rating ?? '',
    payout_multiplier: r.payout_multiplier ?? 0,
    payout_amount: r.payout_amount ?? 0,
  }))

  const csv = generatePayrollCsv(csvData)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="payroll-${cycle.name}.csv"`,
    },
  })
}
```

**Step 6: Commit**

```bash
git add src/ && git commit -m "feat: add payroll CSV export endpoint with generation logic and tests"
```

---

### Task 16: Email Notifications (Edge Function)

**Files:**
- Create: `supabase/functions/notification-sender/index.ts`

**Step 1: Create notification sender edge function**

Create `supabase/functions/notification-sender/index.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TEMPLATES: Record<string, { subject: string; bodyFn: (payload: any) => string }> = {
  cycle_kpi_setting_open: {
    subject: 'KPI Setting is Open',
    bodyFn: (p) => `Hi, the KPI setting phase for ${p.cycle_name ?? 'the current cycle'} is now open. Please set KPIs for your direct reports.`,
  },
  cycle_self_review_open: {
    subject: 'Self Review is Open',
    bodyFn: (p) => `Hi, self-review for ${p.cycle_name ?? 'the current cycle'} is now open. Please submit your self-assessment.`,
  },
  cycle_manager_review_open: {
    subject: 'Manager Review is Open',
    bodyFn: (p) => `Hi, the manager review phase for ${p.cycle_name ?? 'the current cycle'} is now open. Please submit ratings for your direct reports.`,
  },
  cycle_published: {
    subject: 'Review Cycle Results Published',
    bodyFn: (p) => `Hi, the results for ${p.cycle_name ?? 'the current cycle'} have been published. Log in to view your final rating.`,
  },
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Get pending notifications (batch of 50)
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*, users!notifications_recipient_id_fkey(email, full_name)')
    .eq('status', 'pending')
    .limit(50)

  let sent = 0, failed = 0

  for (const n of notifications ?? []) {
    const template = TEMPLATES[n.type]
    if (!template) continue

    const email = (n as any).users?.email
    if (!email) continue

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'PMS <noreply@yourdomain.com>',
          to: [email],
          subject: template.subject,
          text: template.bodyFn(n.payload ?? {}),
        }),
      })

      if (res.ok) {
        await supabase.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', n.id)
        sent++
      } else {
        const errText = await res.text()
        await supabase.from('notifications').update({ status: 'failed', error_message: errText }).eq('id', n.id)
        failed++
      }
    } catch (err) {
      await supabase.from('notifications').update({ status: 'failed', error_message: String(err) }).eq('id', n.id)
      failed++
    }
  }

  return new Response(JSON.stringify({ sent, failed }), { headers: { 'Content-Type': 'application/json' } })
})
```

**Step 2: Commit**

```bash
git add supabase/functions/ && git commit -m "feat: add notification sender edge function with Resend email integration"
```

---

### Task 17: Audit Log Viewer & Employee History

**Files:**
- Create: `src/app/(dashboard)/admin/audit-log/page.tsx`
- Create: `src/app/(dashboard)/hrbp/audit-log/page.tsx`
- Create: `src/app/(dashboard)/employee/history/page.tsx`

**Step 1: Build audit log viewer (shared by admin and hrbp)**

Create `src/app/(dashboard)/admin/audit-log/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { AuditLog } from '@/lib/types'

export default async function AuditLogPage() {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*, users!audit_logs_changed_by_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Timestamp</th>
              <th className="p-3 text-left">User</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Entity</th>
              <th className="p-3 text-left">Justification</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((log: any) => (
              <tr key={log.id} className="border-b">
                <td className="p-3 text-xs">{new Date(log.created_at).toLocaleString()}</td>
                <td className="p-3">{log.users?.full_name ?? 'System'}</td>
                <td className="p-3 font-mono text-xs">{log.action}</td>
                <td className="p-3 text-xs">{log.entity_type}</td>
                <td className="p-3 text-xs">{log.justification ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

Create `src/app/(dashboard)/hrbp/audit-log/page.tsx` with identical content but `requireRole(['hrbp'])`.

**Step 2: Build employee history page**

Create `src/app/(dashboard)/employee/history/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { CycleStatusBadge } from '@/components/cycle-status-badge'
import type { Cycle, Appraisal } from '@/lib/types'

export default async function EmployeeHistoryPage() {
  const user = await requireRole(['employee'])
  const supabase = await createClient()

  // Get published cycles where employee has an appraisal
  const { data: appraisals } = await supabase
    .from('appraisals')
    .select('*, cycles(*)')
    .eq('employee_id', user.id)

  // Filter to only published cycles
  const published = (appraisals ?? []).filter((a: any) => a.cycles?.status === 'published')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My History</h1>
      {published.length === 0 && <p className="text-muted-foreground">No published reviews yet.</p>}
      <div className="grid gap-4">
        {published.map((a: any) => (
          <div key={a.id} className="rounded border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">{a.cycles?.name}</p>
              <CycleStatusBadge status="published" />
            </div>
            <p>Final Rating: <span className="font-bold">{a.final_rating}</span></p>
            <p>Payout: <span className="font-bold">{a.payout_multiplier ? `${(a.payout_multiplier * 100).toFixed(0)}%` : 'N/A'}</span></p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/ && git commit -m "feat: add audit log viewer and employee history page"
```

---

### Task 18: Root Page Redirect & Unauthorized Page

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/unauthorized/page.tsx`

**Step 1: Update root page to redirect by role**

Modify `src/app/page.tsx`:
```tsx
import { getCurrentUser, getRoleDashboardPath } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function Home() {
  const user = await getCurrentUser()
  redirect(getRoleDashboardPath(user.role))
}
```

**Step 2: Create unauthorized page**

Create `src/app/unauthorized/page.tsx`:
```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Access Denied</h1>
      <p className="text-muted-foreground">You do not have permission to view this page.</p>
      <Link href="/"><Button>Go Home</Button></Link>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/app/ && git commit -m "feat: add root redirect by role and unauthorized page"
```

---

### Task 19: CSV Upload Fallback (Admin)

**Files:**
- Create: `src/app/(dashboard)/admin/users/upload/page.tsx`
- Create: `src/app/(dashboard)/admin/users/upload/actions.ts`

**Step 1: Create CSV parsing action**

Create `src/app/(dashboard)/admin/users/upload/actions.ts`:
```typescript
'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function uploadUsersCsv(formData: FormData) {
  const user = await requireRole(['admin'])
  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')

  const text = await file.text()
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

  // Expected: zimyo_id, email, full_name, department, designation, manager_email
  const requiredCols = ['zimyo_id', 'email', 'full_name']
  for (const col of requiredCols) {
    if (!headers.includes(col)) throw new Error(`Missing required column: ${col}`)
  }

  const supabase = await createServiceClient()
  let added = 0, updated = 0

  const emailToId = new Map<string, string>()
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    rows.push(row)

    const userData = {
      zimyo_id: row.zimyo_id,
      email: row.email,
      full_name: row.full_name,
      department: row.department || null,
      designation: row.designation || null,
      synced_at: new Date().toISOString(),
    }

    const { data: existing } = await supabase.from('users').select('id').eq('zimyo_id', row.zimyo_id).single()

    if (existing) {
      await supabase.from('users').update(userData).eq('zimyo_id', row.zimyo_id)
      emailToId.set(row.email, existing.id)
      updated++
    } else {
      const { data: newUser } = await supabase.from('users').insert(userData).select('id').single()
      if (newUser) emailToId.set(row.email, newUser.id)
      added++
    }
  }

  // Resolve manager relationships
  for (const row of rows) {
    if (row.manager_email) {
      const managerId = emailToId.get(row.manager_email)
      if (managerId) {
        await supabase.from('users').update({ manager_id: managerId }).eq('zimyo_id', row.zimyo_id)
      }
    }
  }

  await supabase.from('audit_logs').insert({
    changed_by: user.id,
    action: 'csv_upload',
    entity_type: 'user',
    new_value: { added, updated },
  })

  revalidatePath('/admin/users')
  return { added, updated }
}
```

**Step 2: Create upload page**

Create `src/app/(dashboard)/admin/users/upload/page.tsx`:
```tsx
import { requireRole } from '@/lib/auth'
import { uploadUsersCsv } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function UploadUsersPage() {
  await requireRole(['admin'])

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Upload Users CSV</h1>
      <p className="text-sm text-muted-foreground">
        CSV columns: zimyo_id, email, full_name, department, designation, manager_email
      </p>
      <form action={uploadUsersCsv} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file">CSV File</Label>
          <Input id="file" name="file" type="file" accept=".csv" required />
        </div>
        <Button type="submit">Upload & Import</Button>
      </form>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/ && git commit -m "feat: add CSV upload fallback for admin user management"
```

---

### Task 20: Supabase Auth Custom Claims (JWT Hook)

**Files:**
- Create: `supabase/migrations/00005_auth_hook.sql`

**Step 1: Create JWT custom claims hook**

This SQL function runs on every token refresh and injects `user_role` and `user_id` into the JWT, which RLS policies read.

Create `supabase/migrations/00005_auth_hook.sql`:
```sql
-- Custom JWT claims hook: injects user_role and user_id from users table
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims jsonb;
  user_email text;
  user_record record;
BEGIN
  claims := event->'claims';
  user_email := claims->>'email';

  SELECT id, role INTO user_record
  FROM public.users
  WHERE email = user_email AND is_active = true
  LIMIT 1;

  IF user_record IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_record.role::text));
    claims := jsonb_set(claims, '{user_id}', to_jsonb(user_record.id::text));
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute to supabase_auth_admin
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revoke from public
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM public;
```

**Note:** After applying this migration, enable the hook in Supabase Dashboard > Authentication > Hooks > Custom Access Token Hook, pointing to `public.custom_access_token_hook`.

**Step 2: Apply migration**

Run: `npx supabase db reset`
Expected: All migrations applied successfully.

**Step 3: Commit**

```bash
git add supabase/ && git commit -m "feat: add custom JWT claims hook for RLS role injection"
```

---

## Execution Checklist

| # | Task | Key Deliverable |
|---|---|---|
| 1 | Project Scaffolding | Next.js + deps + Vitest |
| 2 | Database Schema | 7 tables, enums, indexes |
| 3 | RLS Policies | Role-based row security |
| 4 | Supabase Client & Middleware | Auth session management |
| 5 | Shared Types & Constants | TypeScript types, payout logic |
| 6 | Cycle State Machine | Transition rules + tests |
| 7 | Auth Helpers & Login | Magic link login |
| 8 | Layout Shell & Routing | Sidebar, role guards |
| 9 | Admin Cycle Management | Create/list/advance cycles |
| 10 | Admin User Management | Zimyo sync + user list |
| 11 | Manager KPI Setting | KPI CRUD for direct reports |
| 12 | Employee Self Review | Self-assessment form |
| 13 | Manager Review Submission | Rating + comments form |
| 14 | HRBP Calibration Dashboard | Bell curve, override, lock/publish |
| 15 | Payroll CSV Export | CSV download endpoint |
| 16 | Email Notifications | Edge function + Resend |
| 17 | Audit Log & Employee History | Log viewer + history page |
| 18 | Root Redirect & Unauthorized | Navigation polish |
| 19 | CSV Upload Fallback | Admin user import |
| 20 | Auth Custom Claims Hook | JWT role injection for RLS |
