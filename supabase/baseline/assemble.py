#!/usr/bin/env python3
"""Build schema.sql from the rows returned by generate.sql.

Usage: python3 assemble.py rows.json > schema.sql
rows.json is the JSON array the query returns: [{ord, kind, name, ddl}, ...].
"""
import json
import sys

APP_ROLES = {"public", "anon", "authenticated", "service_role"}

TITLES = {
    10: "Schemas", 20: "Sequences", 30: "Tables", 35: "Sequence ownership",
    40: "Primary keys, unique and check constraints", 45: "Foreign keys",
    50: "Indexes", 60: "Functions", 70: "Views", 80: "Triggers",
    90: "Row-level security", 95: "Policies", 100: "Schema rights",
    110: "Table, view and sequence rights", 120: "Function rights",
    140: "Realtime", 150: "Storage buckets",
}

HEADER = """-- EV Exec database baseline: the structure of the live project, for tests.
--
-- GENERATED. Do not edit by hand. Rebuild with generate.sql and assemble.py
-- (see README.md). It holds structure and access rules only: no customer data,
-- no secrets, no scheduled jobs.
--
-- It is NOT a migration and is never applied to the live project.

set check_function_bodies = off;
set client_min_messages = warning;
"""

DEFAULT_PRIVILEGES = """
-- ─── Rights given to tables, sequences and functions created later ─────────
-- As on live for role postgres in schema public (10/11/2026).
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
"""

SEED = """
-- ─── Rows the structure depends on ──────────────────────────────────────────
-- The first operator business. Column defaults and the sign-up trigger point at
-- this id, so it must exist. Name only: no contact details, prices or branding.
insert into public.tenants (id, slug, name)
values ('00000000-0000-0000-0000-000000000001', 'ev-exec', 'EV Exec')
on conflict (id) do nothing;
"""


def main():
    rows = [r for r in json.load(open(sys.argv[1])) if r["kind"] != "pad"]
    rows.sort(key=lambda r: (r["ord"], r["name"], r["ddl"]))
    out = [HEADER]
    notes = []
    last = None
    for r in rows:
        ddl = r["ddl"].rstrip()
        if r["kind"] in ("default_acl", "cron_name"):
            notes.append(ddl)
            continue
        if r["kind"].startswith("acl") and ddl.startswith("grant "):
            grantee = ddl.rsplit(" to ", 1)[1].rstrip(";").strip('"')
            if grantee not in APP_ROLES:
                continue
        if r["kind"] == "publication":
            table = ddl.rsplit(" ", 1)[1].rstrip(";")
            schema, name = table.split(".")
            ddl = (
                "do $$ begin\n"
                "  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')\n"
                "     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'\n"
                f"                     and schemaname = '{schema}' and tablename = '{name}') then\n"
                f"    alter publication supabase_realtime add table {table};\n"
                "  end if;\nend $$;"
            )
        if r["kind"] == "view" and not ddl.endswith(";"):
            ddl += ";"
        group = (r["ord"] // 10) * 10 if r["ord"] not in (35, 45, 95) else r["ord"]
        if group != last and group in TITLES:
            out.append(f"\n-- ─── {TITLES[group]} " + "─" * max(3, 70 - len(TITLES[group])) + "\n")
            last = group
        out.append(ddl + ("\n" if r["kind"] in ("table", "function", "view", "policy") else ""))
    out.append(DEFAULT_PRIVILEGES)
    out.append(SEED)
    out.append("\n-- ─── Live settings recorded for reference (not created here) ────────────────")
    out.extend(notes)
    print("\n".join(out))


if __name__ == "__main__":
    main()
