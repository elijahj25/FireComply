# 🔥 FireComply

> Digital compliance records for commercial kitchen exhaust systems.
> Audit-ready. Mobile-first. Built for restaurants and service technicians.

---

## What it is

FireComply is a full-stack compliance management app for commercial kitchen
exhaust systems (hoods, ducts, fans, grease containment). It replaces paper
binders and email chains with a clean, mobile-first digital record system.

**Three roles. One system.**
- 🍽️ **Restaurant owners** — view compliance status, service history, photos, and repair approvals
- 🔧 **Technicians** — upload before/after photos, log deficiencies, submit service records
- ⚙️ **Admins** — manage all accounts, monitor all locations, approve repairs

---

## Tech Stack

| Layer               | Tool                        |
|---------------------|-----------------------------|
| Frontend            | React 18 + Vite             |
| Backend / Database  | Supabase (Postgres + RLS)   |
| Auth                | Supabase Magic Link (no passwords) |
| File Storage        | Supabase Storage            |
| Email Notifications | Resend                      |
| Push Notifications  | Web Push API (VAPID)        |
| PDF Generation      | jsPDF (in-browser)          |
| Edge Functions      | Supabase Edge (Deno)        |
| Hosting             | Vercel / Netlify            |

---

## Project Structure

```
firecomploy/
├── index.html                          # App entry point
├── vite.config.js                      # Vite + PWA config
├── package.json
├── .env.example                        # Environment variable template
│
├── public/
│   ├── manifest.json                   # PWA manifest
│   ├── sw.js                           # Service worker (push + offline)
│   ├── landing.html                    # Marketing landing page
│   └── icons/                          # App icons (add your own)
│
├── src/
│   ├── main.jsx                        # React entry + SW registration
│   ├── App.jsx                         # Main app (all 3 role views + auth)
│   └── lib/
│       ├── generateReport.js           # PDF compliance report generator
│       └── usePushNotifications.js     # Push notification hook + UI
│
└── supabase/
    ├── schema.sql                      # Full database schema + RLS policies
    └── functions/
        ├── notify-overdue/
        │   └── index.ts               # Daily cron: email overdue alerts
        └── push-send/
            └── index.ts               # Send push to subscribed users
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/yourname/firecomploy.git
cd firecomploy
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Dashboard → SQL Editor → paste and run `supabase/schema.sql`
3. Dashboard → Storage → create two buckets:
   - `service-photos` (private)
   - `compliance-reports` (private)

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in your `.env`:
```
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
```

### 4. Generate VAPID keys (push notifications)

```bash
npx web-push generate-vapid-keys
```

Save both keys — public goes in `.env`, both go into Supabase secrets.

### 5. Run locally

```bash
npm run dev
# → http://localhost:3000
```

---

## Supabase Edge Functions Setup

### Deploy functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

supabase functions deploy notify-overdue
supabase functions deploy push-send
```

### Set secrets

```bash
supabase secrets set RESEND_API_KEY=re_your_key
supabase secrets set VAPID_PUBLIC_KEY=your_public_key
supabase secrets set VAPID_PRIVATE_KEY=your_private_key
supabase secrets set VAPID_EMAIL=mailto:alerts@yourdomain.com
supabase secrets set APP_URL=https://yourdomain.com
```

### Schedule daily notifications (Supabase Dashboard → Edge Functions → Schedules)

| Function        | Cron          | Meaning          |
|-----------------|---------------|------------------|
| notify-overdue  | `0 9 * * *`   | 9am UTC daily    |

### Test manually

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/notify-overdue \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

---

## Setting Up Users

After a user signs in for the first time, set their role in Supabase:

```sql
-- Make someone an admin
UPDATE profiles SET role = 'admin' WHERE email = 'admin@yourcompany.com';

-- Make someone a technician
UPDATE profiles SET role = 'technician' WHERE email = 'jake@yourcompany.com';

-- Link a restaurant user to a location
INSERT INTO location_users (location_id, user_id)
SELECT l.id, p.id
FROM locations l, profiles p
WHERE l.name = 'The Rustic Table'
  AND p.email = 'maria@restaurant.com';
```

---

## Key Features

| Feature                  | Description                                               |
|--------------------------|-----------------------------------------------------------|
| Magic Link Auth          | No passwords — email link login for all users            |
| Role-Based Access        | RLS enforced at database level                            |
| Service Records          | Full history with technician, date, notes, status         |
| Before/After Photos      | Upload directly from phone, stored in Supabase Storage    |
| PDF Report Generation    | Branded compliance reports, generated in-browser (jsPDF)  |
| Deficiency Tracking      | Log issues with severity; track open → resolved           |
| Repair Approvals         | Restaurant owners approve/deny recommendations            |
| Email Notifications      | Overdue alerts + 7/14-day reminders via Resend            |
| Push Notifications       | Browser push (PWA) for on-device alerts                   |
| Installable PWA          | Add to home screen on iOS and Android                     |
| Audit Export             | One-tap download of full compliance history               |

---

## Deployment

### Vercel (recommended)

```bash
npm run build
npx vercel --prod
```

Or connect your GitHub repo in the Vercel dashboard — auto-deploys on push.

Set environment variables in Vercel Dashboard → Settings → Environment Variables.

### Netlify

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

---

## Auth Flow (Magic Link)

```
User enters email
      ↓
Supabase sends magic link email
      ↓
User clicks link → redirected to app with #access_token in URL
      ↓
App reads token, stores in localStorage
      ↓
Profile loaded from `profiles` table
      ↓
Role-based view rendered (restaurant / technician / admin)
```

---

## Database Schema Overview

| Table                | Purpose                                      |
|----------------------|----------------------------------------------|
| `profiles`           | Extends auth.users with role                 |
| `locations`          | Restaurant locations                         |
| `location_users`     | Links users to their locations               |
| `services`           | Service visit records                        |
| `service_photos`     | Before/after photos per service              |
| `issues`             | Deficiencies logged per service              |
| `repairs`            | Repair recommendations with approval status  |
| `push_subscriptions` | Browser push subscriptions per user          |

Full schema with RLS policies and triggers: `supabase/schema.sql`

---

## Estimated Monthly Cost

| Service          | Plan        | Cost     |
|------------------|-------------|----------|
| Supabase         | Free tier   | $0       |
| Vercel           | Hobby       | $0       |
| Resend           | Free tier   | $0       |
| **Total**        |             | **$0**   |

Free tiers cover ~500 users, 1GB storage, 3,000 emails/month, 100GB bandwidth.
Upgrade when you scale.

---

## Roadmap

- [ ] In-app repair chat / messaging
- [ ] QR code per location for fast technician check-in
- [ ] Multi-language support (Spanish first)
- [ ] Stripe billing integration for SaaS model
- [ ] Customer-facing status page per location
- [ ] Bulk CSV export for enterprise
- [ ] iOS/Android native app (Capacitor)

---

## License

MIT — use it, fork it, build on it.

---

*Built with React, Supabase, jsPDF, and Resend.*
*Compliant with NFPA 96 documentation requirements.*
