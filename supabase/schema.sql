-- ZiddiFit Supabase Schema
-- Run this in the Supabase SQL Editor

-- Enable UUID extension (usually already enabled)
create extension if not exists "pgcrypto";

-- ── Table: users ──────────────────────────────────────────────────────────────
create table if not exists users (
  user_id uuid primary key default gen_random_uuid(),
  age int,
  height_cm numeric,
  weight_kg numeric,
  sex text check (sex in ('male','female','other','prefer_not_to_say')),
  fitness_experience text check (fitness_experience in ('beginner','intermediate','advanced')),
  goal text,
  dietary_preference text,
  available_equipment text[],
  available_time_minutes int,
  days_per_week int,
  constraints text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Table: plans ──────────────────────────────────────────────────────────────
create table if not exists plans (
  plan_id uuid primary key default gen_random_uuid(),
  user_id uuid references users(user_id) not null,
  plan_json jsonb not null,
  change_summary text,
  is_active boolean default true,
  created_at timestamptz default now()
);
create index if not exists plans_user_created on plans (user_id, created_at desc);

-- ── Table: workout_sessions ───────────────────────────────────────────────────
create table if not exists workout_sessions (
  session_id uuid primary key default gen_random_uuid(),
  user_id uuid references users(user_id) not null,
  exercise text not null default 'Squat',
  sets jsonb default '[]'::jsonb,
  started_at timestamptz default now(),
  ended_at timestamptz
);
create index if not exists sessions_user_started on workout_sessions (user_id, started_at desc);

-- ── Table: meals ──────────────────────────────────────────────────────────────
create table if not exists meals (
  meal_id uuid primary key default gen_random_uuid(),
  user_id uuid references users(user_id) not null,
  identified_items text[],
  estimated_nutrition jsonb,
  verdict text,
  image_storage_path text,
  created_at timestamptz default now()
);
create index if not exists meals_user_created on meals (user_id, created_at desc);

-- ── Table: hydration_logs ─────────────────────────────────────────────────────
create table if not exists hydration_logs (
  user_id uuid references users(user_id) not null,
  log_date date not null default current_date,
  logs jsonb default '[]'::jsonb,
  target_ml int default 2000,
  primary key (user_id, log_date)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enable RLS on all tables (backend uses service-role key, bypasses RLS)
alter table users enable row level security;
alter table plans enable row level security;
alter table workout_sessions enable row level security;
alter table meals enable row level security;
alter table hydration_logs enable row level security;

-- Policies for frontend anon-key reads (if used directly)
create policy "Users can read own profile" on users
  for select using (true);  -- relax for hackathon anon sessions

create policy "Users can read own plans" on plans
  for select using (true);

create policy "Users can read own sessions" on workout_sessions
  for select using (true);

create policy "Users can read own meals" on meals
  for select using (true);

create policy "Users can read own hydration" on hydration_logs
  for select using (true);

-- ── Storage bucket for meal photos ───────────────────────────────────────────
-- Run in Supabase Dashboard → Storage → Create bucket 'meal-photos' (private)
-- Or uncomment:
-- insert into storage.buckets (id, name, public) values ('meal-photos', 'meal-photos', false)
-- on conflict do nothing;
