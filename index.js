-- ============================================================================
-- Driver-app upgrades (2026-07-26) — run ONCE in Supabase → SQL Editor.
-- Safe to re-run; everything is IF NOT EXISTS. Until this runs, the app degrades
-- gracefully: the offer card just shows the fee, and Online hours shows a dash.
--
-- 1) recommended_fee — the engine's quoted fare, stamped on each own-fleet order
--    at booking. Riders see BOTH numbers on a bargained job:
--    "Client's offer ₦2,000 · recommended ₦2,500" — so they bid informed.
-- 2) rider_online_log — one row per rider per day; driverApi's GPS heartbeat
--    credits the seconds since the previous ping (capped at 60s) while the rider
--    is online. Powers the "Online hours" tile on the new Performance screen.
-- ============================================================================

alter table shipday_orders add column if not exists recommended_fee numeric;

create table if not exists rider_online_log (
  rider_id uuid   not null,
  day      date   not null,
  seconds  bigint not null default 0,
  primary key (rider_id, day)
);

-- Service-role writes only (the edge function). No public read/write.
alter table rider_online_log enable row level security;
