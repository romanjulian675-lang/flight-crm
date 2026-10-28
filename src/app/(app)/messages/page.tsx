import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n";
import { formatDate, fullName } from "@/lib/format";
import { requirePageAccess } from "@/lib/session";
import { socialInbox } from "@/modules/social-messages";
export const metadata = { title: "Messenger & Instagram" };
export default async function MessagesPage() {
  const ctx = await requirePageAccess();
  const { locale } = await getI18n();
  const es = locale === "es";
  const conversations = await socialInbox(prisma, ctx);
  return <div className="mx-auto max-w-4xl space-y-5">
    <AutoRefresh seconds={10} />
    <PageHeader title={es ? "Messenger e Instagram" : "Messenger & Instagram"} subtitle={es ? "Mensajes nuevos y respuestas de la escuela." : "New messages and school replies."} />
    <Link className="text-sm text-blue-700 underline" href="/integrations">{es ? "Conectar cuentas y revisar el estado" : "Connect accounts and check status"}</Link>
    {conversations.length === 0 ? <p className="rounded-lg border border-line bg-white p-6 text-sm text-muted">{es ? "Todavía no hay mensajes. Conecta los canales y envía un mensaje de prueba desde una cuenta autorizada por Meta." : "No messages yet. Connect the channels, then test with an account allowed by Meta."}</p> :
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">{conversations.map(c => <li key={c.id}><Link href={`/messages/${c.id}`} className="block p-4 hover:bg-slate-50">
        <div className="flex justify-between gap-3"><strong>{fullName(c.lead)}</strong><span className="text-xs text-muted">{formatDate(c.lastMessageAt, locale, ctx.timeZone, true)}</span></div>
        <p className="text-xs text-blue-700">{c.channel === "MESSENGER" ? "Facebook Messenger" : "Instagram Direct"}{c._count.messages > 0 ? ` · ${c._count.messages} ${es ? "sin leer" : "unread"}` : ""}</p>
        <p className="mt-1 truncate text-sm text-muted">{c.messages[0]?.body ?? (es ? "Archivo adjunto" : "Attachment")}</p>
      </Link></li>)}</ul>}
    <p className="text-xs text-muted">{es ? "Se muestran hasta 100 conversaciones. Las identidades de redes sociales se mantienen separadas hasta que confirmes los datos del contacto." : "Showing up to 100 conversations. Social identities stay separate until you confirm the contact’s details."}</p>
  </div>;
}
