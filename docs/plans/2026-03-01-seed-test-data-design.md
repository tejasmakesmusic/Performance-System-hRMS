# Seed Test Data Design

**Goal:** Seed realistic test data into the local Supabase DB via a migration file so all role dashboards render with meaningful data for UX testing.

**Approach:** Single migration `00017_seed_test_data.sql` using hardcoded deterministic UUIDs and `ON CONFLICT DO NOTHING` for idempotency.

---

## Users (10 total)

Inserted into both `auth.users` and `public.users`. Passwords via `crypt(password, gen_salt('bf'))`. `email_confirmed_at = now()` so login works immediately.

| Email | Role | Manager | Variable Pay (INR) |
|---|---|---|---|
| admin@test.com | admin | — | 0 |
| hrbp@test.com | hrbp | — | 0 |
| manager@test.com (Alice) | manager | — | 120,000 |
| frank@test.com (Frank) | manager | — | 100,000 |
| employee@test.com (Bob) | employee | Alice | 80,000 |
| dave@test.com | employee | Alice | 75,000 |
| eve@test.com | employee | Alice | 72,000 |
| grace@test.com | employee | Frank | 68,000 |
| henry@test.com | employee | Frank | 65,000 |
| irene@test.com | employee | Frank | 60,000 |

UUIDs: `'00000001-0000-0000-0000-00000000000N'` pattern for readability.

---

## Cycles (5 total)

One cycle per pipeline stage:

| Name | Quarter/Year | Status | business_multiplier |
|---|---|---|---|
| Annual Review FY2025-Q1 | Q1 / 2025 | `published` | 0.9 |
| Mid-Year FY2025-Q2 | Q2 / 2025 | `calibrating` | 1.0 |
| Q3 FY2025 | Q3 / 2025 | `manager_review` | 1.0 |
| Q4 FY2025 | Q4 / 2025 | `self_review` | 1.0 |
| Q1 FY2026 | Q1 / 2026 | `kpi_setting` | 1.0 |

`sme_multiplier` set to 0.25 on the published cycle.

---

## KPIs

3 KPIs per employee per cycle, weights summing to 100. Generic performance titles (e.g. "Delivery Quality", "Collaboration", "Learning & Development").

- **Q1 published / Q2 calibrating / Q3 manager_review / Q4 self_review**: all 6 employees have KPIs
- **Q1 FY2026 kpi_setting**: only Alice's team (Bob, Dave, Eve) have KPIs; Frank's team (Grace, Henry, Irene) don't yet

---

## Reviews & Appraisals per Cycle

### Q1 FY2025 — published
- Reviews: all 6 submitted with self_rating + self_comments
- Appraisals: all 6 locked with manager_rating = final_rating, payout_multiplier, payout_amount set
- Rating spread: Bob → EE, Dave → ME, Eve → FEE, Grace → ME, Henry → BE, Irene → EE
- `published_at` set on cycle

### Q2 FY2025 — calibrating
- Reviews: all 6 submitted
- Appraisals: all 6 with manager_rating. 2 HRBP overrides: Grace ME→EE, Henry BE→ME

### Q3 FY2025 — manager_review
- Reviews: all 6 submitted
- Appraisals: Alice's team (Bob, Dave, Eve) have manager_rating set; Frank's team (Grace, Henry, Irene) pending

### Q4 FY2025 — self_review
- Reviews: Bob, Dave, Grace submitted; Eve, Henry, Irene still draft
- No appraisals yet

### Q1 FY2026 — kpi_setting
- No reviews or appraisals yet

---

## Implementation

Single file: `supabase/migrations/00017_seed_test_data.sql`

Structure:
1. Insert `auth.users` (10 rows, ON CONFLICT DO NOTHING)
2. Insert `public.users` (10 rows, ON CONFLICT DO NOTHING)
3. Insert `cycles` (5 rows)
4. Insert `kpis` per cycle
5. Insert `reviews` per cycle
6. Insert `appraisals` per cycle
7. Update cycle `published_at` and `status` for Q1 published
