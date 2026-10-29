import { meetingEvidence } from "@/modules/pipeline-progress";
import { isManager } from "@/modules/access";
import { ConversationProgress } from "../progress-controls";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n";
import { formatDate, fullName } from "@/lib/format";
import { requirePageAccess } from "@/lib/session";
import { socialConversation } from "@/modules/social-messages";
import { SocialComposer } from "./composer";
export const maxDuration = 60;
export const metadata = { title: "Conversation" };
export default async function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  const ctx = await requirePageAccess();
  const { locale } = await getI18n(); const es = locale === "es";
  const c = await socialConversation(prisma, ctx, (await params).id);
  const enabled = c.channel === "MESSENGER" ? c.page.messengerEnabled : c.page.instagramEnabled;
  const open = enabled && c.replyWindowOpen;
  return <div className="mx-auto max-w-4xl space-y-4"><AutoRefresh seconds={8} />
    <Link href="/messages" className="text-sm text-blue-700 underline">{es ? "Todas las conversaciones" : "All conversations"}</Link>
    <PageHeader title={fullName(c.lead)} subtitle={`${c.channel === "MESSENGER" ? "Facebook Messenger" : "Instagram Direct"} · ${c.page.pageName}`} />
    <Link href={`/leads/${c.leadId}`} className="text-sm text-blue-700 underline">{es ? "Ver prospecto" : "View lead"}</Link>
    <ConversationProgress id={c.id} stage={(await prisma.pipelineStage.findUniqueOrThrow({ where: { id: c.lead.stageId } })).name} evidence={meetingEvidence(c.messages)} manager={isManager(ctx)} timeZone={ctx.timeZone} />
    <section className="overflow-hidden rounded-lg border border-line bg-white"><ol className="max-h-[55vh] space-y-3 overflow-auto bg-slate-50 p-4">{c.messages.map(m => <li key={m.id} className={`max-w-[90%] rounded-lg border border-line p-3 text-sm ${m.direction === "OUT" ? "ml-auto bg-blue-50" : "bg-white"}`}>
      <p className="mb-1 text-xs font-medium text-muted">{m.direction === "OUT" ? (es ? "Escuela" : "School") : (es ? "Contacto" : "Contact")}</p>
      <p className="whitespace-pre-wrap break-words">{m.body}</p>
      {m.attachmentTypes.length > 0 && <p className="text-xs text-muted">{es ? "Adjuntos" : "Attachments"}: {m.attachmentTypes.join(", ")} · {es ? "Ver en Meta Business Suite" : "View in Meta Business Suite"}</p>}
      <p className="mt-2 text-xs text-muted">{formatDate(m.receivedAt, locale, ctx.timeZone, true)} {m.direction === "OUT" ? ` · ${m.status}` : ""}</p>
      {m.error && <p className="mt-1 text-xs text-red-700">{es ? "Entrega sin confirmar. Revisa Meta Business Suite antes de enviar de nuevo." : m.error}</p>}
    </li>)}</ol><SocialComposer id={c.id} es={es} open={open} unread={c.messages.some(m => m.direction === "IN" && !m.readAt)} /></section>
    <p className="text-xs text-muted">{es ? "Se muestran los 100 mensajes más recientes. Los archivos adjuntos se abren en Meta Business Suite. Las respuestas automáticas están desactivadas." : "Showing the latest 100 messages. Open attachments in Meta Business Suite. Automatic replies are off."}</p>
  </div>;
}
