import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Avatar, Card, Empty, PageHeader, stageStyle } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getI18n, type Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/format";
import { requirePageAccess } from "@/lib/session";
import { getReports, parsePeriod, REPORT_PERIODS, STUCK_DAYS, type Reports } from "@/modules/reports";

export const metadata = { title: "Reports" };

/**
 * The screen's question: "Where are we losing future students, and who turns leads into students?"
 * The funnel answers the first and is the biggest block; the finding (the step with the largest
 * drop) is the line under the title.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const ctx = await requirePageAccess();
  const { t, locale } = await getI18n();
  const days = parsePeriod((await searchParams).days);
  const r = await getReports(prisma, ctx, days);
  const tr = t.reports;

  const drop = r.biggestDrop !== null ? r.funnel[r.biggestDrop] : null;
  const finding = drop
    ? fmt(tr.finding, { from: r.funnel[r.biggestDrop! - 1].name, to: drop.name, n: drop.dropped, of: r.funnel[r.biggestDrop! - 1].count })
    : tr.noFinding;

  return (
    <div className="mx-auto max-w-[1240px] min-w-0">
      <AutoRefresh seconds={120} />
      <PageHeader
        title={tr.title}
        subtitle={r.cohortSize ? <span className={drop ? "font-medium text-ink" : undefined}>{finding}</span> : tr.empty}
        actions={<PeriodPicker days={days} t={t} />}
      />

      <Kpis r={r} t={t} days={days} />

      <div className="mt-6 grid items-start gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0" title={tr.funnel} action={<span className="text-xs text-slate-500">{tr.periods[days]}</span>}>
          <p className="-mt-1 mb-5 text-sm text-slate-500">{tr.funnelHint}</p>
          {r.cohortSize ? <Funnel r={r} t={t} /> : <Empty>{tr.empty}</Empty>}
        </Card>
        <NowRail r={r} t={t} />
      </div>

      {/* Channels get the width (it's a picture); people and losses stack beside it. */}
      <div className="mt-6 grid items-start gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Sources r={r} t={t} />
        <div className="space-y-6">
          {r.team && <Team r={r} t={t} />}
          <LostReasons r={r} t={t} />
        </div>
      </div>

      <div className="mt-6">
        <Trend r={r} t={t} locale={locale} tz={ctx.timeZone} />
      </div>
    </div>
  );
}

const pct = (v: number | null, digits = 0) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

function duration(min: number | null, t: Dict) {
  if (min == null) return "—";
  if (min < 90) return fmt(t.team.minutes, { n: Math.round(min) });
  if (min < 48 * 60) return fmt(t.team.hours, { n: Math.round(min / 60) });
  return fmt(t.team.days, { n: Math.round(min / 1440) });
}

function speedTone(min: number | null) {
  if (min == null) return "text-slate-400";
  if (min <= 15) return "text-emerald-700";
  if (min <= 120) return "text-amber-700";
  return "text-red-700";
}

function PeriodPicker({ days, t }: { days: number; t: Dict }) {
  return (
    <nav aria-label="Period" className="flex rounded-md border border-line bg-raised p-0.5 text-sm">
      {REPORT_PERIODS.map((p) => (
        <Link
          key={p}
          href={`/reports?days=${p}`}
          aria-current={p === days ? "page" : undefined}
          className={`rounded-[5px] px-3 py-1 ${p === days ? "border border-line bg-white font-medium text-ink shadow-xs" : "border border-transparent text-slate-600 hover:text-ink"}`}
        >
          {t.reports.periods[p]}
        </Link>
      ))}
    </nav>
  );
}

/** A change says good or bad, not up or down; zero and "no baseline" stay grey. */
function Delta({ now, prev, betterWhen, t, days, format }: { now: number | null; prev: number | null; betterWhen: "up" | "down"; t: Dict; days: number; format: (n: number) => string }) {
  const base = fmt(t.reports.vsPrev, { days });
  // No baseline (nothing before, or the previous window was empty): a delta would only be noise.
  if (now == null || prev == null || prev === 0) return <span className="text-slate-400">{t.reports.noPrev}</span>;
  const diff = now - prev;
  if (diff === 0) return <span className="text-slate-400">= {base}</span>;
  const good = betterWhen === "up" ? diff > 0 : diff < 0;
  return (
    <span>
      <span className={`font-medium ${good ? "text-emerald-700" : "text-red-700"}`}>
        {diff > 0 ? "+" : "−"}
        {format(Math.abs(diff))}
      </span>{" "}
      <span className="text-slate-500">{base}</span>
    </span>
  );
}

function Kpis({ r, t, days }: { r: Reports; t: Dict; days: number }) {
  const k = r.kpis;
  const cells = [
    { label: t.reports.newLeads, value: String(k.newLeads.now), delta: <Delta now={k.newLeads.now} prev={k.newLeads.prev} betterWhen="up" t={t} days={days} format={String} /> },
    { label: t.reports.enrolled, value: String(k.enrolled.now), delta: <Delta now={k.enrolled.now} prev={k.enrolled.prev} betterWhen="up" t={t} days={days} format={String} /> },
    {
      label: t.reports.conversion,
      value: pct(k.conversion.now, 1),
      delta: <Delta now={k.conversion.now} prev={k.conversion.prev} betterWhen="up" t={t} days={days} format={(n) => `${(n * 100).toFixed(1)} pts`} />,
    },
    {
      label: t.reports.response,
      value: duration(k.responseMin.now, t),
      tone: speedTone(k.responseMin.now),
      delta: <Delta now={k.responseMin.now} prev={k.responseMin.prev} betterWhen="down" t={t} days={days} format={(n) => duration(n, t)} />,
    },
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4" style={{ gap: 1 }}>
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col gap-1.5 bg-white px-5 py-4">
          <span className="text-[13px] font-medium text-slate-500">{c.label}</span>
          <span className={`text-[30px] leading-none tracking-tight tabular-nums ${c.tone ?? "text-ink"}`}>{c.value}</span>
          <span className="text-xs tabular-nums">{c.delta}</span>
        </div>
      ))}
    </div>
  );
}

function Funnel({ r, t }: { r: Reports; t: Dict }) {
  const top = r.funnel[0]?.count || 1;
  return (
    <ol className="space-y-0">
      {r.funnel.map((s, i) => {
        const biggest = i === r.biggestDrop;
        const width = Math.max(s.count ? 1.5 : 0, (s.count / top) * 100);
        const isWon = s.kind === "WON";
        return (
          <li key={s.id}>
            {i > 0 && (
              <div className={`flex items-center gap-2 py-1.5 pl-[calc(8rem+12px)] text-xs flex-wrap sm:pl-[calc(11rem+12px)] tabular-nums ${biggest ? "text-red-700" : "text-slate-500"}`}>
                <ArrowDown size={12} />
                <span className={biggest ? "font-semibold" : undefined}>{fmt(t.reports.kept, { p: pct(s.fromPrev) })}</span>
                {s.dropped > 0 && <span>· {fmt(t.reports.lost, { n: s.dropped })}</span>}
                {biggest && <span className="rounded-full bg-red-50 px-2 py-px font-medium text-red-700">{t.reports.biggest}</span>}
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="flex w-32 shrink-0 items-center gap-2 text-sm sm:w-44">
                <span className={`h-2 w-2 shrink-0 rounded-full ${stageStyle(s.color).dot}`} />
                <span className={`truncate ${isWon ? "font-semibold text-ink" : "text-slate-700"}`}>{s.name}</span>
              </span>
              <div className="relative h-9 flex-1 rounded-md bg-raised">
                <div className={`h-9 rounded-md ${isWon ? "bg-emerald-600" : "bg-accent"}`} style={{ width: `${width}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right sm:w-24">
                <span className="block text-base leading-tight font-semibold text-ink tabular-nums">{s.count}</span>
                <span className="block text-xs text-slate-500 tabular-nums">{fmt(t.reports.ofTop, { p: pct(s.ofTop) })}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function NowRail({ r, t }: { r: Reports; t: Dict }) {
  const total = r.current.reduce((a, s) => a + s.count, 0);
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-ink">{t.reports.now}</h2>
        <span className="text-sm text-slate-500 tabular-nums">{total}</span>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line bg-white">
        {r.current.map((s) => (
          <li key={s.id}>
            <Link href="/pipeline" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
              <span className={`h-2 w-2 shrink-0 rounded-full ${stageStyle(s.color).dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{s.name}</span>
                <span className="block text-xs text-slate-500 tabular-nums">
                  {s.avgDays == null ? "—" : fmt(t.reports.avgDays, { d: Math.round(s.avgDays) })}
                  {s.stuck > 0 && <span className="font-medium text-amber-700"> · {fmt(t.reports.stuck, { n: s.stuck, days: STUCK_DAYS })}</span>}
                </span>
              </span>
              <span className={`text-xl tabular-nums ${s.count ? "text-ink" : "text-slate-300"}`}>{s.count}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/pipeline" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
        {t.reports.viewStage} <ArrowRight size={14} />
      </Link>
    </section>
  );
}

function Team({ r, t }: { r: Reports; t: Dict }) {
  const rows = r.team ?? [];
  const maxLeads = Math.max(1, ...rows.map((m) => m.leads));
  return (
    <Card title={t.reports.team}>
      <p className="-mt-1 mb-4 text-xs text-slate-500">{t.reports.teamHint}</p>
      {rows.length === 0 ? (
        <Empty>{t.reports.empty}</Empty>
      ) : (
        <ol className="space-y-4">
          {rows.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3">
              <span className={`w-4 text-sm tabular-nums ${i === 0 && m.enrolled > 0 ? "font-semibold text-accent" : "text-slate-400"}`}>{i + 1}</span>
              <Avatar name={m.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{m.name}</span>
                  <span className="text-lg leading-none font-semibold text-ink tabular-nums">{pct(m.conversion)}</span>
                </div>
                {/* One bar: all their leads (grey) with the enrolled part in green. */}
                <div className="mt-1.5 h-2.5 rounded-sm bg-raised">
                  <div className="relative h-2.5 rounded-sm bg-slate-300" style={{ width: `${(m.leads / maxLeads) * 100}%` }}>
                    <div className="absolute inset-y-0 left-0 rounded-sm bg-emerald-600" style={{ width: `${m.leads ? (m.enrolled / m.leads) * 100 : 0}%`, minWidth: m.enrolled ? 4 : 0 }} />
                  </div>
                </div>
                <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500 tabular-nums">
                  <span>{fmt(t.reports.teamBar, { e: m.enrolled, l: m.leads })}</span>
                  <span>
                    {t.reports.teamCols.response} <span className={`font-medium ${speedTone(m.responseMin)}`}>{duration(m.responseMin, t)}</span>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {r.unassigned > 0 && <p className="mt-4 text-xs font-medium text-amber-700">{fmt(t.reports.unassigned, { n: r.unassigned })}</p>}
    </Card>
  );
}

/**
 * Channels as a quadrant bubble chart: x = how many leads, y = how many of them enroll, bubble size =
 * students enrolled. Top-right is where to spend more; the owner reads it without reading numbers.
 */
function Sources({ r, t }: { r: Reports; t: Dict }) {
  const tr = t.reports;
  if (r.sources.length === 0)
    return (
      <Card title={tr.sources}>
        <Empty>{tr.empty}</Empty>
      </Card>
    );

  const W = 600;
  const H = 320;
  const pad = { l: 56, r: 20, t: 20, b: 40 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const niceStep = (max: number) => (max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : 50);
  const maxLeads = Math.max(...r.sources.map((s) => s.leads));
  const xStep = niceStep(maxLeads);
  const xMax = Math.ceil((maxLeads * 1.15) / xStep) * xStep || xStep;
  const maxConv = Math.max(...r.sources.map((s) => s.conversion));
  const yMax = Math.max(0.1, Math.ceil((maxConv * 1.25) / 0.05) * 0.05);
  const x = (v: number) => pad.l + (v / xMax) * iw;
  const y = (v: number) => pad.t + ih - (v / yMax) * ih;

  const totalLeads = r.sources.reduce((a, s) => a + s.leads, 0);
  const totalEnrolled = r.sources.reduce((a, s) => a + s.enrolled, 0);
  const avgConv = totalLeads ? totalEnrolled / totalLeads : 0;
  const avgLeads = totalLeads / r.sources.length;

  // Channels on the same spot share one bubble and one label.
  const groups = new Map<string, { leads: number; conversion: number; enrolled: number; names: string[] }>();
  for (const s of r.sources) {
    const key = `${s.leads}:${s.conversion.toFixed(4)}`;
    const g = groups.get(key) ?? { leads: s.leads, conversion: s.conversion, enrolled: 0, names: [] };
    g.enrolled += s.enrolled;
    g.names.push(t.source[s.source as keyof Dict["source"]]);
    groups.set(key, g);
  }
  const best = r.sources.filter((s) => s.enrolled > 0).sort((a, b) => b.conversion - a.conversion || b.enrolled - a.enrolled)[0];
  const bestName = best ? t.source[best.source as keyof Dict["source"]] : null;

  // Labels avoid each other and every bubble: try right, then left, then nudged up or down.
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const bubbles = [...groups.values()].map((g) => ({ g, cx: x(g.leads), cy: y(g.conversion), rad: 7 + Math.sqrt(g.enrolled) * 9 }));
  const obstacles: Box[] = bubbles.map((b) => ({ x0: b.cx - b.rad, x1: b.cx + b.rad, y0: b.cy - b.rad, y1: b.cy + b.rad }));
  const points = [...bubbles]
    .sort((a, b) => b.g.enrolled - a.g.enrolled || b.g.leads - a.g.leads)
    .map(({ g, cx, cy, rad }) => {
      const label = g.names.join(", ");
      const sub = g.enrolled ? fmt(g.enrolled === 1 ? tr.enrolledOne : tr.enrolledShort, { n: g.enrolled }) : "";
      const textW = Math.max(label.length * 6.6, sub.length * 6);
      const lines = sub ? 2 : 1;
      const self = { x0: cx - rad, x1: cx + rad, y0: cy - rad, y1: cy + rad };
      const others = obstacles.filter((o) => o.x0 !== self.x0 || o.y0 !== self.y0);
      const candidates = [0, -16, 16, -32, 32].flatMap((dy) => [false, true].map((left) => ({ left, dy })));
      const boxFor = (left: boolean, dy: number): Box => {
        const top = cy + dy - 11;
        return left ? { x0: cx - rad - 6 - textW, x1: cx - rad - 6, y0: top, y1: top + lines * 14 + 2 } : { x0: cx + rad + 6, x1: cx + rad + 6 + textW, y0: top, y1: top + lines * 14 + 2 };
      };
      const inside = (bx: Box) => bx.x0 >= 2 && bx.x1 <= W - 2 && bx.y0 >= pad.t && bx.y1 <= H - pad.b + 4;
      const choice =
        candidates.find(({ left, dy }) => {
          const bx = boxFor(left, dy);
          return inside(bx) && !obstacles.concat(others).some((o) => o !== self && hit(o, bx) && !(o.x0 === self.x0 && o.y0 === self.y0));
        }) ?? { left: cx + rad + 6 + textW > W - 4, dy: 0 };
      obstacles.push(boxFor(choice.left, choice.dy));
      const isBest = !!best && g.names.includes(bestName!);
      return { g, cx, cy, rad, label, sub, left: choice.left, ly: cy + choice.dy + 4, isBest };
    });

  const xTicks = Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, i) => i * xStep);
  const yTicks = [0, yMax / 2, yMax];

  return (
    <Card title={tr.sources} action={<span className="text-xs text-slate-500">{tr.sourcesHint}</span>}>
      <p className={`-mt-1 mb-3 text-sm ${best ? "font-medium text-ink" : "text-slate-500"}`}>{best ? fmt(tr.bestChannel, { name: bestName!, p: pct(best.conversion) }) : tr.noBestChannel}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr.sources} className="h-auto w-full overflow-visible font-sans">
        <title>{tr.sources}</title>
        {/* Quadrant tint: the corner worth investing in */}
        <rect x={x(avgLeads)} y={pad.t} width={W - pad.r - x(avgLeads)} height={y(avgConv) - pad.t} className="fill-emerald-50" />
        {/* Grid */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-slate-300" : "stroke-line"} />
            {Math.abs(y(v) - y(avgConv)) > 22 && (
              <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
                {pct(v)}
              </text>
            )}
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={x(v)} y={H - pad.b + 16} textAnchor="middle" className="fill-slate-500 text-[11px] tabular-nums">
            {v}
          </text>
        ))}
        <text x={W - pad.r} y={H - 4} textAnchor="end" className="fill-slate-500 text-[11px]">
          {tr.axisLeads}
        </text>
        <text x={pad.l} y={10} className="fill-slate-500 text-[11px]">
          {tr.axisConv}
        </text>
        {/* Averages split the quadrants */}
        <line x1={pad.l} x2={W - pad.r} y1={y(avgConv)} y2={y(avgConv)} strokeDasharray="3 3" className="stroke-slate-400" />
        {/* The average sits in the axis gutter, where it can't cover a bubble */}
        <text x={pad.l - 8} y={y(avgConv) + 4} textAnchor="end" className="fill-slate-600 text-[11px] font-medium tabular-nums">
          {pct(avgConv)}
        </text>
        <text x={pad.l - 8} y={y(avgConv) + 16} textAnchor="end" className="fill-slate-400 text-[10px]">
          {tr.avgShort}
        </text>
        <line x1={x(avgLeads)} x2={x(avgLeads)} y1={pad.t} y2={pad.t + ih} strokeDasharray="3 3" className="stroke-slate-300" />
        <text x={W - pad.r - 6} y={pad.t + 14} textAnchor="end" className="fill-emerald-700 text-[11px] font-semibold">
          {tr.quadInvest}
        </text>
        <text x={pad.l + 6} y={pad.t + 14} className="fill-slate-400 text-[11px]">
          {tr.quadSmall}
        </text>
        <text x={W - pad.r - 6} y={y(avgConv) + 16} textAnchor="end" className="fill-slate-400 text-[11px]">
          {tr.quadVolume}
        </text>
        {/* Bubbles, biggest first so small ones stay on top */}
        {[...points]
          .sort((a, b) => b.rad - a.rad)
          .map((p) => (
            <circle
              key={p.label}
              cx={p.cx}
              cy={p.cy}
              r={p.rad}
              className={p.isBest ? "fill-emerald-600/85 stroke-emerald-700" : p.g.enrolled ? "fill-accent/75 stroke-accent" : "fill-slate-300/70 stroke-slate-400"}
              strokeWidth={1}
            >
              <title>{`${p.label}: ${p.g.leads} · ${pct(p.g.conversion)}`}</title>
            </circle>
          ))}
        {points.map((p) => (
          <text key={`l-${p.label}`} x={p.left ? p.cx - p.rad - 6 : p.cx + p.rad + 6} y={p.ly} textAnchor={p.left ? "end" : "start"} className="text-[12px]">
            <tspan className={p.g.enrolled ? "fill-ink font-medium" : "fill-slate-500"}>{p.label}</tspan>
            {p.sub && (
              <tspan x={p.left ? p.cx - p.rad - 6 : p.cx + p.rad + 6} dy={14} className={p.isBest ? "fill-emerald-700 text-[11px]" : "fill-slate-500 text-[11px]"}>
                {p.sub}
              </tspan>
            )}
          </text>
        ))}
      </svg>
    </Card>
  );
}

function Trend({ r, t, locale, tz }: { r: Reports; t: Dict; locale: string; tz: string }) {
  const max = Math.max(1, ...r.trend.map((b) => b.count));
  // Round the top tick up to a friendly step so bars never touch the top.
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : 10;
  const topTick = Math.ceil((max + 0.01) / step) * step;
  const ticks = Array.from({ length: topTick / step + 1 }, (_, i) => i * step).filter((v, i, a) => a.length <= 5 || i % Math.ceil(a.length / 4) === 0 || v === topTick);
  const df = new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { timeZone: tz, month: "short", ...(r.bucketDays < 30 ? { day: "numeric" } : {}) });
  const every = Math.ceil(r.trend.length / 6);
  return (
    <Card
      title={t.reports.trend}
      action={
        <span className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> {t.reports.trendAll}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> {t.reports.trendEnrolled}
          </span>
        </span>
      }
    >
      <div className="flex gap-2">
        <div className="relative h-40 w-6 shrink-0 text-right text-[11px] text-slate-500 tabular-nums">
          {ticks.map((v) => (
            <span key={v} className="absolute right-0" style={{ bottom: `${(v / topTick) * 100}%`, transform: "translateY(50%)" }}>
              {v}
            </span>
          ))}
        </div>
        <div className="flex-1">
          <div className="relative h-40">
            {ticks.map((v) => (
              <span key={v} className={`absolute inset-x-0 h-px ${v === 0 ? "bg-slate-300" : "bg-line"}`} style={{ bottom: `${(v / topTick) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {r.trend.map((b) => (
                <div key={b.start.toISOString()} className="relative flex h-full flex-1 items-end" title={`${df.format(b.start)}: ${b.count}`}>
                  <div className="w-full rounded-t-[2px] bg-slate-300" style={{ height: `${(b.count / topTick) * 100}%` }}>
                    <div className="absolute inset-x-0 bottom-0 rounded-t-[2px] bg-emerald-600" style={{ height: `${(b.enrolled / topTick) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex gap-[3px] text-[11px] text-slate-500">
            {r.trend.map((b, i) => (
              <span key={b.start.toISOString()} className="flex-1 overflow-visible whitespace-nowrap">
                {i % every === 0 ? df.format(b.start) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LostReasons({ r, t }: { r: Reports; t: Dict }) {
  const max = Math.max(1, ...r.reasons.map((x) => x.count));
  return (
    <Card title={t.reports.reasons} action={<span className="text-xs text-slate-500 tabular-nums">{fmt(t.reports.reasonsHint, { n: r.lostCount })}</span>}>
      {r.reasons.length === 0 ? (
        <p className="text-sm text-slate-500">{t.reports.noLost}</p>
      ) : (
        <ul className="space-y-3">
          {r.reasons.slice(0, 6).map((x) => (
            <li key={x.reason} className="text-sm">
              <div className="mb-1 flex justify-between gap-3">
                <span className={x.reason ? "text-ink" : "text-slate-500 italic"}>{x.reason || t.reports.noReason}</span>
                <span className="text-slate-600 tabular-nums">
                  {x.count} <span className="text-slate-400">· {pct(x.count / r.lostCount)}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-sm bg-raised">
                <div className="h-1.5 rounded-sm bg-rose-500" style={{ width: `${(x.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
