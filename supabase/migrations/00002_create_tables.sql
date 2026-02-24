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
