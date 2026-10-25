-- =========================================================
-- Chronos Wizard's Chess — Cloud Database Schema
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- =========================================================

create table if not exists public.matches (
    id text primary key,
    player_white text not null,
    player_black text not null,
    winner text not null,
    reason text not null,
    plies integer default 0,
    bonus_turns integer default 0,
    setup_mode text default 'standard',
    moves jsonb default '[]'::jsonb,
    created_at timestamptz default timezone('utc'::text, now()) not null
);

-- Row Level Security (RLS)
alter table public.matches enable row level security;

-- Allow public read access to matches & leaderboards
create policy "Allow public read access"
    on public.matches for select
    using (true);

-- Allow public match insertions from the game client
create policy "Allow public insert access"
    on public.matches for insert
    with check (true);
