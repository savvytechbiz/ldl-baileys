-- ============================================================================
-- SHIPDAY CUTOVER — run ONCE in Supabase → SQL Editor, BEFORE the code deploys.
-- Safe to re-run. Your own riders become the only dispatch; Shipday is being
-- disconnected from the whole build.
--
-- Order matters: this runs FIRST, then the functions deploy. The new code
-- selects the columns below (dispatch_alerted_at, scheduled_for, …) — deploying
-- before this script would crash the /dispatch board query.
-- ============================================================================

-- ── New order columns for the escalation ladder ─────────────────────────────
-- With Shipday gone there is no automatic backup, so "nobody took it" becomes a
-- LADDER instead: widen the search, re-ring, alert the team repeatedly, message
-- the customer honestly. Each alarm gets its own stamp so nothing double-fires.
alter table shipday_orders add column if not exists dispatch_alerted_at timestamptz;  -- team re-alert CAS stamp (every dispatch_realert_mins)
alter table shipday_orders add column if not exists offline_pinged_at   timestamptz;  -- the one whole-fleet "job waiting" WhatsApp
alter table shipday_orders add column if not exists norider_alerted2_at timestamptz;  -- customer message #2 at 20 min (message #1 = norider_alerted_at)
alter table shipday_orders add column if not exists scheduled_for       timestamptz;  -- future-dated legs (INTL onward run): the engine leaves them until this time

-- ── New settings (both owner-tunable; safe defaults live in code until set) ──
alter table app_settings add column if not exists dispatch_realert_mins    int;  -- minutes between repeated team alerts on a stranded order (default 10)
alter table app_settings add column if not exists rider_count_min_to_quote int;  -- below this many riders, customers see "riders nearby" instead of the digit (default 3)

-- ── Make "our own riders" the default for everything, everywhere ─────────────
-- The old default was 'shipday': if the code ever omitted the key, a new order
-- would be born invisible to the dispatch engine and unclaimable by riders.
alter table shipday_orders alter column dispatch_provider set default 'own';
alter table app_settings   alter column dispatch_mode     set default 'own';
update app_settings set dispatch_mode = 'own';

-- ── What this deliberately does NOT do ───────────────────────────────────────
-- NO bulk update of historical rows: old orders keep dispatch_provider='shipday'
-- as a read-only "legacy" marker. Rewriting them would put months-old completed
-- deliveries on the dispatch board as claimable jobs and could blast a bogus
-- "peak period" WhatsApp to every rider. Leave history alone.

-- ── Verify (read-only) ───────────────────────────────────────────────────────
select
  (select column_default from information_schema.columns
    where table_name = 'shipday_orders' and column_name = 'dispatch_provider') as provider_default,   -- expect 'own'::text
  (select dispatch_mode from app_settings limit 1)                             as dispatch_mode,      -- expect own
  (select count(*) from information_schema.columns
    where table_name = 'shipday_orders'
      and column_name in ('dispatch_alerted_at','offline_pinged_at','norider_alerted2_at','scheduled_for')) as new_order_cols,  -- expect 4
  (select count(*) from information_schema.columns
    where table_name = 'app_settings'
      and column_name in ('dispatch_realert_mins','rider_count_min_to_quote')) as new_settings_cols;  -- expect 2
