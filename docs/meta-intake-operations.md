# Reliable Meta lead intake on Vercel

## What this increment changes

Signed notifications for known Facebook Pages are saved as `MetaLeadJob` records before Graph API calls. The webhook immediately attempts up to two deliveries. Failures remain pending with backoff (one minute, doubling up to one hour), then need manual recovery after eight attempts. Provider retries do not reset a completed job or its backoff. An interrupted worker has a 60-second lease; another invocation can recover it. Completion requires a saved lead, not just a provider acknowledgment.

Lead mutations and successful intake-event IDs now commit together, with a per-school database lock to serialize simultaneous matching across integrations. A crash after intake commits but before job completion is safe: the next attempt detects the recorded external ID. Existing CF7 name/email/message fields now normalize correctly. This does not yet install the WordPress connector or create shop reservation records.

The Lead sources page shows unfinished deliveries first (up to 30 total), attempts and the next scheduled attempt. Owners/managers can retry; agents and other schools cannot. A running lease cannot be stolen. Reopening a failed job resets its attempt budget explicitly.

## Required deployment steps

1. Deploy initially to an isolated preview/staging database. Apply `npm run db:migrate` using that environment's database, then build/test. Do not run local demo seed scripts on production.
2. Back up production, apply the additive migration `20261026223000_meta_lead_jobs`, then deploy the application. No existing rows are changed by this migration.
3. Set a strong random `CRON_SECRET` as a **server-only Production environment variable**. Keep existing Meta and encryption secrets. Do not paste secrets into issues or URLs.
4. Enable a production scheduler to call `GET /api/jobs/meta` with `Authorization: Bearer <CRON_SECRET>`. Vercel Cron sends this header when `CRON_SECRET` is configured. Confirm the Vercel plan supports the chosen cadence before adding a `crons` entry to `vercel.json`. A once-per-minute schedule is an initial low-volume choice, not a throughput guarantee. No schedule is installed by this PR because the project's plan and existing scheduler configuration are unknown.
5. Example configuration to merge into the deployment config **after confirming cadence/plan**, not an instruction to overwrite unrelated config:

   ```json
   { "crons": [{ "path": "/api/jobs/meta", "schedule": "* * * * *" }] }
   ```

6. Confirm the job endpoint returns 401 without/with an incorrect secret and 200 with the correct scheduler request. Each invocation processes at most two due jobs. Watch backlog age and volume; higher traffic needs a dedicated durable queue/consumer or increased bounded capacity. Do not assume pending jobs execute without the scheduler.
7. Connect a test Page and submit a real test lead. Confirm contact, assignment, task, intake activity, and completed delivery. Simulate a transient provider failure in staging, invoke the scheduler after backoff, and confirm recovery without duplicates.
8. Disable real integrations in previews; use separate test accounts, secrets, and databases. No production account was connected by this increment.

Cron requests have a 30-second function budget; Graph calls time out after eight seconds. Retry state is in PostgreSQL, not memory. Two workers may invoke together but only one owns a job lease. Pending/completed rows store provider IDs, not the lead's raw message or access token. Current intake error logs retain the existing behavior; future retention work should cover both tables.

## Monitoring and recovery

- Alert when pending deliveries are overdue, failed jobs appear, or scheduler invocations stop. The UI's next-attempt time is eligibility, not proof of a scheduler run.
- Check Page connection, app permissions/lead access, and Recent activity before manual retry. Reconnect the original Page if disconnected; a job must never route into another school.
- Unknown Pages return 503 rather than silently acknowledging a lead that cannot be routed. No tenant is inferred from submitted names or email.
- If persistence fails, the webhook returns 503 so Meta can retry. Once persisted, Graph errors can be acknowledged safely because the scheduler owns recovery.
- Review worker throughput before running a large historical import. This is a bounded first increment, not the final cross-channel queue platform.

## Rollback

Disable the scheduler and restore the previous app build if necessary. Leave the additive job table in place so pending notifications are not destroyed. The previous webhook does not drain saved jobs; reconcile pending deliveries before calling rollback complete. Resume the updated processor after fixing the cause. Do not drop the table during an incident.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm test` with a dedicated local test database, and a production build. Tests include retry/backoff, concurrent workers, expired leases, attempt exhaustion, tenant/role boundaries, signed malformed payloads, scheduler authorization, concurrent intake deduplication and current CF7 fields.

References: [Vercel Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
