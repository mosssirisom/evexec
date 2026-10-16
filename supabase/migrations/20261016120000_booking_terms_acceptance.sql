-- Booking, payment, changes and cancellation policy (version 2, 16/10/2026).
-- Records which version of the policy a customer accepted, and what a
-- customer self-cancellation cost. Additive and nullable: nothing existing
-- changes. Until this is applied, the website writes the same facts into
-- bookings.notes instead (lib/cancellation.js recordAcceptance, and
-- handleCancel in api/booking/index.js).

alter table public.bookings
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancellation_charge numeric(10,2);

comment on column public.bookings.terms_version is 'Version of the booking/cancellation policy the customer accepted (evexec lib/cancellation.js TERMS_VERSION). Null: booked under version 1, or not accepted online.';
comment on column public.bookings.terms_accepted_at is 'When the customer ticked the policy box (booking form or payment page).';
comment on column public.bookings.cancelled_at is 'When the customer cancelled with the self-cancel link.';
comment on column public.bookings.cancelled_by is 'Who cancelled through the website: customer.';
comment on column public.bookings.cancellation_charge is 'Cancellation charge in GBP under the booking''s policy version, worked out when the customer cancelled with the self-cancel link.';
