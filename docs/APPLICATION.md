# PMS — Performance Management System

A full-stack web application for managing employee performance review cycles, KPI tracking, ratings, and variable pay payouts across an organisation.

---

## Table of Contents

1. [What Is This App?](#1-what-is-this-app)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Database Schema](#4-database-schema)
5. [Enums & Constants](#5-enums--constants)
6. [User Roles](#6-user-roles)
7. [The Cycle Lifecycle](#7-the-cycle-lifecycle)
8. [User Flows by Role](#8-user-flows-by-role)
9. [Business Logic & Calculations](#9-business-logic--calculations)
10. [Server Actions Reference](#10-server-actions-reference)
11. [API Routes](#11-api-routes)
12. [Auth & Security](#12-auth--security)
13. [Feature Flags](#13-feature-flags)
14. [Key Files Reference](#14-key-files-reference)

---

## 1. What Is This App?

PMS is a **performance review and payout management system** used by HR, managers, and employees within an organisation. Each quarter (or at a chosen cadence), a *review cycle* is created and progresses through a pipeline:

1. Managers set KPIs for their direct reports
2. Employees write self-reviews
3. Managers submit ratings
4. HR calibrates and finalises ratings
5. Payouts are calculated and published

The system enforces role-based access at every step — employees can't see manager ratings until the cycle is published, managers can't alter HRBP overrides, etc. All changes are immutably logged to an audit trail.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.1.6 (App Router, Turbopack), React, TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui component library |
| Backend | Next.js Server Actions + API Routes |
| Database | PostgreSQL 17 via Supabase (cloud) |
| Auth | Supabase Auth (magic link + password + Google OAuth restricted to @embglobal.com) |
| Security | Row Level Security (RLS) — 28 policies enforced in the database |
| HR Integration | Zimyo HR API — employee sync |
| Testing | Vitest — unit tests for all lib functions |
| UI Extras | Sonner (toasts), Joyride (onboarding tours), cmdk (command palette) |

---

## 3. Architecture Overview

```
Browser
  └── Next.js App Router (src/app/)
        ├── Server Components — data fetching via Supabase SSR client
        ├── Server Actions   — all mutations (src/app/**/actions.ts)
        ├── Client Components — forms, interactive UI
        └── API Routes       — /api/payroll-export (CSV download)

Database (Supabase / PostgreSQL)
  ├── 12 tables with RLS enabled on all
  ├── 6 RPC functions (bulk operations, template apply, feature flag resolve)
  ├── Custom JWT hook — injects user_role + user_id into every access token
  └── Trigger functions — KPI weight validation, updated_at, variable_pay snapshot
```

**Key convention:** The app never uses service-role access from the client. All privileged mutations happen in Server Actions, which use the SSR client (inheriting the user's JWT), or the service client where RLS must be bypassed (e.g., audit log writes).

---

## 4. Database Schema

### `users` — [`supabase/migrations/00002_create_tables.sql`](../supabase/migrations/00002_create_tables.sql)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | Matches auth.users.id |
| email | text unique | |
| full_name | text | |
| role | user_role | employee / manager / hrbp / admin |
| department | text | |
| designation | text | |
| manager_id | uuid FK→users | Self-referencing hierarchy |
| variable_pay | numeric | Annual variable pay in INR — used for payout calculations |
| is_active | boolean | Soft delete — inactive users blocked by RLS |
| zimyo_id | text unique nullable | External HR system ID |
| data_source | text | manual / zimyo / google |
| synced_at | timestamptz | Last Zimyo sync timestamp |

### `cycles` — [`supabase/migrations/00002_create_tables.sql`](../supabase/migrations/00002_create_tables.sql)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | e.g. "Annual Review FY2025-Q1" |
| quarter | text | Q1/Q2/Q3/Q4 |
| year | int | |
| status | cycle_status | See [Cycle Lifecycle](#7-the-cycle-lifecycle) |
| kpi_setting_deadline | date | Deadline for managers to set KPIs |
| self_review_deadline | date | Deadline for employees to submit |
| manager_review_deadline | date | Deadline for managers to rate |
| calibration_deadline | date | Deadline for HRBP calibration |
| published_at | timestamptz | When HRBP published the cycle |
| sme_multiplier | numeric | Extra multiplier added for SME rating |
| business_multiplier | numeric | Org-wide performance factor applied to all payouts |
| total_budget | numeric | Optional total payout budget |
| budget_currency | text | Default INR |
| created_by | uuid FK→users | |

### `kpis` — [`supabase/migrations/00002_create_tables.sql`](../supabase/migrations/00002_create_tables.sql)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cycle_id | uuid FK | |
| employee_id | uuid FK→users | The employee being assessed |
| manager_id | uuid FK→users | The manager who set this KPI |
| title | text | e.g. "Delivery Quality" |
| description | text | |
| weight | numeric | % weight; all KPIs for one employee must sum ≤ 100 |

### `reviews` — [`supabase/migrations/00002_create_tables.sql`](../supabase/migrations/00002_create_tables.sql)

One row per employee per cycle. Employees fill this in during self_review stage.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cycle_id | uuid FK | |
| employee_id | uuid FK→users | |
| self_rating | rating_tier | FEE/EE/ME/SME/BE |
| self_comments | text | Free-text justification |
| status | review_status | draft / submitted |
| submitted_at | timestamptz | Null if still draft |
| UNIQUE | (cycle_id, employee_id) | One review per employee per cycle |

### `appraisals` — [`supabase/migrations/00002_create_tables.sql`](../supabase/migrations/00002_create_tables.sql)

One row per employee per cycle. Manager fills in rating; HRBP may override; system locks and calculates payout.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cycle_id | uuid FK | |
| employee_id | uuid FK→users | |
| manager_id | uuid FK→users | |
| manager_rating | rating_tier | Set by manager during manager_review stage |
| manager_comments | text | |
| manager_submitted_at | timestamptz | |
| final_rating | rating_tier | Set by HRBP override, or equals manager_rating on lock |
| final_rating_set_by | uuid FK→users | HRBP user who overrode |
| is_final | boolean | True = HRBP has overridden; blocks bulk_lock from overwriting |
| payout_multiplier | numeric | Computed: rating_multiplier × business_multiplier |
| payout_amount | numeric | variable_pay × payout_multiplier |
| snapshotted_variable_pay | numeric | Auto-set by trigger on INSERT from users.variable_pay |
| locked_at | timestamptz | Set when cycle is locked |
| UNIQUE | (cycle_id, employee_id) | One appraisal per employee per cycle |

### `audit_logs` — [`supabase/migrations/00002_create_tables.sql`](../supabase/migrations/00002_create_tables.sql)

Immutable. INSERT only via RLS.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cycle_id | uuid FK nullable | |
| changed_by | uuid FK→users | Who made the change |
| action | text | e.g. "override_rating", "lock_cycle" |
| entity_type | text | e.g. "appraisal", "cycle" |
| entity_id | uuid | |
| old_value | jsonb | Before state |
| new_value | jsonb | After state |
| justification | text | Required for HRBP overrides |
| created_at | timestamptz | |

### `notifications` — [`supabase/migrations/00002_create_tables.sql`](../supabase/migrations/00002_create_tables.sql)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| recipient_id | uuid FK→users | Target user |
| type | notification_type | See enums |
| payload | jsonb | Extra data (cycle name, link, etc.) |
| status | notification_status | pending / sent / failed |
| snoozed_until | timestamptz | User can snooze; hides until this time |
| dismissed_at | timestamptz | Permanently dismissed |
| sent_at | timestamptz | |
| error_message | text | If status=failed |

### `kpi_templates` — [`supabase/migrations/00009_kpi_templates.sql`](../supabase/migrations/00009_kpi_templates.sql)

Pre-built KPI templates that managers can apply to employees by role.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| role_slug | text | e.g. software_engineer, senior_engineer, manager |
| title | text | KPI title |
| description | text | |
| weight | numeric | Suggested weight |
| category | text | performance / behaviour / learning |
| is_active | boolean | Inactive templates hidden from pickers |
| sort_order | int | Display order |

### `feature_flags` + `feature_flag_overrides` — [`supabase/migrations/00014_feature_flags.sql`](../supabase/migrations/00014_feature_flags.sql)

Controls rollout of optional features. See [Feature Flags](#13-feature-flags).

### `drafts` — [`supabase/migrations/00015_drafts_and_notifications.sql`](../supabase/migrations/00015_drafts_and_notifications.sql)

Auto-saved form state. One draft per (user, entity_type, entity_id).

### `notification_preferences` — [`supabase/migrations/00015_drafts_and_notifications.sql`](../supabase/migrations/00015_drafts_and_notifications.sql)

Per-user opt-in/out of notification types (email + in-app).

---

## 5. Enums & Constants

### Database Enums — [`supabase/migrations/00001_create_enums.sql`](../supabase/migrations/00001_create_enums.sql)

```sql
user_role:         employee | manager | hrbp | admin
cycle_status:      draft | kpi_setting | self_review | manager_review | calibrating | locked | published
rating_tier:       FEE | EE | ME | SME | BE
review_status:     draft | submitted
notification_type: cycle_kpi_setting_open | cycle_self_review_open | cycle_manager_review_open
                   cycle_published | review_submitted | manager_review_submitted
                   admin_message | review_reminder
notification_status: pending | sent | failed
```

### Rating Tier Labels — [`src/lib/constants.ts`](../src/lib/constants.ts)

| Tier | Label | Payout Multiplier | Notes |
|------|-------|-------------------|-------|
| FEE | Far Exceeded Expectations | ×1.25 | Highest fixed band |
| EE | Exceeded Expectations | ×1.10 | |
| ME | Met Expectations | ×1.00 | Target band |
| SME | Significantly Met Expectations | ×(1.0 + sme_multiplier) | Dynamic — set per cycle |
| BE | Below Expectations | ×0 | No variable payout |

---

## 6. User Roles

### Employee
- Can see their own KPIs and reviews
- Can submit a self-review during `self_review` stage
- Can auto-save drafts at any time
- Can see their final rating and payout only after cycle is `published`

### Manager
- Can see all their direct reports
- Can set/edit KPIs during `kpi_setting` stage (can also copy from previous cycle or apply templates)
- Can submit manager ratings during `manager_review` stage
- Can also submit their own self-review as an employee

### HRBP (HR Business Partner)
- Can see all employees across all cycles
- Can override any manager rating during `calibrating` stage (requires justification — logged to audit trail)
- Can lock a cycle (triggers `bulk_lock_appraisals` RPC)
- Can publish a cycle (makes results visible to employees)
- Can view full audit log

### Admin
- Full access to everything
- Creates and manages cycles (sets deadlines, multipliers, budget)
- Manages users (inline role + status editing, CSV upload, Zimyo sync trigger)
- Manages KPI templates
- Sends manual notifications (individual / role / department / everyone)
- Manages feature flags
- Views full audit log

---

## 7. The Cycle Lifecycle

### Stage Flow — [`src/lib/cycle-machine.ts`](../src/lib/cycle-machine.ts)

```
draft
  │  Admin creates cycle, sets deadlines & multipliers
  ▼
kpi_setting
  │  Managers set KPIs for their direct reports
  ▼
self_review
  │  Employees submit self-reviews
  ▼
manager_review
  │  Managers submit ratings for each employee
  ▼
calibrating
  │  HRBP reviews distribution, optionally overrides ratings (with justification)
  ▼
locked
  │  HRBP locks cycle → bulk_lock_appraisals() RPC runs:
  │    - Copies manager_rating → final_rating (for non-overridden rows)
  │    - Calculates payout_multiplier and payout_amount
  │    - Sets locked_at timestamp
  ▼
published
     HRBP publishes → employees can now see their rating and payout
```

### Stage Transition Rules — [`src/lib/cycle-machine.ts`](../src/lib/cycle-machine.ts)

| From | To | Who can trigger | Requirements |
|------|----|----------------|--------------|
| draft | kpi_setting | admin | — |
| kpi_setting | self_review | admin | — |
| self_review | manager_review | admin | — |
| manager_review | calibrating | admin | — |
| calibrating | locked | hrbp | — |
| locked | published | hrbp | — |

Only forward transitions are allowed. Status can never go backwards.

### What Happens at Lock — [`supabase/migrations/00006_integrity_and_indexes.sql`](../supabase/migrations/00006_integrity_and_indexes.sql) `bulk_lock_appraisals()`

```sql
-- For every appraisal in the cycle where is_final = false:
final_rating       = COALESCE(final_rating, manager_rating)
payout_multiplier  = rating_multiplier × business_multiplier
payout_amount      = snapshotted_variable_pay × payout_multiplier
locked_at          = now()
```

Rows where `is_final = true` (HRBP overrides) are **skipped** — their values are already set correctly.

---

## 8. User Flows by Role

### Employee Flow

```
Login → /employee
  ├── See current cycle stage banner and deadlines
  ├── View KPIs set by manager (visible from kpi_setting onwards)
  ├── [self_review stage] Fill and submit self-review form
  │     - Auto-saves draft every 500ms (use-auto-save hook)
  │     - Submit locks in self_rating + self_comments
  ├── [any stage] View past cycles → /employee/history
  │     - Historical final ratings and payout amounts
  └── [published stage] See final rating, payout multiplier, payout amount
```

### Manager Flow

```
Login → /manager
  ├── See team members list
  ├── [kpi_setting stage] → /manager/[employeeId]/kpis
  │     - Add KPIs manually (title, description, weight)
  │     - Apply KPI template by role slug
  │     - Copy KPIs from previous cycle
  │     - KPI weights auto-validated (sum must not exceed 100%)
  ├── [manager_review stage] → /manager/[employeeId]/review
  │     - See employee's submitted self-review
  │     - Select manager_rating (FEE/EE/ME/SME/BE)
  │     - Write manager_comments
  │     - Auto-save draft; submit when ready
  └── Also fills own self-review → /manager/my-review
```

### HRBP Flow

```
Login → /hrbp
  ├── See all cycles overview with current status
  ├── Send reminders (self-review / manager-review) per cycle
  ├── [calibrating stage] → /hrbp/calibration
  │     - Bell curve chart showing rating distribution
  │     - Override any rating (select new rating + required justification)
  │     - Override is logged to audit_log + sets is_final=true
  ├── Lock cycle (runs bulk_lock_appraisals RPC)
  ├── Publish cycle (employees can now see results)
  └── View audit log → /hrbp/audit-log
```

### Admin Flow

```
Login → /admin
  ├── /admin/cycles
  │     - Create cycle with deadlines, sme_multiplier, business_multiplier, budget
  │     - Advance cycle status (draft → kpi_setting → ... → calibrating)
  │     - Send per-cycle notifications
  ├── /admin/users
  │     - View all users with inline role/status editing
  │     - Upload CSV for bulk import
  │     - Trigger Zimyo sync (upserts employees, deactivates removed)
  ├── /admin/kpi-templates
  │     - Create/edit KPI templates by role slug
  │     - Toggle active/inactive (hides from manager picker)
  ├── /admin/notifications
  │     - Send manual notification to: individual user, role, department, everyone
  │     - Notification history table
  ├── /admin/feature-flags
  │     - Toggle flags at org / role / user scope
  └── /admin/audit-log
        - Full paginated audit log across all cycles
```

---

## 9. Business Logic & Calculations

### Payout Calculation — [`src/lib/constants.ts`](../src/lib/constants.ts) + [`supabase/migrations/00012_budget_fields.sql`](../supabase/migrations/00012_budget_fields.sql)

```
payout_amount = snapshotted_variable_pay × payout_multiplier

where:
  payout_multiplier = rating_multiplier × business_multiplier

  rating_multiplier:
    FEE → 1.25
    EE  → 1.10
    ME  → 1.00
    SME → 1.00 + cycle.sme_multiplier   (e.g. 1.25 if sme_multiplier=0.25)
    BE  → 0.00

  business_multiplier: set per cycle (e.g. 0.9 in a tough year, 1.1 in a great year)
```

**Example** (Q1 FY2025, business_multiplier=0.9):
- Bob, EE, variable_pay=₹80,000 → 80,000 × 1.10 × 0.9 = **₹79,200**
- Eve, FEE, variable_pay=₹72,000 → 72,000 × 1.25 × 0.9 = **₹81,000**
- Henry, BE, variable_pay=₹65,000 → 65,000 × 0 = **₹0**

The `snapshotted_variable_pay` is captured at the time the appraisal row is inserted (via DB trigger), so if an employee's variable_pay changes mid-cycle it doesn't affect the current cycle's calculation.

### KPI Weight Validation — [`supabase/migrations/00006_integrity_and_indexes.sql`](../supabase/migrations/00006_integrity_and_indexes.sql)

A BEFORE INSERT/UPDATE trigger `check_kpi_weight_sum()` runs on every KPI write:

```sql
SELECT SUM(weight) FROM kpis
WHERE cycle_id = NEW.cycle_id AND employee_id = NEW.employee_id AND id != NEW.id;

IF total + NEW.weight > 100 THEN
  RAISE EXCEPTION 'Total KPI weight would exceed 100%%';
END IF;
```

This is enforced at the DB level — the frontend also validates but the DB is the source of truth.

### HRBP Rating Override — [`src/app/(dashboard)/hrbp/actions.ts`](../src/app/(dashboard)/hrbp/actions.ts)

When HRBP overrides a rating:
1. Updates `appraisals.final_rating` to the new value
2. Sets `appraisals.final_rating_set_by` = HRBP's user ID
3. Sets `appraisals.is_final = true` (protects from bulk_lock overwrite)
4. Writes to `audit_logs` with `old_value`, `new_value`, and `justification` (required)

### Cycle Lock — [`supabase/migrations/00006_integrity_and_indexes.sql`](../supabase/migrations/00006_integrity_and_indexes.sql) `bulk_lock_appraisals()`

Single `UPDATE ... FROM users` query — no N+1. Skips rows where `is_final = true`.

### Zimyo Sync — [`src/lib/zimyo.ts`](../src/lib/zimyo.ts) + [`src/app/(dashboard)/admin/users/actions.ts`](../src/app/(dashboard)/admin/users/actions.ts)

1. Fetch employees from Zimyo API → `transformZimyoEmployee()` normalises fields
2. Upsert each employee by `zimyo_id` (INSERT or UPDATE)
3. Build `zimyo_ids[]` + `manager_ids[]` arrays → call `bulk_update_manager_links()` RPC (single query)
4. SET `is_active = false` for users in DB but absent from Zimyo response
5. Log each change to `audit_logs`

### Feature Flag Resolution — [`supabase/migrations/00014_feature_flags.sql`](../supabase/migrations/00014_feature_flags.sql) `resolve_feature_flag()`

```
user-level override  (most specific)
  ↓ if none
role-level override
  ↓ if none
org-level override
  ↓ if none
default_value        (fallback)
```

---

## 10. Server Actions Reference

All mutations go through Next.js Server Actions. Return type is `ActionResult<T>` — `{data?, error?}`.

### Admin Cycles — [`src/app/(dashboard)/admin/actions.ts`](../src/app/(dashboard)/admin/actions.ts)

| Function | Description |
|----------|-------------|
| `createCycle(formData)` | Creates a new cycle row with deadlines and multipliers |
| `advanceCycleStatus(cycleId, currentStatus)` | Transitions cycle to the next status stage |

### Admin Cycle Detail — [`src/app/(dashboard)/admin/cycles/[id]/actions.ts`](../src/app/(dashboard)/admin/cycles/[id]/actions.ts)

| Function | Description |
|----------|-------------|
| `sendSelfReviewReminders(cycleId)` | Creates notifications for employees with pending self-reviews |
| `sendManagerReviewReminders(cycleId)` | Creates notifications for managers with pending ratings |

### Admin Users — [`src/app/(dashboard)/admin/users/actions.ts`](../src/app/(dashboard)/admin/users/actions.ts)

| Function | Description |
|----------|-------------|
| `triggerZimyoSync()` | Full Zimyo sync: fetch, upsert, deactivate, update manager links |
| `updateUserRole(userId, role)` | Inline role change |
| `updateUserStatus(userId, isActive)` | Soft-activate / soft-deactivate a user |

### Admin Users Upload — [`src/app/(dashboard)/admin/users/upload/actions.ts`](../src/app/(dashboard)/admin/users/upload/actions.ts)

| Function | Description |
|----------|-------------|
| `uploadUsersCsv(formData)` | Parses CSV (via `src/lib/csv.ts`), bulk-inserts users |

### Admin Notifications — [`src/app/(dashboard)/admin/notifications/actions.ts`](../src/app/(dashboard)/admin/notifications/actions.ts)

| Function | Description |
|----------|-------------|
| `sendManualNotification(formData)` | Sends to individual / role / department / everyone |

### Admin KPI Templates — [`src/app/(dashboard)/admin/kpi-templates/actions.ts`](../src/app/(dashboard)/admin/kpi-templates/actions.ts)

| Function | Description |
|----------|-------------|
| `createTemplate(formData)` | Creates a new KPI template row |
| `updateTemplate(templateId, formData)` | Edits existing template |
| `toggleTemplateActive(templateId, isActive)` | Shows/hides template from manager picker |

### Employee — [`src/app/(dashboard)/employee/actions.ts`](../src/app/(dashboard)/employee/actions.ts)

| Function | Description |
|----------|-------------|
| `submitSelfReview(formData)` | Upserts review row, sets status=submitted |
| `saveDraftReview(formData)` | Upserts review row, keeps status=draft |

### Manager — [`src/app/(dashboard)/manager/actions.ts`](../src/app/(dashboard)/manager/actions.ts)

| Function | Description |
|----------|-------------|
| `addKpi(formData)` | Inserts a KPI row (triggers weight check) |
| `deleteKpi(kpiId, employeeId)` | Deletes KPI after verifying manager owns it |
| `submitManagerRating(formData)` | Upserts appraisal row with manager_rating, sets submitted_at |
| `saveDraftManagerRating(formData)` | Upserts appraisal without submitted_at |
| `copyKpisFromPreviousCycle(employeeId, cycleId)` | Copies KPI titles/weights from the immediately prior cycle |

### Manager Templates — [`src/app/(dashboard)/manager/template-actions.ts`](../src/app/(dashboard)/manager/template-actions.ts)

| Function | Description |
|----------|-------------|
| `applyTemplateToEmployee(employeeId, cycleId, roleSlug)` | Calls `apply_kpi_template()` RPC — inserts matching templates as KPIs |

### HRBP — [`src/app/(dashboard)/hrbp/actions.ts`](../src/app/(dashboard)/hrbp/actions.ts)

| Function | Description |
|----------|-------------|
| `overrideRating(formData)` | Sets final_rating, is_final=true, writes audit log with justification |
| `lockCycle(cycleId)` | Calls `bulk_lock_appraisals()` RPC, advances status to locked |
| `publishCycle(cycleId)` | Sets status=published, sets published_at |

### Notifications (user self-service) — [`src/app/(dashboard)/actions/notifications.ts`](../src/app/(dashboard)/actions/notifications.ts)

| Function | Description |
|----------|-------------|
| `snoozeNotification(notificationId, hours)` | Sets snoozed_until = now() + hours |
| `dismissNotification(notificationId)` | Sets dismissed_at = now() |

### Drafts — [`src/app/(dashboard)/actions/drafts.ts`](../src/app/(dashboard)/actions/drafts.ts)

| Function | Description |
|----------|-------------|
| `saveDraft(entityType, entityId, formData)` | Upserts draft row with form JSON |
| `deleteDraft(entityType, entityId)` | Removes draft after successful submit |

---

## 11. API Routes

### `GET /api/payroll-export` — [`src/app/api/payroll-export/route.ts`](../src/app/api/payroll-export/route.ts)

Returns a CSV file for Zimyo payroll import. Requires hrbp or admin role.

**Query params:** `?cycleId=<uuid>`

**CSV columns:**
```
zimyo_employee_id, employee_name, department, final_rating, payout_multiplier, payout_amount
```

Built by `generatePayrollCsv()` in [`src/lib/payroll-csv.ts`](../src/lib/payroll-csv.ts).

---

## 12. Auth & Security

### Authentication — [`supabase/migrations/00005_auth_hook.sql`](../supabase/migrations/00005_auth_hook.sql)

- Login: email + password or magic link via Supabase Auth
- Google OAuth: restricted to `@embglobal.com` via `before_user_created_hook`
- On every login, `custom_access_token_hook` runs:
  1. Looks up `users` table by `auth.uid()`
  2. Injects `user_role` and `user_id` into the JWT `app_metadata`
- All server code reads role from JWT — no extra DB round-trip

### Session Handling

- **`src/proxy.ts`** — Next.js 16 proxy (replaces `middleware.ts`) — refreshes Supabase session cookies on each request
- **`src/lib/supabase/server.ts`** — SSR client with cookie-based session
- **`src/lib/auth.ts`** — `requireRole(roles[])` — server-side guard used in every page and action

### Row Level Security — [`supabase/migrations/00004_rls_policies.sql`](../supabase/migrations/00004_rls_policies.sql) + [`00013_is_active_rls.sql`](../supabase/migrations/00013_is_active_rls.sql)

28 policies enforce three layers of access control:

1. **Role layer** — which roles can read/write which tables
2. **Cycle status layer** — e.g. employees can't see appraisals until `published`
3. **Active layer** — `is_active = false` blocks all operations (except admin)

Helper functions used inside policies:
- `public.user_role()` — reads role from JWT claim
- `public.user_id()` — reads user ID from JWT claim

### Ownership Checks — [`src/lib/auth.ts`](../src/lib/auth.ts)

- `checkManagerOwnership(user, managerId)` — verifies manager can act on an employee
- `requireManagerOwnership(employeeId, managerId)` — throws if check fails

---

## 13. Feature Flags

Defined in [`supabase/migrations/00014_feature_flags.sql`](../supabase/migrations/00014_feature_flags.sql). Resolved per-request via `resolve_feature_flag()` RPC.

| Flag Key | Category | Default | Description |
|----------|----------|---------|-------------|
| module.kpi_copy_forward | module | true | Copy KPIs from previous cycle button |
| module.kpi_templates | module | true | KPI template picker |
| module.gamification | module | false | Gamification elements (badges, streaks) |
| module.360_feedback | module | false | Peer feedback collection |
| module.ai_assist | module | false | AI-assisted self-review suggestions |
| ui.density_toggle | ui | true | Compact/comfortable layout toggle |
| ui.command_palette | ui | true | Cmd+K command palette |
| ui.onboarding_tour | ui | true | First-login onboarding tour |
| notify.email | notify | true | Email notification delivery |
| notify.in_app | notify | true | In-app notification bell |

**Resolution order:** user override → role override → org override → default

**Usage in code:**
- Server: `getFlag(key, userId, role)` → [`src/lib/feature-flags.ts`](../src/lib/feature-flags.ts)
- Client: `useFeatureFlag(key)` hook → [`src/hooks/use-feature-flag.ts`](../src/hooks/use-feature-flag.ts)

---

## 14. Key Files Reference

### Database

| File | Purpose |
|------|---------|
| [`supabase/migrations/00001_create_enums.sql`](../supabase/migrations/00001_create_enums.sql) | All database enums |
| [`supabase/migrations/00002_create_tables.sql`](../supabase/migrations/00002_create_tables.sql) | All core tables |
| [`supabase/migrations/00004_rls_policies.sql`](../supabase/migrations/00004_rls_policies.sql) | 28 RLS policies |
| [`supabase/migrations/00005_auth_hook.sql`](../supabase/migrations/00005_auth_hook.sql) | JWT injection hook |
| [`supabase/migrations/00006_integrity_and_indexes.sql`](../supabase/migrations/00006_integrity_and_indexes.sql) | Triggers, bulk RPCs |
| [`supabase/migrations/00012_budget_fields.sql`](../supabase/migrations/00012_budget_fields.sql) | Payout math with business_multiplier |
| [`supabase/migrations/00017_seed_test_data.sql`](../supabase/migrations/00017_seed_test_data.sql) | 10 test users + full cycle dataset |

### Business Logic

| File | Purpose |
|------|---------|
| [`src/lib/constants.ts`](../src/lib/constants.ts) | Rating tiers, payout multipliers, `getPayoutMultiplier()` |
| [`src/lib/cycle-machine.ts`](../src/lib/cycle-machine.ts) | Cycle state transitions, `canTransition()`, `getNextStatus()` |
| [`src/lib/auth.ts`](../src/lib/auth.ts) | `getCurrentUser()`, `requireRole()`, ownership checks |
| [`src/lib/types.ts`](../src/lib/types.ts) | All TypeScript interfaces and types |
| [`src/lib/validate.ts`](../src/lib/validate.ts) | Input validators (email, weight, multiplier) |
| [`src/lib/zimyo.ts`](../src/lib/zimyo.ts) | Zimyo API integration |
| [`src/lib/payroll-csv.ts`](../src/lib/payroll-csv.ts) | CSV generator for payroll export |
| [`src/lib/feature-flags.ts`](../src/lib/feature-flags.ts) | Flag resolution helpers |
| [`src/lib/csv.ts`](../src/lib/csv.ts) | RFC 4180 CSV parser for user upload |

### UI Components

| File | Purpose |
|------|---------|
| [`src/components/payout-breakdown.tsx`](../src/components/payout-breakdown.tsx) | Payout calculation breakdown display |
| [`src/components/bell-curve-chart.tsx`](../src/components/bell-curve-chart.tsx) | Rating distribution chart (HRBP calibration) |
| [`src/components/rating-pill-selector.tsx`](../src/components/rating-pill-selector.tsx) | FEE/EE/ME/SME/BE radio pills |
| [`src/components/cycle-timeline.tsx`](../src/components/cycle-timeline.tsx) | Visual cycle stage progress |
| [`src/components/deadline-banner.tsx`](../src/components/deadline-banner.tsx) | Deadline display with overdue warning |
| [`src/components/notification-bell.tsx`](../src/components/notification-bell.tsx) | Notification bell with unread count |
| [`src/components/audit-log-table.tsx`](../src/components/audit-log-table.tsx) | Reusable paginated audit log table |
| [`src/components/kpi-template-picker.tsx`](../src/components/kpi-template-picker.tsx) | Template apply dropdown for managers |
| [`src/hooks/use-auto-save.ts`](../src/hooks/use-auto-save.ts) | 500ms debounced draft auto-save |

---

## Test Credentials

Available as quick-fill pills on the login page (`/login`):

| Email | Password | Role | Notes |
|-------|----------|------|-------|
| admin@test.com | admin123 | admin | Full system access |
| hrbp@test.com | hrbp123 | hrbp | Calibration, lock, publish |
| manager@test.com | manager123 | manager | Alice — manages Bob, Dave, Eve |
| frank@test.com | frank123 | manager | Frank — manages Grace, Henry, Irene |
| employee@test.com | employee123 | employee | Bob |
| dave@test.com | dave123 | employee | Dave |
| eve@test.com | eve123 | employee | Eve |
| grace@test.com | grace123 | employee | Grace |
| henry@test.com | henry123 | employee | Henry |
| irene@test.com | irene123 | employee | Irene |

**Seeded data:** 5 cycles covering all pipeline stages, 81 KPIs, 24 reviews, 15 appraisals (see [`supabase/migrations/00017_seed_test_data.sql`](../supabase/migrations/00017_seed_test_data.sql)).
