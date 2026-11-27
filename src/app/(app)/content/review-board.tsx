"use client";

import { useState } from "react";
import { Film, Plus } from "lucide-react";
import { createContentAction, updateContentAction, reviewContentAction, commentContentAction } from "@/app/actions/content";
import { ActionMessage, PendingButton, useActionForm } from "@/components/forms";
import { Card, Empty, PageHeader, buttonClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { zonedDateString, zonedTimeString } from "@/lib/dates";
import type { Dict } from "@/lib/i18n/en";
import type { ReviewStatus } from "@/modules/content";

type Post = {
  id: string; title: string; caption: string; videoUrl: string | null; coverUrl: string | null;
  status: ReviewStatus; plannedAt: string | null; approvedBy: string | null; version: number;
  comments: { id: string; author: string; body: string; createdAt: string }[];
};
type Labels = Dict["content"];
const tones = { DRAFT: "bg-slate-100 text-slate-600", IN_REVIEW: "bg-blue-50 text-blue-700", NEEDS_CHANGES: "bg-amber-50 text-amber-800", APPROVED: "bg-green-50 text-green-700" };

function Preview({ videoUrl, coverUrl, caption, labels }: { videoUrl: string; coverUrl: string; caption: string; labels: Labels }) {
  const [failed, setFailed] = useState(false);
  return <div className="overflow-hidden rounded-xl border border-line bg-white">
    <div className="flex items-center gap-2 border-b border-line p-3 text-sm font-medium"><Film size={16} />{labels.preview}</div>
    {videoUrl ? <><video key={videoUrl} controls playsInline preload="none" poster={coverUrl || undefined} onError={() => setFailed(true)} onLoadedData={() => setFailed(false)} aria-label={labels.preview} className="mx-auto aspect-[9/16] max-h-[420px] w-full bg-slate-950 object-contain"><source src={videoUrl} /></video>{failed && <p role="alert" className="p-3 text-sm text-red-700">{labels.previewError}</p>}</> : <div className="flex aspect-[9/12] items-center justify-center bg-slate-100 p-6 text-center text-sm text-muted">{labels.noVideo}</div>}
    <p className="max-h-48 overflow-auto whitespace-pre-wrap p-4 text-sm">{caption}</p>
  </div>;
}

function Editor({ post, labels, timeZone, done }: { post?: Post; labels: Labels; timeZone: string; done: () => void }) {
  const action = post ? updateContentAction.bind(null, post.id, post.version) : createContentAction;
  const { state, pending, formRef, onSubmit } = useActionForm(action, { resetOnSuccess: !post });
  const [video, setVideo] = useState(post?.videoUrl ?? "");
  const [cover, setCover] = useState(post?.coverUrl ?? "");
  const [caption, setCaption] = useState(post?.caption ?? "");
  return <Card><form ref={formRef} onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_300px]">
    <div className="space-y-4">
      <h2 className="font-semibold">{post ? labels.edit : labels.newPost}</h2>
      <label className="block text-sm">{labels.titleLabel}<input name="title" required maxLength={160} defaultValue={post?.title} /></label>
      <label className="block text-sm">{labels.videoUrl}<input name="videoUrl" type="url" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://…/reel.mp4" /></label>
      <label className="block text-sm">{labels.coverUrl}<input name="coverUrl" type="url" value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://…/cover.jpg" /></label>
      <p className="text-xs text-muted">{labels.mediaHint}</p>
      <label className="block text-sm">{labels.caption}<textarea name="caption" rows={9} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} /><span className="text-xs text-muted">{caption.length}/2200</span></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{labels.plannedDate}<input name="date" type="date" defaultValue={post?.plannedAt ? zonedDateString(new Date(post.plannedAt), timeZone) : ""} /></label>
        <label className="text-sm">{labels.plannedTime}<input name="time" type="time" required defaultValue={post?.plannedAt ? zonedTimeString(new Date(post.plannedAt), timeZone) : "16:00"} /></label>
      </div>
      <p className="text-xs text-muted">{timeZone} · {labels.account}</p>
      <p className="text-xs text-muted">{labels.approvalHint}</p>
      <ActionMessage state={state} />
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.message}</p>}
      <div className="flex gap-2"><PendingButton pending={pending || (!post && state?.ok === true)}>{post ? labels.saveChanges : labels.save}</PendingButton><button type="button" onClick={done} className={buttonClass("secondary")}>{labels.closeEditor}</button></div>
    </div>
    <Preview videoUrl={/^https:\/\//.test(video) ? video : ""} coverUrl={/^https:\/\//.test(cover) ? cover : ""} caption={caption} labels={labels} />
  </form></Card>;
}

function ReviewAction({ post, status, label, feedback }: { post: Post; status: ReviewStatus; label: string; feedback?: string }) {
  const { state, pending, onSubmit } = useActionForm(reviewContentAction.bind(null, post.id, post.version, status));
  return <form onSubmit={onSubmit} className="space-y-2">{feedback && <label className="block text-sm">{feedback}<textarea name="body" required maxLength={2000} rows={2} /></label>}<PendingButton pending={pending} variant={status === "APPROVED" ? "primary" : "secondary"} size="sm">{label}</PendingButton><ActionMessage state={state} /></form>;
}

function Conversation({ post, labels, locale, timeZone }: { post: Post; labels: Labels; locale: string; timeZone: string }) {
  const { state, pending, formRef, onSubmit } = useActionForm(commentContentAction.bind(null, post.id), { resetOnSuccess: true });
  return <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm font-medium">{labels.comments} ({post.comments.length})</summary><div className="mt-3 space-y-3">
    {!post.comments.length && <p className="text-sm text-muted">{labels.noComments}</p>}
    {post.comments.map((c) => <div key={c.id} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-muted">{c.author} · {formatDate(c.createdAt, locale, timeZone, true)}</div><p className="whitespace-pre-wrap text-sm">{c.body}</p></div>)}
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2"><label className="block text-sm">{labels.feedback}<textarea name="body" rows={2} required maxLength={2000} /></label><PendingButton pending={pending} variant="secondary" size="sm">{labels.comment}</PendingButton><ActionMessage state={state} /></form>
  </div></details>;
}

export function ContentBoard({ posts, labels, canApprove, timeZone, locale, today }: { posts: Post[]; labels: Labels; canApprove: boolean; timeZone: string; locale: string; today: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [date, setDate] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const visible = posts.filter((p) => (filter === "ALL" || p.status === filter) && (!date || (p.plannedAt && zonedDateString(new Date(p.plannedAt), timeZone) === date)));
  return <div className="mx-auto max-w-6xl space-y-5">
    <PageHeader title={labels.title} actions={<button onClick={() => setEditing("new")} className={buttonClass("primary")}><Plus size={16} />{labels.newPost}</button>} />
    <p className="text-sm text-muted">{labels.subtitle}</p>
    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{labels.planHint}</div>
    {editing === "new" && <Editor labels={labels} timeZone={timeZone} done={() => setEditing(null)} />}
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">{labels.all}<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">{labels.all}</option>{Object.entries(labels.statuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label className="text-sm">{labels.agenda}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><span className="pb-2 text-xs text-muted">{timeZone} · {labels.account}</span></div>
    <PlanCalendar posts={posts.filter((p) => filter === "ALL" || p.status === filter)} month={month} setMonth={setMonth} date={date} setDate={setDate} labels={labels} locale={locale} timeZone={timeZone} />
    {!visible.length && <Empty>{labels.empty}</Empty>}
    <div className="grid gap-5 xl:grid-cols-2">{visible.map((post) => <article key={post.id} className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{post.title}</h2><p className="text-xs text-muted">{post.plannedAt ? formatDate(post.plannedAt, locale, timeZone, true) : labels.noPlan}</p></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${tones[post.status]}`}>{labels.statuses[post.status]}</span></div>
      {editing === post.id ? <Editor key={post.version} post={post} labels={labels} timeZone={timeZone} done={() => setEditing(null)} /> : <><Preview videoUrl={post.videoUrl ?? ""} coverUrl={post.coverUrl ?? ""} caption={post.caption} labels={labels} /><button onClick={() => setEditing(post.id)} className={buttonClass("secondary", "sm")}>{labels.edit}</button></>}
      {post.approvedBy && <p className="text-xs text-green-700">{labels.approvedBy}: {post.approvedBy}</p>}
      {editing !== post.id && <div className="flex flex-wrap gap-3">
        {["DRAFT", "NEEDS_CHANGES"].includes(post.status) && <ReviewAction post={post} status="IN_REVIEW" label={labels.submit} />}
        {post.status === "IN_REVIEW" && canApprove && <ReviewAction post={post} status="APPROVED" label={labels.approve} />}
        {post.status !== "DRAFT" && <ReviewAction post={post} status="DRAFT" label={labels.reopen} />}
      </div>}
      {editing !== post.id && post.status === "IN_REVIEW" && canApprove && <ReviewAction post={post} status="NEEDS_CHANGES" label={labels.changes} feedback={labels.feedback} />}
      <Conversation post={post} labels={labels} locale={locale} timeZone={timeZone} />
    </article>)}</div>
  </div>;
}


function PlanCalendar({ posts, month, setMonth, date, setDate, labels, locale, timeZone }: { posts: Post[]; month: string; setMonth: (month: string) => void; date: string; setDate: (date: string) => void; labels: Labels; locale: string; timeZone: string }) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return null;
  const offset = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i - offset + 1);
  return <section className="overflow-x-auto rounded-xl border border-line bg-white p-4" aria-label={labels.agenda}>
    <label className="mb-3 flex max-w-xs items-center gap-3 text-sm font-medium">{labels.agenda}<input type="month" required value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} /></label>
    <table className="w-full min-w-[540px] table-fixed text-sm"><thead><tr>{Array.from({ length: 7 }, (_, i) => <th key={i} scope="col" className="pb-2 text-center font-medium text-muted">{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + i)))}</th>)}</tr></thead>
    <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => <tr key={week}>{cells.slice(week * 7, week * 7 + 7).map((day, col) => {
      const key = `${month}-${String(day).padStart(2, "0")}`;
      const items = posts.filter((p) => p.plannedAt && zonedDateString(new Date(p.plannedAt), timeZone) === key);
      return <td key={col} className="h-24 border border-line align-top">{day > 0 && day <= days && <button type="button" aria-pressed={date === key} onClick={() => setDate(date === key ? "" : key)} className={`h-full min-h-24 w-full p-2 text-left align-top hover:bg-blue-50 ${date === key ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : ""}`}><span className="text-xs text-muted">{day}</span>{items.map((p) => <span key={p.id} className={`mt-1 block truncate rounded px-1 text-xs ${tones[p.status]}`}>{zonedTimeString(new Date(p.plannedAt!), timeZone)} {p.title}</span>)}</button>}</td>;
    })}</tr>)}</tbody></table>
  </section>;
}
