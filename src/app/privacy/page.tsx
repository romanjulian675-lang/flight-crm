import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Messaging Privacy Notice" };

const sections = [
  [
    "p",
    "CG Flight Academy uses its CRM to receive and respond to inquiries submitted through its connected Facebook Page and Instagram professional account, manage prospective-student follow-up, and keep inquiry history available to authorized academy staff."
  ],
  [
    "h2",
    "Information processed"
  ],
  [
    "p",
    "The CRM stores the connected academy account identifiers, the sender’s platform-scoped identifier, message text, message timestamps, attachment types, read state within the CRM, and the text and send status of staff replies. It creates a lead record and follow-up task for a new social conversation. Social identifiers are not treated as phone numbers, and contacts on different channels are not automatically combined. Staff may add contact details that you provide during an inquiry."
  ],
  [
    "p",
    "The current integration receives new messages after connection. It does not import previous conversation history or download attachment files. Staff can view attachments in Meta Business Suite. It does not send automatic replies or bulk marketing messages."
  ],
  [
    "h2",
    "Access and service providers"
  ],
  [
    "p",
    "Authorized academy staff use the information to answer inquiries and manage follow-up. CRM access is restricted by school and staff permissions. Meta provides Facebook, Instagram and their messaging APIs. The academy’s CRM is hosted on Vercel and uses Prisma Postgres for its database. Message content is transmitted to these providers as needed to operate the connection and the CRM. The CRM’s implementation does not sell message content or use it to train an academy AI model."
  ],
  [
    "p",
    "Page access credentials are stored encrypted on the CRM server. Required app secrets are stored in production hosting settings. The integration uses HTTPS and verifies Meta’s signature on incoming webhook requests."
  ],
  [
    "h2",
    "Retention and requests"
  ],
  [
    "p",
    "Messages and related lead history remain in the CRM until the academy deletes the applicable record. There is no automatic retention-expiry process in the current implementation. Disconnecting an account stops the connection but does not itself erase the CRM conversation history."
  ],
  [
    "p",
    "To request access to, correction of, or deletion of your CRM inquiry and conversation information, email julian.torres@cgflightacademy.com. Identify the Facebook or Instagram account used to contact the academy and the approximate date of the conversation. Do not send a password or identity document. The academy may ask for reasonable confirmation that the request concerns your information before acting on it."
  ],
  [
    "p",
    "Deleting information from the academy CRM does not delete the original messages or records held by Meta. Manage those records through the relevant Meta service."
  ],
  [
    "h2",
    "Contact"
  ],
  [
    "p",
    "CG Flight Academy\njulian.torres@cgflightacademy.com\nhttps://cgflightacademy.com"
  ]
] as const;

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <a href="https://cgflightacademy.com" className="text-sm font-semibold text-blue-800">CG Flight Academy</a>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Messaging Privacy Notice</h1>
      <p className="mt-3 text-sm text-slate-500">Updated October 28, 2026</p>
      <article className="mt-10 space-y-5 leading-7">
        {sections.map(([tag, text], index) => tag === "h2"
          ? <h2 key={index} className="pt-5 text-xl font-semibold">{text}</h2>
          : <p key={index} className="whitespace-pre-line">{text}</p>)}
      </article>
      <nav aria-label="Privacy information" className="mt-12 flex flex-wrap gap-6 border-t border-slate-200 pt-6 text-sm text-blue-800">
        <Link href="/privacy">Messaging privacy notice</Link>
        <Link href="/data-deletion">Request data deletion</Link>
        <a href="mailto:julian.torres@cgflightacademy.com">Contact the academy</a>
      </nav>
    </main>
  );
}
