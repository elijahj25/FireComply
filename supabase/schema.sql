-- ============================================================
--  FireComply — Supabase Schema
--  Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── ENUMS ───────────────────────────────────────────────────
create type compliance_status as enum ('compliant', 'issues', 'overdue');
create type severity_level    as enum ('low', 'medium', 'high');
create type issue_status      as enum ('open', 'resolved');
create type repair_status     as enum ('pending', 'approved', 'completed');
create type user_role         as enum ('restaurant', 'technician', 'admin');

-- ─── PROFILES ────────────────────────────────────────────────
-- Extends Supabase auth.users
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       user_role not null default 'restaurant',
  created_at timestamptz default now()
);

-- ─── LOCATIONS ───────────────────────────────────────────────
create table locations (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  address          text,
  contact_name     text,
  contact_email    text,
  last_service_date date,
  next_due_date    date,
  compliance_status compliance_status not null default 'compliant',
  open_issues_count int default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Link restaurant users to their locations (many-to-many)
create table location_users (
  location_id uuid references locations(id) on delete cascade,
  user_id     uuid references profiles(id) on delete cascade,
  primary key (location_id, user_id)
);

-- ─── SERVICES ────────────────────────────────────────────────
create table services (
  id               uuid primary key default uuid_generate_v4(),
  location_id      uuid references locations(id) on delete cascade,
  technician_id    uuid references profiles(id),
  technician_name  text,
  service_date     date not null,
  compliance_status compliance_status not null,
  notes            text,
  report_pdf_url   text,
  created_at       timestamptz default now()
);

-- ─── SERVICE PHOTOS ──────────────────────────────────────────
create table service_photos (
  id         uuid primary key default uuid_generate_v4(),
  service_id uuid references services(id) on delete cascade,
  url        text not null,
  phase      text check (phase in ('before', 'after')),
  created_at timestamptz default now()
);

-- ─── ISSUES ──────────────────────────────────────────────────
create table issues (
  id          uuid primary key default uuid_generate_v4(),
  service_id  uuid references services(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  title       text not null,
  description text,
  photo_url   text,
  severity    severity_level not null default 'medium',
  status      issue_status not null default 'open',
  created_at  timestamptz default now(),
  resolved_at timestamptz
);

-- ─── REPAIRS ─────────────────────────────────────────────────
create table repairs (
  id          uuid primary key default uuid_generate_v4(),
  issue_id    uuid references issues(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  description text not null,
  estimated_cost numeric(10,2),
  status      repair_status not null default 'pending',
  approved_at timestamptz,
  completed_at timestamptz,
  created_at  timestamptz default now()
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

alter table profiles       enable row level security;
alter table locations      enable row level security;
alter table location_users enable row level security;
alter table services       enable row level security;
alter table service_photos enable row level security;
alter table issues         enable row level security;
alter table repairs        enable row level security;

-- Helper: get current user role
create or replace function get_user_role()
returns user_role language sql security definer as $$
  select role from profiles where id = auth.uid();
$$;

-- PROFILES: users can read/update their own profile; admins read all
create policy "Own profile" on profiles
  for all using (id = auth.uid());
create policy "Admin reads all profiles" on profiles
  for select using (get_user_role() = 'admin');

-- LOCATIONS: admins/technicians see all; restaurant users see only theirs
create policy "Admin/tech see all locations" on locations
  for select using (get_user_role() in ('admin', 'technician'));
create policy "Restaurant sees own locations" on locations
  for select using (
    exists (
      select 1 from location_users
      where location_id = locations.id and user_id = auth.uid()
    )
  );
create policy "Admin manages locations" on locations
  for all using (get_user_role() = 'admin');

-- SERVICES: admins see all; technicians see all; restaurants see own
create policy "Admin/tech see all services" on services
  for select using (get_user_role() in ('admin', 'technician'));
create policy "Restaurant sees own services" on services
  for select using (
    exists (
      select 1 from location_users
      where location_id = services.location_id and user_id = auth.uid()
    )
  );
create policy "Technician inserts services" on services
  for insert with check (get_user_role() in ('technician', 'admin'));

-- PHOTOS: mirrors service access
create policy "Read photos" on service_photos
  for select using (
    exists (
      select 1 from services s
      left join location_users lu on lu.location_id = s.location_id
      where s.id = service_photos.service_id
        and (get_user_role() in ('admin','technician') or lu.user_id = auth.uid())
    )
  );
create policy "Insert photos" on service_photos
  for insert with check (get_user_role() in ('technician', 'admin'));

-- ISSUES
create policy "Read issues" on issues
  for select using (
    get_user_role() in ('admin','technician') or
    exists (
      select 1 from location_users
      where location_id = issues.location_id and user_id = auth.uid()
    )
  );
create policy "Manage issues" on issues
  for all using (get_user_role() in ('technician','admin'));

-- REPAIRS
create policy "Read repairs" on repairs
  for select using (
    get_user_role() in ('admin','technician') or
    exists (
      select 1 from location_users
      where location_id = repairs.location_id and user_id = auth.uid()
    )
  );
create policy "Manage repairs" on repairs
  for all using (get_user_role() in ('technician','admin'));
create policy "Restaurant approves repairs" on repairs
  for update using (
    exists (
      select 1 from location_users
      where location_id = repairs.location_id and user_id = auth.uid()
    )
  );

-- ─── TRIGGERS ────────────────────────────────────────────────

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'restaurant')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Auto-update open_issues_count on locations
create or replace function update_open_issues_count()
returns trigger language plpgsql as $$
begin
  update locations
  set open_issues_count = (
    select count(*) from issues
    where location_id = coalesce(new.location_id, old.location_id)
      and status = 'open'
  ),
  updated_at = now()
  where id = coalesce(new.location_id, old.location_id);
  return coalesce(new, old);
end;
$$;

create trigger issues_count_trigger
  after insert or update or delete on issues
  for each row execute procedure update_open_issues_count();

-- Auto-update location compliance_status after service
create or replace function update_location_after_service()
returns trigger language plpgsql as $$
begin
  update locations
  set
    compliance_status = new.compliance_status,
    last_service_date = new.service_date,
    next_due_date = new.service_date + interval '90 days',
    updated_at = now()
  where id = new.location_id;
  return new;
end;
$$;

create trigger service_updates_location
  after insert on services
  for each row execute procedure update_location_after_service();

-- ─── STORAGE BUCKETS ─────────────────────────────────────────
-- Run these in the Supabase Dashboard → Storage, or via API:
--
-- Bucket: "service-photos"   (public: false)
-- Bucket: "compliance-reports" (public: false)
--
-- Storage policies (set in Dashboard → Storage → Policies):
-- Technicians/Admins: INSERT on both buckets
-- All authenticated: SELECT on both buckets for their locations

-- ─── SAMPLE DATA (optional) ──────────────────────────────────
insert into locations (name, address, contact_name, contact_email, last_service_date, next_due_date, compliance_status) values
  ('The Rustic Table',    '1284 Market St, San Francisco, CA 94102', 'Maria Gonzalez', 'maria@rustictable.com',   '2025-01-15', '2025-04-15', 'compliant'),
  ('Sakura Ramen House',  '88 Japantown Blvd, San Jose, CA 95112',   'Kenji Watanabe', 'kenji@sakuraramen.com',   '2024-11-20', '2025-02-20', 'overdue'),
  ('Coastal Burger Co.',  '500 Ocean Ave, Santa Monica, CA 90402',   'Devon Park',     'devon@coastalburger.com', '2025-02-01', '2025-05-01', 'issues');
