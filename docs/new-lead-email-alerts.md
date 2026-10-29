# New-lead email alerts

Owner requirement: send to juan.chiquiza@cgflightacademy.com and julian.torres@cgflightacademy.com for new leads only, using a dedicated notification sender. Do not enable every-message alerts or send to prospective students.

## Setup

1. Create the academy’s Resend account and verify a dedicated sending subdomain (proposed: notify.cgflightacademy.com). Add only the specific provider-supplied DNS records. Preserve the root domain’s Microsoft 365 MX/SPF and all existing website/mail records. A sending identity does not create a mailbox.
2. After domain verification, create a sending-only API key restricted to that domain. Store as Production-only RESEND_API_KEY in Vercel. Set LEAD_ALERT_FROM to CG Flight Academy CRM <crm@notify.cgflightacademy.com>. Never commit the key. APP_URL already supplies the production CRM origin.
3. Deploy the additive migration and release. Preview/Development remain without production credentials.
4. CRM → Settings → New-lead email alerts. As owner, enter the two approved addresses, enable alerts and save. Settings default off for every school. Settings changes cancel pending alerts; an already in-flight send may finish.
5. Create one clearly labeled synthetic new lead. Verify both inboxes and provider delivery status. Then repeat the same intake and confirm no extra alert. Existing leads are not backfilled. SENT in the CRM means provider acceptance, not an inbox delivery receipt.

## Reliability and data

A unique per-lead outbox record commits in the same transaction as lead creation. All manual and automatic creation paths use insertLead, including the first social conversation. Repeated intake that merges an existing lead, webhook retries, subsequent DMs and outgoing replies do not queue a new-lead alert.

The authenticated existing minute scheduler processes at most two alerts per invocation. Jobs are leased for 60 seconds, retried at most eight times with bounded exponential backoff. The provider receives the same idempotency key and stable payload on retry. Automatic recovery stops 23 hours after first attempt, before Resend’s documented 24-hour idempotency window expires. Failed/unconfirmed jobs need provider inspection before manual recovery. Provider credentials and raw error responses are never stored in the job.

Email content is generic and includes only the authenticated CRM lead link; it omits the lead’s name, email, phone and message text. Resend processes the two recipient addresses, dedicated sender, generic notification and CRM link. CRM authentication and assignment permissions still control viewing the lead. Owner-only settings and recent status are scoped to the school. Deleting a lead cascades to its pending alert.

## Validation

Integration tests cover owner-only configuration, school isolation, disabled-by-default behavior, new-vs-merged intake, first-vs-subsequent social messages, concurrent workers, provider acceptance, stable retry keys/content, the deduplication deadline, missing provider configuration, cancellation, and lead deletion. Tests mock all email requests and use only the isolated local test database.

## Production verification — October 29, 2026

The owner approved DNS setup, a domain-restricted sending key, Production-only credential storage, deployment, enabling the two recipients and the synthetic test. Domain notify.cgflightacademy.com and all three DNS records are Verified; receiving remains off. Key scope is Sending access for that subdomain. The school’s Microsoft 365 MX/root SPF/DMARC are unchanged.

Production deployment 9EVa9YU43r5tZ1sCqV4Hfm5DVkqe is Ready from 30b89eb9428c64efe87a8953970b20f1bd0e894b. Owner settings show the email service configured and alerts enabled for exactly the two requested recipients. Test lead 961278fa-6c09-495a-bd4e-10c3bfcd7761 triggered one alert, recorded SENT in the CRM. Resend receipt 01a18811-3122-7f29-bc1f-fa87aa6f42e0 shows separate Delivered events for both recipients at 10:29 AM America/New_York. Delivery means mail-server acceptance, not human reading. The synthetic lead was closed Lost with a verification reason; no follow-ups or customer outreach remain.
