# Performance Management System (PMS) — Design Document

**Date:** 2026-02-23
**Status:** Approved
**Author:** Raghav Maheshwari

---

## 1. Overview

A custom Performance Management System that acts as a dedicated evaluation layer on top of Zimyo HRMS. The system pulls employee and hierarchy data from Zimyo's private API, manages quarterly review cycles end-to-end, and produces a payroll export CSV for Zimyo import on cycle completion.

The core design constraint is **bias-resistance through process enforcement**: a strict 7-stage state machine and Row-Level Security at the database layer ensure that draft ratings and payout projections are never accessible to employees until HR explicitly publishes the cycle.

---

## 2. Architecture

### Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14+ (TypeScript) | React ecosystem, server components, App Router |
| Backend | Supabase (PostgreSQL + Auth + RLS + Edge Functions) | RLS enforces lock-and-publish at DB layer; managed infrastructure |
| Email | Resend | Simple API, reliable deliverability |
| Deployment | Vercel (frontend) + Supabase Cloud (backend) | Zero ops for < 100 employees |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    VERCEL (Frontend)                    │
│           Next.js 14+ App (TypeScript)                  │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Employee │ │ Manager  │ │  HRBP    │ │ Sys Admin│  │
│  │  Portal  │ │Dashboard │ │Dashboard │ │  Panel   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTPS / Supabase Client SDK
┌─────────────────────────▼───────────────────────────────┐
│                  SUPABASE (Backend)                     │
│                                                         │
│  ┌─────────────────┐   ┌──────────────────────────────┐│
│  │   Auth + RBAC   │   │  Row-Level Security Policies ││
│  │ (4 roles via    │   │  (enforces visibility per    ││
│  │  custom claims) │   │   cycle stage)               ││
│  └─────────────────┘   └──────────────────────────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │              PostgreSQL Database                    ││
│  │  users · cycles · kpis · reviews · appraisals      ││
│  │  audit_logs · notifications                        ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │              Edge Functions                         ││
│  │  • zimyo-sync  (cron + manual trigger)              ││
│  │  • notification-sender  (email queue processor)     ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
          │                               │
   ┌──────▼──────┐               ┌────────▼────────┐
   │  Zimyo API  │               │  Resend (Email) │
   │  (private   │               └─────────────────┘
   │  enterprise)│
   └─────────────┘
```

### Key Architectural Decision

Row-Level Security (RLS) policies are the enforcement layer for the lock-and-publish model. No application-level code can accidentally leak a draft rating — RLS rejects the query at the database unless the cycle is in `published` status and the requesting user is the rated employee. This is stronger than application-level gating.

---

## 3. User Roles

| Role | Permissions |
|---|---|
| `employee` | View own KPIs (after kpi_setting stage). Submit self-assessment (during self_review). View own final rating + payout % (after published). |
| `manager` | Set KPIs for direct reports (during kpi_setting). View direct report self-assessments (during manager_review). Submit ratings and comments for direct reports. |
| `hrbp` | Full read access to all reviews and appraisals. Adjust final ratings during calibrating stage (audit log required). Advance cycle status. Lock and publish cycle. Download payroll CSV. |
| `admin` | All HRBP permissions plus: create/configure cycles, trigger Zimyo sync, upload CSV fallback, view full audit logs, manage user roles. |

---

## 4. Data Model

### `users`
Synced from Zimyo API. Never created manually.

```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
zimyo_id      text UNIQUE NOT NULL
email         text UNIQUE NOT NULL
full_name     text NOT NULL
role          user_role NOT NULL  -- enum: employee | manager | hrbp | admin
department    text
designation   text
manager_id    uuid REFERENCES users(id)
is_active     boolean DEFAULT true
synced_at     timestamptz DEFAULT now()
created_at    timestamptz DEFAULT now()
```

### `cycles`
Master state machine record for each review quarter.

```sql
id                      uuid PRIMARY KEY DEFAULT gen_random_uuid()
name                    text NOT NULL  -- e.g. "Q1 2026"
quarter                 text NOT NULL  -- e.g. "Q1"
year                    integer NOT NULL
status                  cycle_status NOT NULL DEFAULT 'draft'
  -- enum: draft | kpi_setting | self_review | manager_review | calibrating | locked | published
kpi_setting_deadline    date
self_review_deadline    date
manager_review_deadline date
calibration_deadline    date
published_at            timestamptz
sme_multiplier          numeric(5,4)  -- configurable per cycle, e.g. 0.5000 = 50%
created_by              uuid REFERENCES users(id)
created_at              timestamptz DEFAULT now()
updated_at              timestamptz DEFAULT now()
```

### `kpis`
Manager-defined goals per employee per cycle.

```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
cycle_id      uuid REFERENCES cycles(id) NOT NULL
employee_id   uuid REFERENCES users(id) NOT NULL
manager_id    uuid REFERENCES users(id) NOT NULL
title         text NOT NULL
description   text
weight        numeric(5,2)  -- percentage weight of this KPI, all weights per employee sum to 100
created_at    timestamptz DEFAULT now()
updated_at    timestamptz DEFAULT now()
```

### `reviews`
Employee self-assessment per cycle.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
cycle_id        uuid REFERENCES cycles(id) NOT NULL
employee_id     uuid REFERENCES users(id) NOT NULL
self_rating     rating_tier  -- enum: FEE | EE | ME | SME | BE
self_comments   text NOT NULL
status          review_status DEFAULT 'draft'  -- enum: draft | submitted
submitted_at    timestamptz
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()

UNIQUE (cycle_id, employee_id)
```

### `appraisals`
The financial record. Most sensitive table; strictest RLS.

```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
cycle_id              uuid REFERENCES cycles(id) NOT NULL
employee_id           uuid REFERENCES users(id) NOT NULL
manager_id            uuid REFERENCES users(id) NOT NULL
manager_rating        rating_tier  -- enum: FEE | EE | ME | SME | BE
manager_comments      text
manager_submitted_at  timestamptz
final_rating          rating_tier
final_rating_set_by   uuid REFERENCES users(id)  -- null = manager's rating kept; set = HR overrode
payout_multiplier     numeric(5,4)  -- e.g. 1.2500 for FEE, 0.0000 for BE
payout_amount         numeric(12,2)  -- calculated from employee's variable pay component
locked_at             timestamptz
created_at            timestamptz DEFAULT now()
updated_at            timestamptz DEFAULT now()

UNIQUE (cycle_id, employee_id)
```

### `audit_logs`
Immutable financial trail. Never updated or deleted.

```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
cycle_id      uuid REFERENCES cycles(id)
changed_by    uuid REFERENCES users(id) NOT NULL
action        text NOT NULL  -- e.g. "rating_override", "cycle_locked", "zimyo_sync"
entity_type   text NOT NULL  -- e.g. "appraisal", "cycle", "user"
entity_id     uuid
old_value     jsonb
new_value     jsonb
justification text  -- required when action = "rating_override"
created_at    timestamptz DEFAULT now()
```

### `notifications`
Outbound email queue.

```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
recipient_id  uuid REFERENCES users(id) NOT NULL
type          notification_type NOT NULL
  -- enum: cycle_kpi_setting_open | cycle_self_review_open | cycle_manager_review_open | cycle_published
payload       jsonb  -- template variables
status        notification_status DEFAULT 'pending'  -- enum: pending | sent | failed
sent_at       timestamptz
error_message text
created_at    timestamptz DEFAULT now()
```

---

## 5. Rating Tiers & Payout Multipliers

| Tier Code | Name | Payout Multiplier |
|---|---|---|
| `FEE` | Far Exceeds Expectations | 125% |
| `EE` | Exceeds Expectations | 110% |
| `ME` | Meets Expectations | 100% |
| `SME` | Some Meets Expectations | Configurable per cycle (`sme_multiplier` field) |
| `BE` | Below Expectations | 0% |

---

## 6. Cycle State Machine

```
DRAFT
  │  HR creates cycle, sets deadlines, sets sme_multiplier
  ▼
KPI_SETTING
  │  Managers define KPIs + weights for each direct report
  │  Employees can view their KPIs; cannot submit self-assessment yet
  ▼
SELF_REVIEW
  │  Employees submit self_rating + self_comments
  │  Managers cannot see employee self-ratings at this stage
  ▼
MANAGER_REVIEW
  │  Managers see employee KPIs + submitted self-assessments
  │  Managers submit manager_rating + manager_comments per employee
  ▼
CALIBRATING
  │  HRBP sees full Bell Curve distribution dashboard
  │  HRBP can override final_rating per employee (justification required; audit logged)
  │  Draft payout amounts visible to HRBP and Admin only
  ▼
LOCKED
  │  HRBP confirms calibration complete
  │  No further rating changes permitted; payout_multiplier is frozen
  ▼
PUBLISHED
  │  Employees can now see their own final_rating and payout %
  │  Payroll CSV becomes downloadable for HR
  │  Email notification fired to all employees
```

### Stage Transition Rules

| From → To | Who can trigger | Precondition |
|---|---|---|
| draft → kpi_setting | admin / hrbp | Cycle has name, year, quarter, deadlines set |
| kpi_setting → self_review | admin / hrbp | All active employees have at least 1 KPI set |
| self_review → manager_review | admin / hrbp | (Manual or deadline-based) |
| manager_review → calibrating | admin / hrbp | All managers have submitted ratings for all direct reports |
| calibrating → locked | hrbp | Manual confirmation |
| locked → published | hrbp | Manual confirmation; triggers notifications + payroll CSV |

---

## 7. RLS Policy Summary

| Table | Employee can read | Manager can read | HRBP can read | Admin can read |
|---|---|---|---|---|
| users | own row | own row + direct reports | all | all |
| cycles | all (status only if not draft) | all | all | all |
| kpis | own kpis | own + direct reports | all | all |
| reviews | own (after self_review stage) | direct reports (after manager_review stage) | all | all |
| appraisals | own row only when cycle = published | direct reports (manager_rating + comments only) | all | all |
| audit_logs | none | none | all | all |
| notifications | none | none | all | all |

---

## 8. UI Screens

### Employee Portal
- **My Review** — current cycle status indicator, KPI list, self-assessment form (enabled during `self_review`), final result card (visible when `published`)
- **My History** — past cycles with final_rating and payout % per quarter

### Manager Dashboard
- **My Team** — list of direct reports with per-person status badge: `KPI Pending | Self Review Pending | Awaiting Your Review | Submitted`
- **Review: [Employee Name]** — KPI list, employee self-assessment panel, manager rating form (rating dropdown + required comment); submit button
- Warning if manager attempts to advance without submitting all direct report reviews

### HRBP Calibration Dashboard
- **Bell Curve View** — distribution chart (count + % per tier); soft target overlay; live updates as ratings are adjusted
- **Calibration Table** — full employee list with manager_rating, editable final_rating dropdown, justification text field (required on change); save triggers audit log
- **Payout Preview** — aggregated budget impact per tier + total estimated payout
- **Cycle Controls** — stage advance buttons with confirmation dialogs; Download Payroll CSV (available after `locked`)

### Admin Panel
- **Cycle Management** — create cycle, set deadlines and sme_multiplier, advance stages
- **User Management** — trigger Zimyo sync (shows last sync timestamp + counts), upload CSV fallback
- **Audit Log Viewer** — searchable/filterable table of all audit_log entries

---

## 9. Integrations

### Zimyo Inbound Sync (available via private enterprise API)

**Trigger:** Daily cron at 02:00 local time + manual "Sync Now" button in Admin Panel

**Process:**
1. Fetch employee list from Zimyo API → fields: `zimyo_id`, `email`, `full_name`, `department`, `designation`
2. Fetch manager hierarchy from Zimyo API → builds `manager_id` mapping
3. Upsert into `users` table: insert new, update changed fields, set `is_active = false` for employees no longer in Zimyo
4. Write sync result to `audit_logs`: `{ action: "zimyo_sync", new_value: { added, updated, deactivated } }`

**CSV Fallback:** Admin uploads CSV/Excel with columns: `zimyo_id, email, full_name, department, designation, manager_email`. System shows a diff preview before applying. Identical upsert path.

### Payroll Export (CSV — manual Zimyo import)

When cycle is `published`, a "Download Payroll Export" button appears for HRBP and Admin.

**CSV columns:**
```
zimyo_employee_id | employee_name | department | final_rating | payout_multiplier | payout_amount
```

HR downloads this file and imports it manually into Zimyo payroll.

### Email Notifications (via Resend)

| Notification Type | Trigger | Recipients |
|---|---|---|
| `cycle_kpi_setting_open` | Cycle advances to kpi_setting | All active managers |
| `cycle_self_review_open` | Cycle advances to self_review | All active employees |
| `cycle_manager_review_open` | Cycle advances to manager_review | All active managers |
| `cycle_published` | Cycle published | All active employees |

Email sending is decoupled: notifications are queued in the `notifications` table, then a Supabase Edge Function processes the queue and calls Resend. Failed sends are retried up to 3 times before being marked `failed`.

---

## 10. Payout Calculation Logic

```
payout_amount = employee_variable_pay_component × payout_multiplier

Where payout_multiplier is:
  FEE → 1.2500
  EE  → 1.1000
  ME  → 1.0000
  SME → cycles.sme_multiplier  (set by HR at cycle creation)
  BE  → 0.0000
```

`employee_variable_pay_component` is stored on the `users` table (synced from Zimyo or entered during CSV import).

---

## 11. Security Considerations

- **RLS is the enforcement layer** for data visibility — not application code. Application code cannot accidentally bypass it.
- **Audit logs are insert-only** — no update or delete permissions granted to any role.
- **Justification required** for any HR override of a manager's submitted rating.
- **Supabase Auth** with custom JWT claims carries the user's role into every database query.
- **HTTPS only** for all communications; Supabase enforces SSL on all connections.
- **Environment variables** hold all secrets (Zimyo API key, Resend API key); never committed to source control.

---

## 12. Out of Scope (v1)

- 360-degree peer feedback
- Continuous feedback / one-on-one notes
- Mobile-native application (responsive web is sufficient)
- Zimyo payroll push API (not yet available; CSV export is the path)
- Multi-entity / multi-company support
- Automated Bell Curve hard enforcement (soft targets only in v1)
