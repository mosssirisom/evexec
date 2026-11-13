-- The platform's default monthly fee for new operators changes from £49 to £99 (owner
-- decision, 13/11/2026). The set-up fee stays at £999. Record only: nothing is billed from
-- this table. Existing businesses with their own rate keep it; EV Exec stays at £0.
-- Additive: changes a default and one row's value. No DROP statements.

alter table public.platform_fees alter column default_monthly_pence set default 9900;
update public.platform_fees set default_monthly_pence = 9900, updated_at = now() where id;
