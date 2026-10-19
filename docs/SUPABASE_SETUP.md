# Connecting Supabase

When this is set up:

- Your notes, tasks and web apps are saved in a Supabase database and sync between your phone and computer once you sign in.
- **The database is managed from GitHub.** Each table is defined in a SQL file under `supabase/migrations/`. When one of those files reaches `main`, a GitHub Action applies it to Supabase, so you never have to create tables by hand.

The whole setup takes about 15 minutes, and you only do it once.

---

## Step 1: Create the Supabase project

1. Go to <https://supabase.com> and sign up. Signing in with GitHub is easiest.
2. Click **New project**.
   - **Name:** anything, e.g. `webtop`
   - **Database password:** click *Generate a password*, then **copy it somewhere safe**. You'll need it in Step 3.
   - **Region:** the one closest to you
3. Click **Create new project** and wait a minute or two while it starts.

## Step 2: Collect four values

Keep these in a note while you work. Steps 3 and 4 tell you where each one goes.

| Value | Where to find it | Used by |
| --- | --- | --- |
| **Project ID** (also called *Reference ID*, ~20 letters) | Project Settings → General | GitHub secret |
| **Database password** | from Step 1 (if you lost it: Project Settings → Database → *Reset database password*) | GitHub secret |
| **Access token** | <https://supabase.com/dashboard/account/tokens> → *Generate new token* (name it `github-actions`) | GitHub secret |
| **Project URL** + **Publishable key** | the **Connect** button at the top of the dashboard, or Project Settings → API Keys / Data API. Use the *publishable* key (`sb_publishable_…`) or the legacy *anon* key. **Never** use the *secret* / *service_role* key. | `js/config.js` |

## Step 3: Give GitHub access to Supabase

This lets GitHub create and update your tables.

1. Open your repository on GitHub, then go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** three times to add:

   | Name | Value |
   | --- | --- |
   | `SUPABASE_PROJECT_ID` | your Project ID |
   | `SUPABASE_DB_PASSWORD` | your database password |
   | `SUPABASE_ACCESS_TOKEN` | your access token |

3. Go to the **Actions** tab, then **Supabase database** in the left list, then **Run workflow** and pick the `main` branch.
4. Wait for the green tick. In Supabase, open **Table Editor**: you should see `notes`, `tasks` and `web_apps`.

If it goes red, click into the run to see the error. The usual causes are a mistyped secret or a wrong database password.

## Step 4: Point the dashboard at Supabase

1. On GitHub, open `js/config.js` and click the ✏️ (edit) button.
2. Fill in the two values:

   ```js
   export const SUPABASE_URL = 'https://abcdefghijkl.supabase.co';
   export const SUPABASE_ANON_KEY = 'sb_publishable_xxxxxxxx';
   ```

3. **Commit changes** to `main`.

It's safe for this key to be public: it can only do what the database security rules allow, and every table only lets a signed-in user see their own rows.

## Step 5: Set up sign-in

The dashboard signs in with **email + password**. The same sign-in is shared by every app.

1. In Supabase, go to **Authentication → URL Configuration**.
   - **Site URL:** your dashboard's address, e.g. `https://<your-github-name>.github.io/Tracking/`
   - **Redirect URLs:** add the same address, plus `http://localhost:8080/**` if you also run it locally.
   These are where the "confirm your email" and "reset password" links send you back to.
2. Check that **Authentication → Sign In / Providers → Email** is enabled. It is by default.

> Supabase's built-in email service only sends a few emails per hour. That's fine for personal use. For more, connect your own email provider under Authentication → Emails → SMTP Settings.

## Step 6: Publish and create your account

1. If you haven't already, publish the site: on GitHub go to **Settings → Pages**, choose *Deploy from a branch*, then `main` and `/ (root)`.
2. Open the site and click **Sign in** in the top bar, then **Create an account**. Enter your email and a password.
3. Click the confirmation link Supabase emails you, then sign in from the top bar.
4. Sign in on your other devices. Everything you created before signing in is uploaded to your account automatically.
5. **Optional (recommended for a personal dashboard):** stop strangers from creating accounts. In Supabase, go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Existing accounts keep working.

---

## Changing the database later (from GitHub)

Never edit tables in the Supabase dashboard. Add a new migration file instead, so GitHub stays the source of truth:

1. On GitHub: **Add file → Create new file**.
2. Name it `supabase/migrations/<timestamp>_<what>.sql`, where the timestamp is the date and time as `YYYYMMDDHHMMSS`, e.g. `supabase/migrations/20261101093000_habits.sql`. It must sort *after* every existing file.
3. Write the SQL. For a new app's table, copy one of the existing files (e.g. `…_tasks.sql`) and change the name and columns. Keep the `user_id` column, primary key, row level security policy and grant, which keep each person's data private.
4. Commit to a new branch and open a pull request. The Action does a **dry run** and shows what it would change.
5. Merge to `main`. The Action applies it for real.

**Rules:**

- Never edit or delete a migration file that has already run. If you want to change something, write a new file (e.g. `alter table …`).
- To remove an app's table, add a migration with `drop table if exists public.<name>;`.

## How the pieces fit

```
GitHub repo
├─ supabase/migrations/*.sql   ── GitHub Action (on push to main) ──▶  Supabase database
├─ js/config.js                 (project URL + publishable key)              ▲
└─ js/cloud.js                  ── signed-in browser reads/writes ───────────┘
```

- `js/cloud.js` keeps a copy of everything in the browser, so the dashboard opens instantly and works offline. Changes queue up and upload when you're back online.
- Signing out removes the account's data from that device. The cloud copy stays.
