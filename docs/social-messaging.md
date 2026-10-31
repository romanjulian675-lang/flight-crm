# Messenger and Instagram messages

This release adds new inbound text messages as leads and conversations, and lets authorized staff send explicit text replies from the CRM within 24 hours of the latest inbound message. It does not import old conversation history, send automatic replies, merge social identities with existing email/phone leads, or download attachments. Attachment types are recorded; staff can inspect media in Meta Business Suite. Conversation and inbox views show the latest 100 messages/conversations.

## Meta setup

1. In the existing academy app, add **Engage with customers on Messenger from Meta** and **Manage messaging & content on Instagram**. The Instagram professional account must be linked to the academy Page.
2. Request `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, plus the existing Page/webhook scopes. Only the explicit **Connect / refresh messaging permissions** flow requests these additional scopes. A normal Lead Ads refresh preserves existing messaging subscriptions.
3. Configure the existing CRM callback for both the **Page** and **Instagram** webhook objects: `https://flight-crm-theta.vercel.app/api/webhooks/meta`, using the existing private `META_VERIFY_TOKEN`. Subscribe to `messages` on both. Retain the Page `leadgen` subscription.
4. In CRM → Lead sources → Facebook & Instagram messages, start the messaging connection and authorize only the academy Page and business portfolio. The callback verifies the granted permissions, discovers the linked Instagram ID, and subscribes the business assets. Each channel reports Connected only after its subscription succeeds.
5. In Instagram settings, allow connected tools to access messages where required by Meta.
6. Complete Meta's access/publishing requirements. Until Meta grants the required access, app-role tests do not prove that messages from the general public will arrive. Do not label production messaging operational until an authorized external account has tested inbound and a staff-approved reply.

Credentials remain server-side, Page tokens encrypted. Reuse the approved production app secrets. No new public intake token or personal WhatsApp migration is required.

## Delivery and access

- Webhooks require the existing Meta app HMAC signature and recipient/asset matching. Disabled or unknown channels return 503 so Meta can retry. Invalid message envelopes return 400. Lead Ads handling remains intact.
- A school-row lock commits the lead, conversation, first follow-up task, message and timeline together. Retries are deduplicated by asset/channel/sender and provider message ID; provider message IDs are not treated as contact phone numbers.
- Inbox, conversations, marking read and sending all enforce the school and lead-assignment permissions. Managers can see the school; restricted agents see assigned leads only.
- Text replies are limited to 1,000 characters and the standard 24-hour window. The server rechecks the window and channel status. No automated or bulk sending is implemented.
- Each explicit send gets a request ID and durable pending row before the external call. Duplicate submissions cannot send twice. API acceptance marks Sent; this is not a delivered/read receipt. Timeouts/failures stay Unconfirmed/Failed and are never automatically retried. Check Meta Business Suite before trying again.
- Pause the shared Meta source to stop intake/sends, or revoke messaging permission at Meta. Disconnecting a Page with conversations retains its CRM message history, clears its local credential and pauses the channels. Revoking app access at Meta is a separate operation.

## Validation

Tests cover signed ingress, retries/concurrency, atomic failure recovery, asset/recipient validation, channel/tenant/agent separation, attachment metadata, timestamps, explicit scoped replies, idempotent sends, ambiguous failures, expired windows, opt-in scopes and both subscriptions. Outbound API calls in tests are mocked; tests never message real customers.
