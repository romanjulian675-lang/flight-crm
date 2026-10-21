import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { Avatar, Empty, PageHeader, StageChip } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, formatPhone, fullName } from "@/lib/format";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { requirePageAccess } from "@/lib/session";
import { getAccount, inbox } from "@/modules/whatsapp";

export const metadata = { title: "WhatsApp" };

export default async function InboxPage() {
  const ctx = await requirePageAccess();
  if (!(await getAccount(prisma, ctx.orgId))) redirect("/");
  const { t, locale } = await getI18n();
  const rows = await inbox(prisma, ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <AutoRefresh seconds={10} />
      <PageHeader title={t.whatsapp.inboxTitle} />
      {rows.length === 0 ? (
        <Empty>{t.whatsapp.inboxEmpty}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {rows.map((m) => {
            const awaitingUs = m.direction === "IN";
            return (
              <li key={m.leadId}>
                <Link href={`/leads/${m.leadId}#whatsapp`} className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 ${m.unread ? "bg-emerald-50/60" : ""}`}>
                  <Avatar name={fullName(m.lead)} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`truncate ${m.unread ? "font-semibold" : "font-medium"}`}>{fullName(m.lead)}</span>
                      <span className="text-xs text-muted">{formatPhone(m.lead.phone)}</span>
                      <StageChip name={m.lead.stage.name} color={m.lead.stage.color} />
                    </div>
                    <p className={`mt-0.5 truncate text-sm ${m.unread ? "text-slate-900" : "text-slate-500"}`}>
                      {m.direction === "OUT" && <span className="text-slate-400">{t.whatsapp.you}: </span>}
                      {m.body}
                    </p>
                    {m.lead.owner && <p className="mt-0.5 text-xs text-muted">{m.lead.owner.user.name}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <time className="text-xs text-muted">{formatDate(m.createdAt, locale, ctx.timeZone, true)}</time>
                    {m.unread > 0 ? (
                      <span className="rounded-full bg-[#25D366] px-2 text-xs font-semibold text-white">{fmt(t.whatsapp.unread, { n: m.unread })}</span>
                    ) : (
                      awaitingUs && <span className="text-[11px] text-amber-700">{t.whatsapp.replyNeeded}</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
