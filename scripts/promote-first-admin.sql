-- Run this once, in the Supabase SQL editor, after signing up your first
-- user through the app's normal /login flow. Every new user defaults to
-- role USER (see migration 001) — this promotes one to ADMIN so there's a
-- way into the Admin panel at all.
--
-- Replace the email below, then run.

update profiles
set role = 'ADMIN'
where user_id = (select id from auth.users where email = 'you@example.com');
