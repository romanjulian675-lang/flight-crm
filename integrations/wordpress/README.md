# CG Flight website connector

The `cgflight-crm` plugin connects one selected Contact Form 7 form to the academy CRM. It starts disabled. It preserves the form, Flamingo storage and existing email behavior. It forwards an explicit contact-field allowlist, excluding files, passwords and application documents.

## Installation

1. Zip the `cgflight-crm` directory, then upload it through WordPress → Plugins → Add Plugin → Upload Plugin and activate it.
2. Open Settings → CRM website connection. Select **Main Contact Form** (production post ID 83).
3. Copy the private intake URL from the CRM's **Website — main contact form** source. Enter it in the password field and enable delivery. Never put this URL in public pages or source control.
4. Save the connection. Accepted future submissions enter the durable delivery queue. Spam, invalid and aborted submissions are ignored.
5. Check the delivery queue after a permitted test. A successful CRM acknowledgment changes the row to DONE and clears the queue's copied contact data and intake URL.

Only the existing academy HTTPS intake host is accepted. Changing the CRM domain requires a reviewed code change. Shop reservations and student applications remain separate.

## Operations

WordPress cron runs the queue every minute when scheduling is triggered by traffic. For reliable timing on a quiet site, configure the hosting provider's server cron to run WordPress scheduled tasks. Each run handles at most two deliveries; failures back off from one minute to one hour, with eight attempts before FAILED. Administrators can retry a saved failed delivery. Original delivery IDs are preserved, allowing CRM duplicate detection after uncertain network responses.

Uncheck Enable delivery or deactivate the plugin to pause sending. Pending rows remain saved. Deactivation does not remove the table or settings. An administrator must reconcile any capture-error notice against Flamingo. This plugin cannot guarantee capture if WordPress itself cannot save the queue.

## Verification

The WordPress Playground harness intercepts all HTTP requests; it never contacts the production CRM. Mount the plugin directory at `/wordpress/wp-content/plugins/cgflight-crm` and `tests` at `/tests`, then run the blueprint using the official `@wp-playground/cli` package:

```sh
npm exec --yes --package=@wp-playground/cli -- wp-playground-cli run-blueprint --php=8.3 --mount "$PWD/cgflight-crm:/wordpress/wp-content/plugins/cgflight-crm" --mount "$PWD/tests:/tests" --blueprint "$PWD/tests/blueprint.json"
```

Inspect `tests/result.json` for the result. The harness checks persistence, retries, stable IDs, duplicate acknowledgment, concurrent leases, expired leases, field restrictions, destination validation, spam filtering, disabling, permission checks and the administrator display.
