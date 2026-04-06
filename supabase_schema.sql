-- Run this in your Supabase SQL editor to set up the database.

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Users profile (mirrors auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  "defaultJobId" text,
  "payWeekStart" integer not null default 4,
  "payPeriodAnchor" text not null default '2026-03-26',
  "reminderTime" text,
  "reminderEnabled" boolean not null default false
);

-- Jobs
create table if not exists public.jobs (
  id text primary key,
  name text not null,
  color text not null default '#F5A623',
  position text not null default 'Server',
  "defaultWage" real not null default 2.13,
  "createdAt" text not null
);

-- Shifts
create table if not exists public.shifts (
  id text primary key,
  "userId" uuid not null references public.users(id) on delete cascade,
  "jobId" text not null,
  date text not null,
  "clockIn" text not null default '00:00',
  "clockOut" text not null default '00:00',
  hours real not null default 0,
  "tipsCash" real not null default 0,
  "tipsCredit" real not null default 0,
  "tipsTotal" real not null default 0,
  sales real not null default 0,
  "tipPercent" real not null default 0,
  covers integer not null default 0,
  "salesPerCover" real not null default 0,
  "tipOut" real not null default 0,
  "tipOutByCategory" jsonb not null default '{}',
  "tipsWithheld" real not null default 0,
  "tipIn" real not null default 0,
  "netTips" real not null default 0,
  wage real not null default 0,
  "serviceCharge" real not null default 0,
  mileage real not null default 0,
  "grossEarnings" real not null default 0,
  notes text not null default '',
  synced boolean not null default false,
  "createdAt" text not null,
  "updatedAt" text not null
);

-- Expenses
create table if not exists public.expenses (
  id text primary key,
  "shiftId" text not null references public.shifts(id) on delete cascade,
  category text not null,
  amount real not null,
  "taxDeductible" boolean not null default false,
  note text default ''
);

-- Goals
create table if not exists public.goals (
  id text primary key,
  "userId" uuid not null references public.users(id) on delete cascade,
  label text not null,
  field text not null,
  period text not null,
  target real not null,
  "createdAt" text not null
);

-- Row Level Security: users can only see their own data
alter table public.users enable row level security;
alter table public.shifts enable row level security;
alter table public.goals enable row level security;

create policy "users: own row" on public.users
  for all using (auth.uid() = id);

create policy "shifts: own rows" on public.shifts
  for all using (auth.uid() = "userId");

create policy "goals: own rows" on public.goals
  for all using (auth.uid() = "userId");

-- Jobs are shared (all users can read/write — same restaurant)
alter table public.jobs enable row level security;
create policy "jobs: all authenticated" on public.jobs
  for all using (auth.role() = 'authenticated');

-- Expenses accessible via shift ownership
alter table public.expenses enable row level security;
create policy "expenses: via shift" on public.expenses
  for all using (
    exists (
      select 1 from public.shifts
      where shifts.id = expenses."shiftId"
      and shifts."userId" = auth.uid()
    )
  );
