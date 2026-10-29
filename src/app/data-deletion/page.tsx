import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Request deletion of CRM information" };

const sections = [
  [
    "p",
    "To request deletion of your inquiry and conversation information from CG Flight Academy’s CRM, email julian.torres@cgflightacademy.com with the subject “CRM data deletion request”."
  ],
  [
    "h2",
    "What to include"
  ],
  [
    "p",
    "Identify the Facebook or Instagram account you used to contact the academy and the approximate date of the conversation. If you also supplied an email address or phone number during your inquiry, include it to help locate the record. Do not send passwords or identity documents."
  ],
  [
    "h2",
    "What happens next"
  ],
  [
    "p",
    "The academy may ask for reasonable confirmation that the request concerns your information. Academy staff will review the request and arrange deletion of the applicable CRM inquiry and conversation records. You can use the same email address to ask about the status of your request."
  ],
  [
    "h2",
    "Scope of deletion"
  ],
  [
    "p",
    "Disconnecting Facebook or Instagram does not itself erase CRM history. Deletion from the academy CRM does not delete original messages or records held by Meta; manage those records through the relevant Meta service."
  ]
] as const;

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <a href="https://cgflightacademy.com" className="text-sm font-semibold text-blue-800">CG Flight Academy</a>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Request deletion of CRM information</h1>
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
