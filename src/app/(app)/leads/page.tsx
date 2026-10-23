import { AutoRefresh } from "@/components/auto-refresh";
import Link from "next/link";
import { Suspense } from "react";
import { LeadFilters } from "@/components/lead-filters";
import { Avatar, Empty, PageHeader, StageChip } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate, formatPhone, fullName } from "@/lib/format";
import { getI18n } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { requirePageAccess } from "@/lib/session";
import { permissions } from "@/modules/access";
import { listLeads, parseFilters } from "@/modules/leads";
import { listAssignable } from "@/modules/members";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const ctx = await requirePageAccess();
  const { t, locale } = await getI18n();
  const filters = parseFilters(await searchParams);
  const [leads, members] = await Promise.all([listLeads(prisma, ctx, filters), listAssignable(prisma, ctx)]);
  const c = t.leads.columns;
  return (
    <>
      <AutoRefresh />
      <PageHeader title={t.leads.title} subtitle={fmt(t.leads.count, { n: leads.length })} />
      <Suspense>
        <LeadFilters canSeeAll={permissions.seeAllLeads(ctx)} members={members.map((m) => ({ id: m.id, name: m.user.name }))} />
      </Suspense>
      {leads.length === 0 ? (
        <Empty>{t.lead.noLeads}</Empty>
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="space-y-2 md:hidden">
            {leads.map((l) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`} className="pressable block rounded-lg border border-line bg-white p-3 active:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{fullName(l)}</span>
                    <StageChip name={l.stage.name} color={l.stage.color} />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {[formatPhone(l.phone), t.program[l.program], t.source[l.source]].filter(Boolean).join(" · ")}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className="-mx-2 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs font-medium text-slate-500">
                <tr>
                  {[c.name, c.contact, c.stage, c.program, c.source, c.owner, c.created, c.lastContact].map((h) => (
                    <th key={h} scope="col" className="px-2 pb-2.5 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leads.map((l) => (
                  <tr key={l.id} className="relative cursor-pointer transition-colors hover:bg-slate-50">
                    <td className="px-2 py-3">
                      <Link href={`/leads/${l.id}`} className="font-medium whitespace-nowrap text-ink after:absolute after:inset-0 hover:text-accent hover:underline">
                        {fullName(l)}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-slate-600">
                      <div className="font-mono text-[13px]">{formatPhone(l.phone)}</div>
                      <div className="text-xs text-muted">{l.email}</div>
                    </td>
                    <td className="px-2 py-3">
                      <StageChip name={l.stage.name} color={l.stage.color} />
                    </td>
                    <td className="px-2 py-3 text-slate-600">{t.program[l.program]}</td>
                    <td className="px-2 py-3 text-slate-600">{t.source[l.source]}</td>
                    <td className="px-2 py-3">
                      {l.owner ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar name={l.owner.user.name} /> <span className="text-slate-600">{l.owner.user.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted">{t.common.unassigned}</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-slate-600">{formatDate(l.createdAt, locale, ctx.timeZone)}</td>
                    <td className={`px-2 py-3 ${l.lastContactAt ? "text-slate-600" : "font-medium text-amber-600"}`}>
                      {l.lastContactAt ? formatDate(l.lastContactAt, locale, ctx.timeZone) : t.lead.never}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
