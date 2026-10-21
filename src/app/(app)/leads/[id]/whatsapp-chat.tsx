"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, Check, CheckCheck, Clock, MessageCircle, Send } from "lucide-react";
import { listTemplatesAction, markReadAction, sendWhatsAppTemplateAction, sendWhatsAppTextAction } from "@/app/actions/whatsapp";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionMessage, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { buttonClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/format";

export type ChatMessage = {
  id: string;
  direction: "IN" | "OUT";
  body: string | null;
  type: string;
  templateName: string | null;
  status: "RECEIVED" | "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  error: string | null;
  sender: string | null;
  createdAt: string;
};

type Template = { name: string; language: string; category: string; body: string; params: number };

const WINDOW_MS = 24 * 3_600_000;

/** WhatsApp conversation with the lead, in the CRM. Polls for new messages while open. */
export function WhatsAppChat({ leadId, firstName, messages, lastInboundAt, myName, hasUnread }: { leadId: string; firstName: string; messages: ChatMessage[]; lastInboundAt: string | null; myName: string; hasUnread: boolean }) {
  const { t, locale, timeZone } = useI18n();
  const listRef = useRef<HTMLOListElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // Re-evaluate the 24-hour window every minute.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);
  // Opening the conversation marks it read.
  useEffect(() => {
    if (hasUnread) void markReadAction(leadId);
  }, [hasUnread, leadId]);

  const msLeft = lastInboundAt ? WINDOW_MS - (now - new Date(lastInboundAt).getTime()) : 0;
  const open = msLeft > 0;
  const left = msLeft >= 3_600_000 ? fmt(t.team.hours, { n: Math.floor(msLeft / 3_600_000) }) : fmt(t.team.minutes, { n: Math.max(1, Math.floor(msLeft / 60_000)) });

  return (
    <section id="whatsapp" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <AutoRefresh seconds={8} />
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-[#075E54] px-4 py-2.5 text-white">
        <MessageCircle size={16} />
        <h2 className="flex-1 text-sm font-semibold">{t.whatsapp.chatTitle}</h2>
        {open && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{fmt(t.whatsapp.windowOpen, { time: left })}</span>}
      </header>
      <ol ref={listRef} className="max-h-96 min-h-32 space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-3">
        {messages.length === 0 && <li className="py-8 text-center text-sm text-slate-500">{t.whatsapp.empty}</li>}
        {messages.map((m) => {
          const out = m.direction === "OUT";
          return (
            <li key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${out ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"} ${m.status === "FAILED" ? "ring-1 ring-red-300" : ""}`}>
                {out && (
                  <div className="text-[11px] font-medium text-emerald-800">
                    {m.sender ? (m.sender === myName ? t.whatsapp.you : m.sender) : t.whatsapp.auto}
                    {m.templateName && <span className="font-normal text-slate-500"> · {m.templateName}</span>}
                  </div>
                )}
                <p className="break-words whitespace-pre-wrap text-slate-900">{m.body}</p>
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                  {formatDate(m.createdAt, locale, timeZone, true)}
                  {out && <StatusTick status={m.status} label={t.whatsapp.status[m.status]} />}
                </div>
                {m.error && <p className="mt-0.5 text-[11px] text-red-700">{m.error}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {open ? <TextComposer leadId={leadId} /> : <TemplateComposer leadId={leadId} firstName={firstName} />}
    </section>
  );
}

function StatusTick({ status, label }: { status: ChatMessage["status"]; label: string }) {
  const common = { size: 13, "aria-label": label } as const;
  if (status === "FAILED") return <AlertCircle {...common} className="text-red-600" />;
  if (status === "READ") return <CheckCheck {...common} className="text-sky-500" />;
  if (status === "DELIVERED") return <CheckCheck {...common} />;
  if (status === "SENT") return <Check {...common} />;
  return <Clock {...common} />;
}

function TextComposer({ leadId }: { leadId: string }) {
  const { t } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(sendWhatsAppTextAction.bind(null, leadId), { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex items-end gap-2 border-t border-slate-100 p-3">
      <label className="flex-1">
        <span className="sr-only">{t.whatsapp.placeholder}</span>
        <textarea
          name="text"
          rows={2}
          maxLength={4096}
          required
          placeholder={t.whatsapp.placeholder}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter adds a line (like WhatsApp Web).
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {state && !state.ok && <ActionMessage state={state} />}
      </label>
      <button type="submit" disabled={pending} aria-label={t.whatsapp.send} className={`${buttonClass("primary")} bg-[#128C7E] hover:bg-[#075E54]`}>
        <Send size={16} />
      </button>
    </form>
  );
}

function TemplateComposer({ leadId, firstName }: { leadId: string; firstName: string }) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [chosen, setChosen] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const { state, pending, formRef, onSubmit } = useActionForm(sendWhatsAppTemplateAction.bind(null, leadId));
  const tpl = templates?.find((x) => `${x.name}|${x.language}` === chosen);

  const load = () =>
    startLoad(async () => {
      const res = await listTemplatesAction();
      if (res?.ok) setTemplates(res.data ?? []);
      else setLoadError(res?.message ?? t.common.unexpected);
    });

  return (
    <div className="space-y-2 border-t border-slate-100 p-3">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t.whatsapp.windowClosed}</p>
      {!templates ? (
        <>
          <button type="button" onClick={load} disabled={loading} className={buttonClass("secondary", "sm")}>
            {loading ? t.whatsapp.loadingTemplates : t.whatsapp.chooseTemplate}
          </button>
          {loadError && <p className="text-sm text-red-700">{loadError}</p>}
        </>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted">{t.whatsapp.noTemplates}</p>
      ) : (
        <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
          <label className="flex flex-col gap-1">
            <span>{t.whatsapp.template}</span>
            <select
              name="template"
              value={chosen}
              required
              onChange={(e) => {
                setChosen(e.target.value);
                const next = templates.find((x) => `${x.name}|${x.language}` === e.target.value);
                setParams(Array.from({ length: next?.params ?? 0 }, (_, i) => (i === 0 ? firstName : "")));
              }}
            >
              <option value="">{t.whatsapp.chooseTemplate}</option>
              {templates.map((x) => (
                <option key={`${x.name}|${x.language}`} value={`${x.name}|${x.language}`}>
                  {x.name} ({x.language})
                </option>
              ))}
            </select>
          </label>
          {tpl && (
            <>
              {params.map((p, i) => (
                <label key={i} className="flex flex-col gap-1">
                  <span>{fmt(t.whatsapp.param, { n: i + 1 })}</span>
                  <input name="param" value={p} required onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />
                </label>
              ))}
              <p className="rounded-lg bg-[#d9fdd3] px-3 py-2 text-sm whitespace-pre-wrap text-slate-900">
                {tpl.body.replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1] || m)}
              </p>
            </>
          )}
          <div className="flex items-center justify-end gap-3">
            {state && !state.ok && <ActionMessage state={state} />}
            <button type="submit" disabled={pending || !tpl} className={`${buttonClass("primary", "sm")} bg-[#128C7E] hover:bg-[#075E54]`}>
              <Send size={14} /> {t.whatsapp.sendTemplate}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
