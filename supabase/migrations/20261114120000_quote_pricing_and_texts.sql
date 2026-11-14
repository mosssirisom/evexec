-- Price a website quote request and text the price to the customer (two-tap), with a
-- yes / no reply link. Additive only: no existing row or policy is removed or widened.
--
-- quote_requests: the office's price, when it was sent, a private token for the reply
-- link, and the customer's reply (recorded once, by the website).
alter table public.quote_requests
  add column if not exists quoted_price numeric(10,2),
  add column if not exists quoted_at timestamptz,
  add column if not exists quote_token uuid not null default gen_random_uuid(),
  add column if not exists customer_response text,
  add column if not exists responded_at timestamptz;

alter table public.quote_requests drop constraint if exists quote_requests_customer_response_check;
alter table public.quote_requests add constraint quote_requests_customer_response_check
  check (customer_response is null or customer_response in ('yes', 'no'));

create unique index if not exists quote_requests_quote_token_key on public.quote_requests (quote_token);

-- operator_sms_tasks: a quote text belongs to a quote, not yet to a booking.
alter table public.operator_sms_tasks alter column booking_id drop not null;
alter table public.operator_sms_tasks
  add column if not exists quote_request_id uuid references public.quote_requests(id) on delete cascade;

alter table public.operator_sms_tasks drop constraint if exists operator_sms_tasks_kind_check;
alter table public.operator_sms_tasks add constraint operator_sms_tasks_kind_check
  check (kind in ('confirmation', 'rejection', 'cancellation', 'quote'));

alter table public.operator_sms_tasks drop constraint if exists operator_sms_tasks_target_check;
alter table public.operator_sms_tasks add constraint operator_sms_tasks_target_check
  check (booking_id is not null or quote_request_id is not null);

create unique index if not exists operator_sms_tasks_quote_kind_key
  on public.operator_sms_tasks (quote_request_id, kind) where quote_request_id is not null;
