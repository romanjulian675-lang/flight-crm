import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getI18n, type Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { requirePageAccess } from "@/lib/session";
import { permissions } from "@/modules/access";
import { PERIODS, teamStats, type MemberStats, type Period } from "@/modules/stats";
import { MilestonePicker } from "./milestone-picker";

export const metadata = { title: "Team" };

function duration(min: number | null, t: Dict) {
  if (min == null) return "—";
  if (min < 90) return fmt(t.team.minutes, { n: Math.round(min) });
  if (min < 48 * 60) return fmt(t.team.hours, { n: Math.round(min / 60) });
  return fmt(t.team.days, { n: Math.round(min / 1440) });
}
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Green/amber/red for speed-to-lead: the habit that matters most for new agents. */
function speedTone(min: number | null) {
  if (min == null) return "text-muted";
  if (min <= 15) return "text-emerald-700 font-semibold";
  if (min <= 120) return "text-amber-700 font-semibold";
  return "text-red-700 font-semibold";
}

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const ctx = await requirePageAccess();
  const { t } = await getI18n();
  const sp = await searchParams;
  const days = (PERIODS as readonly number[]).includes(Number(sp.days)) ? (Number(sp.days) as Period) : 30;
  const milestoneId = typeof sp.milestone === "string" ? sp.milestone : null;
  const { rows, totals, milestone, stages } = await teamStats(prisma, ctx, days, milestoneId);
  const everyone = permissions.viewTeam(ctx);
  const c = t.team.cols;

  const cells = (r: Pick<MemberStats, "newLeads" | "contacted" | "medianResponseMin" | "within1h" | "calls" | "connectedCalls" | "touches" | "milestone" | "enrolled" | "lost" | "openNow" | "noNextStepNow" | "overdueNow">) => [
    { k: "newLeads", v: r.newLeads },
    { k: "contacted", v: `${r.contacted}${r.newLeads ? ` (${pct(r.contacted / r.newLeads)})` : ""}` },
    { k: "response", v: duration(r.medianResponseMin, t), cls: speedTone(r.medianResponseMin) },
    { k: "within1h", v: pct(r.within1h) },
    { k: "calls", v: r.calls, sub: r.calls ? fmt(t.team.connected, { n: r.connectedCalls }) : undefined },
    { k: "touches", v: r.touches },
    { k: "milestone", v: r.milestone },
    { k: "enrolled", v: r.enrolled, cls: r.enrolled ? "text-emerald-700 font-semibold" : "" },
    { k: "lost", v: r.lost },
    { k: "conversion", v: r.newLeads ? pct(r.enrolled / r.newLeads) : "—" },
    { k: "openNow", v: r.openNow },
    { k: "noNextStep", v: r.noNextStepNow, cls: r.noNextStepNow ? "text-amber-700 font-semibold" : "" },
    { k: "overdue", v: r.overdueNow, cls: r.overdueNow ? "text-red-700 font-semibold" : "" },
  ];
  const headers: Record<string, string> = { ...c, milestone: milestone ? `${c.milestone}: ${milestone.name}` : c.milestone };

  return (
    <div className="mx-auto max-w-7xl">
      <AutoRefresh seconds={60} />
      <PageHeader
        title={everyone ? t.team.title : t.team.mine}
        subtitle={t.team.help}
        actions={
          <>
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
              {PERIODS.map((p) => (
                <Link
                  key={p}
                  href={`/team?days=${p}${milestoneId ? `&milestone=${milestoneId}` : ""}`}
                  className={`rounded-md px-2.5 py-1 ${p === days ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {fmt(t.team.period, { n: p })}
                </Link>
              ))}
            </div>
            <MilestonePicker stages={stages.map((s) => ({ id: s.id, name: s.name }))} value={milestone?.id ?? ""} days={days} label={t.team.milestone} />
          </>
        }
      />

      {/* Phones: one card per person */}
      <div className="space-y-3 lg:hidden">
        {rows.map((r) => (
          <Card key={r.membershipId} title={<PersonName name={r.name} paused={!r.acceptsLeads} t={t} />}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {cells(r).map((x) => (
                <div key={x.k}>
                  <dt className="text-xs text-muted">{headers[x.k]}</dt>
                  <dd className={`tabular-nums ${x.cls ?? ""}`}>{x.v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>

      {/* Desktop: leaderboard table */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium" />
              {cells(totals).map((x) => (
                <th key={x.k} className="px-3 py-2.5 text-right align-bottom font-medium">
                  {headers[x.k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.membershipId} className="hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  <PersonName name={r.name} paused={!r.acceptsLeads} t={t} />
                </td>
                {cells(r).map((x) => (
                  <td key={x.k} className={`px-3 py-2.5 text-right tabular-nums ${x.cls ?? ""}`}>
                    {x.v}
                    {x.sub && <div className="text-[11px] font-normal text-muted">{x.sub}</div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {everyone && rows.length > 1 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-medium">
              <tr>
                <td className="px-3 py-2.5">{t.team.total}</td>
                {cells(totals).map((x) => (
                  <td key={x.k} className={`px-3 py-2.5 text-right tabular-nums ${x.cls ?? ""}`}>
                    {x.v}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function PersonName({ name, paused, t }: { name: string; paused: boolean; t: Dict }) {
  return (
    <span className="flex items-center gap-2">
      <Avatar name={name} />
      <span className="font-medium">{name}</span>
      {paused && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-800">{t.team.paused}</span>}
    </span>
  );
}
