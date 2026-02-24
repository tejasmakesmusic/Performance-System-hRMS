CREATE TYPE user_role AS ENUM ('employee', 'manager', 'hrbp', 'admin');
CREATE TYPE cycle_status AS ENUM ('draft', 'kpi_setting', 'self_review', 'manager_review', 'calibrating', 'locked', 'published');
CREATE TYPE rating_tier AS ENUM ('FEE', 'EE', 'ME', 'SME', 'BE');
CREATE TYPE review_status AS ENUM ('draft', 'submitted');
CREATE TYPE notification_type AS ENUM ('cycle_kpi_setting_open', 'cycle_self_review_open', 'cycle_manager_review_open', 'cycle_published');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
