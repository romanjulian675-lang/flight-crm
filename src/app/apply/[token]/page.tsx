import { notFound } from "next/navigation";
import { Plane } from "lucide-react";
import { prisma } from "@/lib/db";
import { readQuestionnaireConfig } from "@/lib/questionnaire";
import { findByToken } from "@/modules/integrations";
import { TrainingQuestionnaire } from "./questionnaire-form";

export const metadata = { title: "Find your flight training path", robots: { index: false } };
export default async function ApplyPage({ params, searchParams }: PageProps<"/apply/[token]">) {
  const { token } = await params;
  const integration = await findByToken(prisma, token);
  const config = readQuestionnaireConfig(integration?.config);
  if (!integration?.active || integration.kind !== "WEB_FORM" || !config.enabled) notFound();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: integration.orgId }, select: { name: true } });
  const sp = await searchParams;
  const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content"].map(k => [k, typeof sp[k] === "string" ? sp[k].slice(0, 120) : ""]));
  return <main className="min-h-screen bg-[#f6f4ef] text-[#142b43]">
    <header className="border-b border-[#142b43]/10 bg-white px-5 py-5"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4"><span className="flex items-center gap-3 font-bold"><Plane aria-hidden="true" />{org.name}</span><span className="text-xs tracking-widest uppercase">Your next chapter</span></div></header>
    <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 md:grid-cols-[0.8fr_1.2fr] md:py-16">
      <div><p className="mb-4 text-xs font-bold tracking-[0.2em] uppercase text-[#8a641f]">Find your training path</p><h1 className="text-4xl leading-tight font-semibold sm:text-5xl">Your future.<br />Your flight plan.</h1><p className="mt-5 text-lg leading-relaxed text-slate-600">A career in aviation, your next license, or your first time at the controls. Tell us where you want to go, and our team will help you plan the next step.</p><div className="mt-8 border-l-2 border-[#bc9044] pl-4 text-sm leading-relaxed text-slate-600">About 2 minutes · No commitment<br />Choose a path, then book a conversation.</div><p className="mt-8 text-xs leading-relaxed text-slate-500">This is a training inquiry, not an application or an eligibility assessment. Please do not submit identity documents, medical information or payment details.</p></div>
      <TrainingQuestionnaire token={token} meetingUrl={config.meetingUrl} emailEnabled={config.emailEnabled} utm={utm} school={org.name} />
    </div><footer className="mx-auto max-w-5xl px-5 pb-8 text-xs text-slate-500"><a className="underline" href="/privacy">Privacy</a> · <a className="underline" href="/data-deletion">Data deletion</a></footer>
  </main>;
}
