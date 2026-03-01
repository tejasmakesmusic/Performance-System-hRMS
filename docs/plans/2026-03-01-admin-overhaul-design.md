# Admin Section Overhaul — Design

**Date:** 2026-03-01
**Status:** Approved

## Overview

Full overhaul of the admin section covering six areas: overview dashboard, cycle detail page, users page improvements, KPI template management, manual notifications, and route restructuring.

---

## 1. Architecture & Navigation

### Route Changes

| Route | Change |
|---|---|
| `/admin` | **New:** Two-panel overview dashboard |
| `/admin/cycles` | **Moved from `/admin`:** Cycle list + create |
| `/admin/cycles/[id]` | **New:** Per-cycle detail with per-employee status |
| `/admin/cycles/new` | Unchanged |
| `/admin/users` | **Enhanced:** Search/filter + inline role/status edit |
| `/admin/users/upload` | Unchanged |
| `/admin/kpi-templates` | **New:** KPI template management |
| `/admin/kpi-templates/new` | **New:** Create template form |
| `/admin/kpi-templates/[id]/edit` | **New:** Edit template form |
| `/admin/notifications` | **New:** Send manual notifications |
| `/admin/feature-flags` | Unchanged |
| `/admin/audit-log` | Unchanged |

### Sidebar Nav Updates

Admin nav items (in `src/components/sidebar.tsx`):

```
Cycles          → /admin/cycles   (was /admin)
Users           → /admin/users    (unchanged)
KPI Templates   → /admin/kpi-templates  (NEW)
Notifications   → /admin/notifications  (NEW)
Feature Flags   → /admin/feature-flags  (unchanged)
Audit Log       → /admin/audit-log      (unchanged)
```

### DB Changes

New table: `kpi_templates`
```sql
create table kpi_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    text,
  is_active   boolean not null default true,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);
```

RLS: admins can do all operations; employees/managers can SELECT where is_active = true (for future KPI-setting integration).

No other schema changes — all other features use existing tables (notifications, audit_logs, users, cycles, reviews, appraisals).

---

## 2. Admin Dashboard (`/admin`)

Two panels on one screen, server-rendered.

### Cycle Health Panel
- Active cycle name + `CycleStatusBadge` + days remaining to next deadline
- Reuse existing `ProgressRing` component: Self Reviews %, Manager Reviews %, Overall %
- Overdue alert banner if any manager reviews are past deadline
- "View Cycle Detail →" link to `/admin/cycles/[id]`
- Fallback: "No active cycle" + "Create Cycle →" CTA when all cycles are draft or published

### People Panel
- Total active user count
- 4 stat chips: counts per role (employee / manager / hrbp / admin)
- Distinct department count
- Last import date (from `audit_logs` where `action = 'csv_upload'`, latest `created_at`)
- "Manage Users →" link to `/admin/users`

### Data Queries
```
cycles → most recent non-draft/non-published (active cycle)
users → count by role, count distinct department, is_active = true
reviews → self-reviews for active cycle
appraisals → manager reviews for active cycle
audit_logs → latest csv_upload entry
```

---

## 3. Cycles List (`/admin/cycles`)

Content is the existing `/admin` page moved verbatim — cycle table with status badges and advance-stage buttons. Cycle names become links to `/admin/cycles/[id]`.

---

## 4. Cycle Detail Page (`/admin/cycles/[id]`)

### Header
- Cycle name, status badge, year
- Deadline dates (self-review deadline, manager review deadline)
- "Advance to [next stage]" button

### Per-Employee Status Table
Columns: Name, Department, Manager, Self Review, Manager Review, Appraisal Rating

- Self Review: "Submitted" (green badge) / "Pending" (amber) / "—"
- Manager Review: "Done" (green) / "Overdue" (red, if past `manager_review_deadline`) / "Pending"
- Appraisal Rating: numeric rating if available, else "—"
- Sortable by Department or status columns

### Send Reminders
Two action buttons with confirmation:
- **"Remind pending self-reviews"** — inserts `notifications` rows for employees with no submitted self-review; shows "Send to X employees?" count before firing
- **"Remind overdue manager reviews"** — inserts `notifications` rows for managers with outstanding reviews past deadline; shows "Send to X managers?"

### Data Queries
```
users → is_active = true, not admin/hrbp
reviews → where cycle_id = [id]
appraisals → where cycle_id = [id]
```

---

## 5. Users Page (`/admin/users`)

### Search & Filter Bar (URL param driven)
- `?search=` — filters by name or email (case-insensitive, client-side)
- `?role=` — dropdown: All / employee / manager / hrbp / admin
- `?dept=` — dropdown populated from distinct departments in loaded data
- `?active=` — toggle: All / Active / Inactive

Full user list loaded server-side; filtering applied client-side for instant response. "Showing X of Y users" count.

### Table Enhancements
- Added: Designation column
- Role column: `<select>` dropdown — onChange calls `updateUserRole` server action (already exists)
- Status column: clickable "Active / Inactive" toggle — calls new `toggleUserActive` server action
- Optimistic updates for both role and status changes

### New Server Action
```ts
toggleUserActive(userId: string): Promise<void>
// updates users.is_active, inserts audit_log entry, revalidatePath
```

---

## 6. KPI Template Management (`/admin/kpi-templates`)

### List Page
- Table: Name, Category, Description (truncated to 60 chars), Active toggle, Edit link
- "New Template" button → `/admin/kpi-templates/new`
- Category filter dropdown

### Create/Edit Pages
Fields:
- `name` (text, required)
- `description` (textarea, optional)
- `category` (text input, optional — free-form for now)
- `is_active` (checkbox, default true)

Server actions: `createKpiTemplate`, `updateKpiTemplate` — both revalidate `/admin/kpi-templates`.

### Future Integration
During KPI-setting stage, employees/managers will see a "Pick from template" option. Not in scope for this implementation — templates UI only.

---

## 7. Manual Notifications (`/admin/notifications`)

### Send Form
- **Message** — textarea (required)
- **Link** — optional URL input
- **Recipients** — radio group:
  - Individual: searchable user select
  - By role: multi-select checkboxes (employee / manager / hrbp)
  - By department: multi-select of distinct departments
  - Everyone: no extra input
- **Preview count** — "Will send to X users" (client-side computed from recipient selection)
- **Send** button → `sendManualNotification` server action

### Server Action Logic
```ts
sendManualNotification(formData):
  1. Resolve recipient user IDs from selection
  2. Insert rows into notifications (type='admin_message', message, link, user_id)
  3. Insert audit_log (action='manual_notification', new_value: { scope, count, message })
  4. revalidatePath
```

### Sent History
Table below the form: last 20 audit_log entries where `action = 'manual_notification'`.
Columns: Message (truncated), Recipient scope, Sent by (user join), Time.

---

## Implementation Order

1. DB migration — `kpi_templates` table + RLS
2. Route restructure — move `/admin` → `/admin/cycles`, update sidebar
3. Admin dashboard (`/admin`)
4. Cycle detail page (`/admin/cycles/[id]`)
5. Users page improvements (search/filter + inline edits)
6. KPI templates (list + create/edit)
7. Manual notifications
