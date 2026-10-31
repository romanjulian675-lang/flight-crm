import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { readQuestionnaireConfig } from "@/lib/questionnaire";
import { findByToken } from "@/modules/integrations";
import { DiscoveryRequest } from "./request-form";

export const metadata = { title: "Book your next step", robots: { index: false } };
export default async function NextStepPage({ params, searchParams }: PageProps<"/next/[token]">) {
  const { token } = await params;
  const integration = await findByToken(prisma, token);
  const config = readQuestionnaireConfig(integration?.config);
  if (!integration?.active || integration.kind !== "WEB_FORM" || !config.enabled) notFound();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: integration.orgId }, select: { name: true } });
  const step = (await searchParams).step;
  return <main className="min-h-screen bg-[#f6f4ef] px-5 py-12 text-[#142b43]"><div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><p className="mb-4 text-xs font-bold tracking-widest uppercase">{org.name}</p>{step === "meeting" ? <><h1 className="text-3xl font-semibold">Let’s talk about your flight plan.</h1><p className="my-5 text-slate-600">Choose a time for a 30-minute online meeting with a representative. Microsoft Bookings checks Julian’s Outlook availability and sends the meeting confirmation.</p>{config.meetingUrl && <a className="block rounded-lg bg-[#142b43] p-3 text-center font-semibold text-white" href={config.meetingUrl} rel="noreferrer">Choose a meeting time</a>}<p className="mt-4 text-xs text-slate-500">A booking is confirmed after you complete the calendar form and receive its confirmation.</p></> : <><h1 className="text-3xl font-semibold">Experience your first flight.</h1><p className="my-5 text-slate-600">Tell us when you’d like to visit. Our team will confirm discovery-flight pricing, aircraft and instructor availability before you commit.</p><DiscoveryRequest token={token} /></>}<p className="mt-6 text-xs text-slate-500"><a className="underline" href="/privacy">Privacy</a> · <a className="underline" href={`/apply/${token}`}>Training questionnaire</a></p></div></main>;
}
