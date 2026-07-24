-- ============================================================================
-- HARDEN claim_order_for_rider — run ONCE in Supabase → SQL Editor.
-- Closes two money-critical holes found in the 2026-07-24 negotiation audit:
--   1) Cross-provider double-dispatch: an own rider could claim an order that
--      dispatchEngine had already fallen back to Shipday (dispatch_provider flips
--      to 'shipday' but assigned_rider_id stays null). Now the claim requires
--      dispatch_provider='own', so a fallen-back order can never be own-claimed.
--   2) One rider, two orders: two customers picking the SAME rider at the same
--      instant both succeeded (the claim only locked the ORDER, never checked the
--      rider was free). Now the claim also requires the rider hold no other
--      still-active order — mirroring the app's own "active order" test
--      (driverApi my-offers: shipday_status<>'cancelled' AND notified_status<>'delivered').
-- Idempotent: create-or-replace, safe to re-run. All 3 callers are own-fleet
-- (driverApi accept, mapPicker acceptcounter, mapPicker setautoaccept).
-- ============================================================================

create or replace function public.claim_order_for_rider(p_order text, p_rider uuid, p_phone text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v int;
begin
  update shipday_orders
     set assigned_rider_id = p_rider,
         carrier_phone     = p_phone,
         accepted_at       = now()
   where order_number = p_order
     and assigned_rider_id is null
     and coalesce(shipday_status, '') <> 'cancelled'
     and dispatch_provider = 'own'                         -- never claim a Shipday-flipped order
     and not exists (                                      -- rider must not already hold a live order
       select 1 from shipday_orders o2
        where o2.assigned_rider_id = p_rider
          and coalesce(o2.shipday_status, '')  <> 'cancelled'
          and coalesce(o2.notified_status, '') <> 'delivered');
  get diagnostics v = row_count;
  return v >= 1;
end;
$$;
