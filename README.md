# FlightLeads (working name)

A CRM for flight schools, built multi-tenant so it can be sold to other schools. English + Spanish.
The product name is a placeholder: change it in `src/lib/brand.ts` and the `app` block of `src/lib/i18n/{en,es}.ts`.

## Run it locally

Requires Node 24+ (macOS: Homebrew's `node` works, `export PATH=/opt/homebrew/bin:$PATH`; Windows: `winget install OpenJS.NodeJS.LTS`).
Copy `.env.example` to `.env` and fill in the secrets first.

```bash
npm install
npm run dev:all        # local Postgres (port 5434, data in .pgdata) + app on http://localhost:3200
npm run db:migrate     # first time only, in another terminal
npm run db:seed        # demo school with 30 leads
```

Demo logins (password `demo-password-2026`): `owner@demo.local`, `manager@demo.local`, `ana@demo.local`, `luis@demo.local`.

Checks: `npm test` (84 tests, uses the `flightcrm_test` database), `npm run typecheck`, `npm run lint`.

## What's built (phases 1–2: CRM core)

- **Accounts & tenancy**: sign-up creates a school + owner + default pipeline. Every tenant table has `orgId`; every service filters by the caller's school (tests prove a school can't read or change another's data). Users can belong to several schools (switcher in the sidebar).
- **Roles**: Owner (everything), Manager (all leads, assign, invite agents), Agent (own leads; owner can let agents see all).
- **Invites**: copy/paste invite links (7 days, single use, only for the invited email). Email sending comes later.
- **Pipeline board**: drag-and-drop between stages (mouse, touch, keyboard), lost-reason prompt, days-in-stage, next follow-up/overdue on every card.
- **Leads list** with search (name/email/phone) and filters (owner, source, program), kept in the URL.
- **Quick add** (`N` key or the New lead button) with live duplicate warning by phone/email across the whole school.
- **Lead page**: one-tap Call / Text / WhatsApp / Email, log calls (with outcome) / notes / texts / emails / meetings, timeline, follow-up tasks, flight-school fields (program, medical, funding, timeline, international/TSA).
- **My tasks**: overdue / today / upcoming in the school's time zone.
- **Dashboard**: open leads, new this week, enrolled, my follow-ups, "waiting for first contact > 24h", funnel, leads by source.
- **Settings**: school, team & invites, pipeline stages (rename, reorder, color, add, delete when empty).

## Lead sources (phase 3)

Owners/managers: sidebar → **Lead sources**. Every source creates leads automatically, assigns them (round-robin between agents, a fixed person, or unassigned), adds a "contact now" task, merges repeat submissions into the existing lead (matched by email/phone), and logs every delivery under **Recent activity**. Pipeline, dashboard, leads and tasks refresh every 30 s.

| Source | How it connects | Endpoint |
|---|---|---|
| Website form | Paste the iframe snippet (or share the link). Captures UTM tags from the host page. Spam honeypot. | `/embed/<token>` → `POST /api/intake/<token>` |
| Other apps | Zapier "Webhooks → POST", Make HTTP, or any site. JSON or form-encoded; common field names in EN/ES are recognized, the rest goes into the note. | `POST /api/intake/<token>` |
| Google Ads lead forms | Lead form → Lead delivery → Webhook: our URL + generated key. | `POST /api/intake/google/<token>` |
| Facebook & Instagram Lead Ads | "Connect Facebook" (OAuth) → pages subscribed to `leadgen`; each lead fetched from the Graph API. | `GET/POST /api/webhooks/meta` |

**These only receive real traffic once the app is online at a public HTTPS address** (set `APP_URL`). Locally, use "Send test lead" or curl.

### Facebook setup (one time, for the product)

1. developers.facebook.com → Create app (type *Business*). Add **Facebook Login for Business** and **Webhooks**.
2. Facebook Login → Valid OAuth redirect URI: `APP_URL/api/integrations/meta/callback`.
3. Webhooks → *Page* object → callback `APP_URL/api/webhooks/meta`, verify token = `META_VERIFY_TOKEN`, subscribe to the `leadgen` field.
4. Set `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `APP_URL` on the server.
5. Before other schools can connect: Business Verification + App Review for `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `business_management`. Until then it works for people with a role on the app (you can test with your own page).
6. Each page's **Leads Access** (Meta Business Suite → Settings → Leads access) must allow the app.

Page tokens are stored AES-256-GCM encrypted; webhook bodies are checked against the app-secret signature.

## Team (phase 4)

- **Assignment rules** (Lead sources page): "if the lead speaks / wants / comes from … → rotate between these people", checked top to bottom, then the default (round-robin between agents, or unassigned). Each person has a **Receiving leads** switch (Settings → Team) to pause them (vacation, full pipeline); agents can pause themselves.
- **Playbooks**: every stage has a script and a checklist, shown on the lead page; ticks are saved per lead. New schools get a suggested flight-school playbook (EN/ES). Owners edit them in Settings → Pipeline stages; "Fill empty stages…" adds the suggested text to schools created earlier (`npx tsx scripts/fill-playbooks.ts` does it for every school).
- **Required next step**: logging a call/text/email/meeting on an open lead with nothing scheduled requires scheduling the follow-up in the same form (school setting, on by default). "No next step" filter on the pipeline/leads, and a dashboard card.
- **Team stats** (`/team`): per person for 7/30/90 days — new leads, contacted, median first response (green ≤ 15 min, amber ≤ 2 h, red after), share reached within 1 h, calls (connected), touches, leads moved to a chosen milestone stage, enrolled, lost, conversion, and right-now open leads / no next step / overdue tasks. Agents see only their own row.

## WhatsApp (Meta Cloud API)

Lead sources → **WhatsApp Business**. Each school connects its own number (Phone number ID, WhatsApp Business Account ID, permanent system-user token, Meta app secret — stored encrypted) and pastes the webhook URL + verify token we show into its Meta app → WhatsApp → Configuration (field `messages`).

- **Inbound**: a new number becomes a lead (source WhatsApp, language guessed from the first message, assignment rules, "contact now" task, optional instant auto-reply). Later messages attach to the lead. A reply counts as contact (speed-to-lead).
- **Lead page chat**: send/receive with sent / delivered / read ticks. Free text only within 24 h of the lead's last message (Meta rule); after that, approved templates with their {{1}}… values (first one pre-filled with the lead's first name).
- **Inbox** (`/inbox`, sidebar "WhatsApp" with unread count): every conversation, newest first.
- Webhook: `GET/POST /api/webhooks/whatsapp/<token>` — signature checked with that school's app secret; retries are idempotent (message ids are unique).
- Cost: Meta bills WhatsApp conversations/template messages per its current pricing; replies within the 24 h window to someone who wrote first are the cheap/free case. Check Meta's pricing page for your country.

## Layout

- `prisma/schema.prisma` — data model (comments explain conventions). Migrations in `prisma/migrations`.
- `src/modules/*` — business logic; all tenancy/permission checks live here (`access.ts`).
- `src/app/actions/*` — server actions (thin wrappers around modules).
- `src/app/(app)/*` — signed-in pages; `src/app/(auth)/*` — login, sign-up, invite, welcome.
- `src/lib/i18n/{en,es}.ts` — all UI text. Service errors are keys under `errors`.
- `tests/` — integration tests against a real Postgres.

## Next phases

3. ~~Lead intake~~ — done (see Lead sources). Still to add: TikTok Lead Gen native, Instagram/Messenger DMs, inbound calls (Twilio).
4. ~~Team~~ — done (see Team).
5. Messaging: email/SMS templates + automated follow-ups, consent tracking (TCPA / CAN-SPAM).
6. Selling it: Stripe plans, landing page, onboarding, terms & privacy.
7. Integrations: push enrolled students to Flight Deck.

## Durable Meta lead delivery

Meta notifications are now saved before fetching lead data, with bounded immediate processing,
retry/backoff, lease recovery, and manager recovery controls in Lead sources. Successful intake and
external-ID logging commit atomically to prevent duplicates under concurrent retries. Current CF7
name/email/message field names are also recognized.

**Deployment requires the additive migration and a protected scheduled processor.**
Vercel production uses the once-per-minute schedule in `vercel.json`; configure `CRON_SECRET` before deployment. The `build:vercel` command validates production configuration and applies migrations before building. Preview/local builds never migrate automatically.
See [Meta intake operations](docs/meta-intake-operations.md) for staging, production configuration,
smoke tests, capacity limits, and rollback steps.


## Campaign attribution

Public forms retain `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`.
A recognized `utm_source` attributes an inquiry to Instagram, Facebook or YouTube when no
explicit/provider source is supplied. Unknown sources use the integration default. Campaign
and video details remain in the inquiry timeline, including repeat submissions, without
replacing the original contact source. Adding tracked links to public channels remains a
separate activation step after hosting and end-to-end testing.
