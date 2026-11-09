"use client";
import { useActionForm, ActionMessage, PendingButton } from "@/components/forms";
import { selectMetaAdAccountAction, syncMetaAdReportAction } from "@/app/actions/integrations";
import { Card } from "@/components/ui";
type Props = {
 stages: { id: string; name: string }[]; bookedStageId: string | null;
 accounts: { id: string; name: string; currency: string }[]; selectedId: string | null;
 report: { since: string; until: string; syncedAt: string; rows: { ad_id: string; ad_name: string; campaign_name: string; spend: string; impressions: string; clicks: string }[]; creatives: { id: string; creative?: { thumbnail_url?: string; image_url?: string } }[] } | null;
 outcomes: Record<string, { leads: number; booked: number | null; enrolled: number }>;
};
export function MetaAdReporting({ accounts, selectedId, report, outcomes, stages, bookedStageId }: Props) {
 const { formRef: selectionRef, onSubmit: selectSubmit, pending: selectPending, state: selectState } = useActionForm(selectMetaAdAccountAction);
 const { formRef: syncRef, onSubmit: syncSubmit, pending: syncPending, state: syncState } = useActionForm(syncMetaAdReportAction);
 const currency = accounts.find(a => a.id === selectedId)?.currency ?? "USD";
 const money = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
 const today = new Date().toISOString().slice(0, 10);
 return <Card title="Meta ad performance">
 <p className="text-sm text-muted">Read-only reporting for the account you choose. This cannot publish ads or change your budget.</p>
 {!accounts.length ? <p className="mt-3 text-sm">Reconnect Facebook above and approve ad reporting access. Meta must also grant your login access to the ad account.</p> : <>
 <form ref={selectionRef} onSubmit={selectSubmit} className="mt-4 flex flex-wrap items-end gap-3">
 <label className="flex flex-1 flex-col gap-1 text-sm">Ad account<select name="accountId" defaultValue={selectedId ?? ""} required><option value="" disabled>Choose an account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.id} · {a.currency}</option>)}</select></label>
 <label className="flex flex-1 flex-col gap-1 text-sm">Booked-call stage<select name="bookedStageId" defaultValue={bookedStageId ?? ""}><option value="">Not mapped</option>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <PendingButton pending={selectPending}>Save account</PendingButton><ActionMessage state={selectState}/></form>
 {selectedId && <form ref={syncRef} onSubmit={syncSubmit} className="mt-4 flex flex-wrap items-end gap-3">
 <label className="flex flex-col gap-1 text-sm">From<input type="date" name="since" defaultValue={report?.since ?? today} required/></label><label className="flex flex-col gap-1 text-sm">Through<input type="date" name="until" defaultValue={report?.until ?? today} required/></label>
 <PendingButton pending={syncPending}>Refresh spend and creatives</PendingButton><ActionMessage state={syncState}/></form>}
 </>}
 <p className="mt-4 text-xs text-muted">For photo-level results, use one photo per ad. Set the destination’s utm_source to meta and utm_content to {"{{ad.id}}"}. Several photos in one ad can only be reported together. Older leads without an ad ID cannot be reconstructed.</p>
 {report && <><p className="mt-4 text-xs text-muted">Spend: {report.since}–{report.until} in Meta’s account time zone. Refreshed {report.syncedAt}. CRM cohort dates use UTC. Booked calls counts prospects whose stage history reached your mapped booking stage; reservations must be recorded in CRM. Enrolled means the prospect is currently in a Won stage; update stages after actual enrollment. Cost is period spend ÷ currently enrolled prospects first tracked during that period, not a lifetime acquisition cost.</p><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Ad / photo", "Spend", "Clicks", "Tracked leads", "Booked calls", "Enrolled", "Cost / enrolled"].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{report.rows.map(r => {
 const count = outcomes[r.ad_id] ?? { leads: 0, booked: bookedStageId ? 0 : null, enrolled: 0 }; const asset = report.creatives.find(c => c.id === r.ad_id)?.creative; const image = asset?.image_url ?? asset?.thumbnail_url; const safeImage = image?.startsWith("https://") ? image : null;
 return <tr className="border-t border-line" key={r.ad_id}><td className="p-2">{r.ad_name}<div className="text-xs text-muted">{r.campaign_name} · {r.ad_id}</div>{safeImage && <a className="text-blue-700 underline" href={safeImage} target="_blank" rel="noopener noreferrer">View creative</a>}</td><td className="p-2">{money(Number(r.spend))}</td><td className="p-2">{r.clicks}</td><td className="p-2">{count.leads}</td><td className="p-2">{count.booked ?? "—"}</td><td className="p-2">{count.enrolled}</td><td className="p-2">{count.enrolled ? money(Number(r.spend) / count.enrolled) : "—"}</td></tr>;
 })}</tbody></table>{!report.rows.length && <p className="p-2 text-sm">No spend returned for this period.</p>}</div></>}
 </Card>;
}
