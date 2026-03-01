# PMS v3 — Design Document
**Date:** 2026-03-02
**Status:** Approved

## Overview

Seven feature areas covering admin UX improvements, data model additions, and access control overhaul.

---

## Feature 1: Departments (first-class table)

### New tables

```sql
CREATE TABLE departments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE hrbp_departments (
  hrbp_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (hrbp_id, department_id)
);
```

### Changes to `users`

- Add `department_id uuid REFERENCES departments(id)` (nullable FK)
- Keep text `department` column temporarily; migration script populates `departments` table from distinct values and back-fills `department_id`; `department` text column dropped in same migration

### RLS changes (HRBP scoping)

All HRBP `SELECT` policies on `users`, `kpis`, `reviews`, `appraisals` change from:
```sql
public.user_role() IN ('hrbp', 'admin')
```
to:
```sql
public.user_role() = 'admin'
OR (
  public.user_role() = 'hrbp'
  AND EXISTS (
    SELECT 1 FROM hrbp_departments hd
    JOIN users u ON u.department_id = hd.department_id
    WHERE hd.hrbp_id = public.user_id()
    AND u.id = <employee_id_column>
  )
)
```

Admin retains full org-wide access. HRBP can only see employees in their assigned departments.

### Admin UI

- New `/admin/departments` page: list + create + rename + delete (delete blocked if users assigned)
- Departments dropdown replaces free-text department field throughout add/edit user forms

---

## Feature 2: Admin user add/edit

### New pages

**`/admin/users/new`** — Create user form:
- full_name (text, required)
- email (text, required)
- role (select: employee/manager/hrbp/admin)
- department (dropdown from departments table)
- designation (text)
- variable_pay (number)
- manager (searchable user dropdown, filtered to manager-role users)
- is_also_employee toggle (visible only when role = hrbp)
- On submit: creates `auth.users` via service client → inserts `public.users` → optionally sends magic link invite

**`/admin/users/[id]/edit`** — Same form pre-filled, plus:
- When role = hrbp: multi-select of departments this HRBP covers (reads/writes `hrbp_departments`)
- "Send magic link" button → `supabase.auth.admin.generateLink({ type: 'magiclink', email })`
- "Send password reset" button → `supabase.auth.admin.generateLink({ type: 'recovery', email })`
- Both auth actions use service client, write to audit_log

### New server actions (`/admin/users/actions.ts`)

| Action | Description |
|--------|-------------|
| `createUser(formData)` | Creates auth.users + public.users + optional magic link |
| `updateUser(userId, formData)` | Updates all user fields + upserts hrbp_departments if hrbp |
| `sendMagicLink(userId)` | Generates magic link, sends via Supabase Auth |
| `sendPasswordReset(userId)` | Generates recovery link, sends via Supabase Auth |
| `createDepartment(name)` | Inserts into departments table |
| `deleteDepartment(id)` | Deletes if no users assigned; rejects otherwise |
| `renameDepartment(id, name)` | Updates department name |

---

## Feature 3: HRBP self-review (`is_also_employee`)

### Schema

Add to `users`:
```sql
is_also_employee boolean NOT NULL DEFAULT false
```

### RLS change

`reviews` INSERT/UPDATE policy (currently `role = 'employee'`) expands to:
```sql
(public.user_role() = 'employee' AND employee_id = public.user_id() AND <cycle check>)
OR
(public.user_role() = 'hrbp'
  AND employee_id = public.user_id()
  AND EXISTS (SELECT 1 FROM users WHERE id = public.user_id() AND is_also_employee = true)
  AND <cycle check>)
```

### New page: `/hrbp/my-review`

Mirrors `/manager/my-review`. Shows:
- Current cycle self-review form (rating + comments) if cycle is in `self_review` or later
- Auto-save draft + submit button (reuses existing employee actions)
- Read-only view with final rating + payout after cycle is `published`

### Sidebar

- `is_also_employee` fetched in dashboard layout alongside `userName`
- Passed as prop to `Sidebar`
- HRBP nav: "My Review" link added conditionally when `isAlsoEmployee = true`

---

## Feature 4: Editable payout multipliers

### New table

```sql
CREATE TABLE payout_config (
  rating_tier  rating_tier PRIMARY KEY,  -- FEE, EE, ME, SME, BE
  multiplier   numeric NOT NULL,
  updated_by   uuid REFERENCES users(id),
  updated_at   timestamptz DEFAULT now()
);

-- Seed defaults
INSERT INTO payout_config VALUES
  ('FEE', 1.25, NULL, now()),
  ('EE',  1.10, NULL, now()),
  ('ME',  1.00, NULL, now()),
  ('SME', 1.00, NULL, now()),  -- base; sme_multiplier added on top per cycle
  ('BE',  0.00, NULL, now());
```

### Changes to `cycles`

Add optional per-cycle overrides (null = use payout_config global):
```sql
fee_multiplier numeric,  -- overrides payout_config for this cycle
ee_multiplier  numeric,
me_multiplier  numeric,
-- sme_multiplier already exists
-- be is always 0; no override needed
```

### `bulk_lock_appraisals()` update

Replace hardcoded CASE values with:
```sql
COALESCE(c.fee_multiplier, (SELECT multiplier FROM payout_config WHERE rating_tier = 'FEE'))
COALESCE(c.ee_multiplier,  (SELECT multiplier FROM payout_config WHERE rating_tier = 'EE'))
COALESCE(c.me_multiplier,  (SELECT multiplier FROM payout_config WHERE rating_tier = 'ME'))
```

### Admin UI: `/admin/payout-config`

Table showing all 5 tiers with inline-editable multiplier values. Save writes to `payout_config` and audit_log. A notice warns: "Changes apply to future cycle locks only. Locked cycles are unaffected."

Cycle create/edit forms (`/admin/cycles/new`, `/admin/cycles/[id]`) gain optional override fields for FEE, EE, ME with placeholder showing current global default.

---

## Feature 5: Payout visibility for admin and HRBP

### `/hrbp/calibration`

Once cycle status is `locked` or `published`:
- Add `payout_multiplier` column
- Add `payout_amount` column (formatted as ₹X,XX,XXX)
- Add total row at bottom summing payout_amount

### `/admin/cycles/[id]`

Once cycle is `locked` or `published`:
- Show per-employee payout table: Employee | Department | Final Rating | Payout Multiplier | Payout Amount
- Show total budget used vs budget (if `total_budget` is set on cycle)

---

## Feature 6: Audit log expansion

### New audit events written from server actions

| Action key | Triggered by |
|---|---|
| `review_submitted` | Employee/HRBP submits self-review |
| `kpi_added` | Manager adds KPI |
| `kpi_deleted` | Manager deletes KPI |
| `cycle_status_changed` | Admin advances cycle stage |
| `user_created` | Admin creates user |
| `user_updated` | Admin edits user |
| `payout_config_updated` | Admin changes a multiplier |
| `department_created` | Admin creates department |
| `hrbp_departments_updated` | Admin changes HRBP dept assignments |
| `magic_link_sent` | Admin sends magic link |
| `password_reset_sent` | Admin sends password reset |

### UI changes to `AuditLogTable`

- Add action-type filter chips above the table (All / User Management / Cycle / Reviews / Config)
- Each chip filters the visible rows client-side
- `old_value` / `new_value` JSON rendered as a readable diff where present

---

## Feature 7: Docs accessible to all roles

### Change

`/docs/layout.tsx`: change `requireRole(['admin', 'hrbp'])` → `requireRole(['admin', 'hrbp', 'manager', 'employee'])`

### Sidebar

Add `{ label: 'Docs', href: '/docs' }` to `employee` and `manager` nav arrays in `sidebar.tsx`

---

## Migration strategy

Single migration file `00018_pms_v3.sql` covering:
1. Create `departments` table
2. Populate departments from distinct `users.department` values
3. Add `department_id` FK to users, back-fill from text values
4. Drop `users.department` text column
5. Create `hrbp_departments` table
6. Add `is_also_employee` to users
7. Create `payout_config` table + seed defaults
8. Add `fee_multiplier`, `ee_multiplier`, `me_multiplier` to cycles
9. Replace `bulk_lock_appraisals()` function with payout_config-aware version
10. Update all affected RLS policies (HRBP scoping + reviews HRBP insert)
11. Add RLS on new tables (departments: all read / admin write; hrbp_departments: hrbp read own / admin all; payout_config: all read / admin write)

---

## Affected files summary

### New files
- `supabase/migrations/00018_pms_v3.sql`
- `src/app/(dashboard)/admin/users/new/page.tsx`
- `src/app/(dashboard)/admin/users/[id]/edit/page.tsx`
- `src/app/(dashboard)/admin/departments/page.tsx`
- `src/app/(dashboard)/admin/departments/actions.ts`
- `src/app/(dashboard)/admin/payout-config/page.tsx`
- `src/app/(dashboard)/admin/payout-config/actions.ts`
- `src/app/(dashboard)/hrbp/my-review/page.tsx`

### Modified files
- `src/components/sidebar.tsx` — conditional My Review for HRBP, Docs for employee/manager
- `src/app/(dashboard)/layout.tsx` — pass `isAlsoEmployee` to Sidebar
- `src/app/(dashboard)/admin/users/actions.ts` — add createUser, updateUser, sendMagicLink, sendPasswordReset, department CRUD
- `src/app/(dashboard)/admin/users/page.tsx` — add "New User" button linking to /admin/users/new
- `src/app/(dashboard)/admin/users/users-table.tsx` — add "Edit" link per row
- `src/app/(dashboard)/admin/cycles/new/page.tsx` — add per-cycle multiplier fields
- `src/app/(dashboard)/admin/cycles/[id]/page.tsx` — add payout table when locked/published
- `src/app/(dashboard)/hrbp/calibration/page.tsx` — add payout columns when locked/published
- `src/components/audit-log-table.tsx` — add action filter chips
- `src/app/(dashboard)/docs/layout.tsx` — open to all roles
- `src/lib/types.ts` — add Department, PayoutConfig, HrbpDepartment types
- `src/lib/constants.ts` — remove hardcoded RATING_TIERS multipliers (now from DB)
- `docs/APPLICATION.md` — update to reflect v3 schema
