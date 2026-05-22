# EV Exec Deployment Setup

## 1. Create Supabase project
Create a new Supabase project.

## 2. Run migration
Run SQL inside:

supabase/migrations/001_create_backend_tables.sql

## 3. Add Vercel environment variables

NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=

## 4. Deploy
Import repo into Vercel and deploy.

## 5. Admin dashboard
Visit:

/admin/leads
