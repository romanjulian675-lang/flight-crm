"use client";

import { useState, useTransition } from "react";
import { Code2, Copy, ExternalLink, Globe, Plus, RefreshCw, Search, Send, Trash2, Webhook } from "lucide-react";
import {
  createIntegrationAction,
  deleteIntegrationAction,
  disconnectMetaPageAction,
  rotateTokenAction,
  sendTestLeadAction,
  setAssignModeAction,
  updateIntegrationAction,
} from "@/app/actions/integrations";
import { ActionMessage, PendingButton, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { ProgramOptions, SourceOptions } from "@/components/lead-options";
import { Badge, buttonClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/format";

type Member = { id: string; name: string };
type Result = { ok: boolean; message: string; at: number } | null;

function useRun() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const run = (fn: () => Promise<Result>) => start(async () => setResult(await fn()));
  return { pending, result, run };
}

export function CopyField({ value, mono = true, multiline = false }: { value: string; mono?: boolean; multiline?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-start gap-2">
      {multiline ? (
        <textarea readOnly value={value} rows={4} onFocus={(e) => e.currentTarget.select()} className={`${mono ? "font-mono" : ""} text-xs`} />
      ) : (
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className={`${mono ? "font-mono" : ""} text-xs`} />
      )}
      <button type="button" onClick={copy} className={buttonClass("secondary", "sm")}>
        <Copy size={13} /> {copied ? t.common.copied : t.common.copy}
      </button>
    </div>
  );
}

export function AssignModePicker({ mode }: { mode: "NONE" | "ROUND_ROBIN" }) {
  const { t } = useI18n();
  const { pending, result, run } = useRun();
  return (
    <fieldset className={`flex flex-col gap-2 text-sm sm:flex-row sm:gap-6 ${pending ? "opacity-60" : ""}`}>
      {(["ROUND_ROBIN", "NONE"] as const).map((m) => (
        <label key={m} className="flex items-center gap-2">
          <input type="radio" name="assignMode" checked={mode === m} onChange={() => run(() => setAssignModeAction(m))} disabled={pending} />
          {m === "ROUND_ROBIN" ? t.integrations.assignRoundRobin : t.integrations.assignNone}
        </label>
      ))}
      {result && !result.ok && <ActionMessage state={result} />}
    </fieldset>
  );
}

/** Facebook "f" mark (lucide no longer ships brand icons). */
function Facebook({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" />
    </svg>
  );
}

const ICONS = { META: Facebook, GOOGLE_ADS: Search, WEB_FORM: Globe, WEBHOOK: Webhook };

function Shell({ kind, title, status, children }: { kind: keyof typeof ICONS; title: string; status?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useI18n();
  const Icon = ICONS[kind];
  return (
    <section className="rounded-lg border border-line bg-white">
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted">{t.integrations.kinds[kind].body}</p>
        </div>
        {status}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function Stats({ count, lastEventAt }: { count: number; lastEventAt: string | null }) {
  const { t, locale, timeZone } = useI18n();
  return (
    <span className="text-xs text-muted">
      {fmt(t.integrations.leadsIn, { n: count })} · {lastEventAt ? fmt(t.integrations.lastEvent, { when: formatDate(lastEventAt, locale, timeZone, true) }) : t.integrations.never}
    </span>
  );
}

type IntegrationSettings = {
  id: string;
  name: string;
  active: boolean;
  defaultSource: string;
  defaultProgram: string;
  defaultOwnerId: string | null;
  count: number;
  lastEventAt: string | null;
};

/** Name, on/off and defaults, shared by every kind. */
function SettingsForm({ integration, members, showSource = true }: { integration: IntegrationSettings; members: Member[]; showSource?: boolean }) {
  const { t } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(updateIntegrationAction.bind(null, integration.id));
  return (
    <form key={JSON.stringify(integration)} ref={formRef} onSubmit={onSubmit} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span>{t.integrations.name}</span>
        <input name="name" defaultValue={integration.name} required />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.integrations.defaultOwner}</span>
        <select name="defaultOwnerId" defaultValue={integration.defaultOwnerId ?? ""}>
          <option value="">{t.integrations.ruleOwner}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={integration.active} />
        {integration.active ? t.integrations.on : t.integrations.off}
      </label>
      {showSource ? (
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span>{t.integrations.defaultSource}</span>
          <select name="defaultSource" defaultValue={integration.defaultSource}>
            <SourceOptions />
          </select>
        </label>
      ) : (
        <input type="hidden" name="defaultSource" value={integration.defaultSource} />
      )}
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span>{t.integrations.defaultProgram}</span>
        <select name="defaultProgram" defaultValue={integration.defaultProgram}>
          <ProgramOptions />
        </select>
      </label>
      <div className="flex items-center justify-end gap-3 sm:col-span-4">
        <ActionMessage state={state} />
        <PendingButton pending={pending} size="sm" variant="secondary">
          {t.common.save}
        </PendingButton>
      </div>
    </form>
  );
}

function Actions({ id, rotatable = true }: { id: string; rotatable?: boolean }) {
  const { t } = useI18n();
  const { pending, result, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => run(() => sendTestLeadAction(id))} className={buttonClass("primary", "sm")}>
        <Send size={13} /> {t.integrations.test}
      </button>
      {rotatable && (
        <button type="button" disabled={pending} onClick={() => confirm(t.integrations.rotateConfirm) && run(() => rotateTokenAction(id))} className={buttonClass("secondary", "sm")}>
          <RefreshCw size={13} /> {t.integrations.rotate}
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => confirm(t.integrations.deleteConfirm) && run(() => deleteIntegrationAction(id))} className={buttonClass("ghost", "sm")}>
        <Trash2 size={13} className="text-red-600" /> {t.common.delete}
      </button>
      <ActionMessage state={result} />
    </div>
  );
}

type Integration = IntegrationSettings & { kind: "WEB_FORM" | "WEBHOOK" | "GOOGLE_ADS"; token: string; googleKey: string | null };

export function IntegrationCard({ integration: i, appUrl, members }: { integration: Integration; appUrl: string; members: Member[] }) {
  const { t, locale } = useI18n();
  const status = (
    <div className="flex flex-col items-end gap-1">
      <Badge tone={i.active ? "green" : "slate"}>{i.active ? t.integrations.on : t.integrations.off}</Badge>
      <Stats count={i.count} lastEventAt={i.lastEventAt} />
    </div>
  );
  return (
    <Shell kind={i.kind} title={`${i.name}`} status={status}>
      {i.kind === "WEB_FORM" && <WebFormSetup url={`${appUrl}/embed/${i.token}`} locale={locale} />}
      {i.kind === "WEBHOOK" && <WebhookSetup url={`${appUrl}/api/intake/${i.token}`} />}
      {i.kind === "GOOGLE_ADS" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">{t.integrations.google.steps}</p>
          <Label>{t.integrations.url}</Label>
          <CopyField value={`${appUrl}/api/intake/google/${i.token}`} />
          <Label>{t.integrations.google.key}</Label>
          <CopyField value={i.googleKey ?? ""} />
        </div>
      )}
      <p className="text-xs text-muted">{t.integrations.urlHelp}</p>
      <Actions id={i.id} />
      <SettingsForm integration={i} members={members} showSource={i.kind !== "GOOGLE_ADS"} />
    </Shell>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-slate-600">{children}</div>;
}

function WebFormSetup({ url, locale }: { url: string; locale: string }) {
  const { t } = useI18n();
  const formUrl = `${url}?lang=${locale}`;
  const snippet = `<iframe id="flightleads-form" src="${formUrl}" title="Contact form" style="width:100%;max-width:520px;height:720px;border:0"></iframe>
<script>(function(f){var q=location.search.slice(1);if(q)f.src+="&"+q})(document.getElementById("flightleads-form"));</script>`;
  return (
    <div className="space-y-2">
      <Label>
        <Code2 size={12} className="mr-1 inline" />
        {t.integrations.webForm.embed}
      </Label>
      <CopyField value={snippet} multiline />
      <Label>{t.integrations.webForm.directLink}</Label>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <CopyField value={formUrl} />
        </div>
        <a href={formUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
          <ExternalLink size={13} /> {t.integrations.webForm.preview}
        </a>
      </div>
    </div>
  );
}

function WebhookSetup({ url }: { url: string }) {
  const { t } = useI18n();
  const example = `curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -d '{"first_name":"Maria","last_name":"Lopez","phone":"407-555-0123","email":"maria@example.com","program":"private pilot","source":"tiktok","message":"Interested in starting next month"}'`;
  return (
    <div className="space-y-2">
      <Label>{t.integrations.url}</Label>
      <CopyField value={url} />
      <p className="text-sm text-slate-700">{t.integrations.webhook.steps}</p>
      <p className="text-xs text-muted">{t.integrations.webhook.fields}</p>
      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-slate-600">{t.integrations.webhook.example}</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{example}</pre>
      </details>
    </div>
  );
}

type MetaPage = { id: string; pageName: string; subscribed: boolean; lastError: string | null };

export function MetaCard({ configured, pages, integration, members }: { configured: boolean; pages: MetaPage[]; integration: IntegrationSettings | null; members: Member[] }) {
  const { t } = useI18n();
  const { pending, result, run } = useRun();
  const status = integration ? (
    <div className="flex flex-col items-end gap-1">
      <Badge tone={pages.some((p) => p.subscribed) ? "green" : "slate"}>{pages.some((p) => p.subscribed) ? t.integrations.connected : t.integrations.off}</Badge>
      <Stats count={integration.count} lastEventAt={integration.lastEventAt} />
    </div>
  ) : undefined;
  return (
    <Shell kind="META" title={t.integrations.kinds.META.title} status={status}>
      {!configured ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.integrations.meta.notConfigured}</p>
      ) : (
        <a href="/api/integrations/meta/connect" className={`${buttonClass("primary")} bg-[#1877F2] hover:bg-[#166fe0]`}>
          <Facebook size={16} /> {pages.length ? t.integrations.meta.reconnect : t.integrations.meta.connect}
        </a>
      )}
      <p className="text-xs text-muted">{t.integrations.meta.instagramHint}</p>
      {pages.length > 0 && (
        <div>
          <Label>{t.integrations.meta.pages}</Label>
          <ul className={`mt-1 divide-y divide-line ${pending ? "opacity-60" : ""}`}>
            {pages.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="flex-1 font-medium">{p.pageName}</span>
                <Badge tone={p.subscribed ? "green" : "amber"}>{p.subscribed ? t.integrations.meta.subscribed : t.integrations.meta.notSubscribed}</Badge>
                {p.lastError && <span className="w-full text-xs text-red-700">{p.lastError}</span>}
                <button type="button" disabled={pending} onClick={() => run(() => disconnectMetaPageAction(p.id))} className={buttonClass("ghost", "sm")}>
                  {t.integrations.meta.disconnect}
                </button>
              </li>
            ))}
          </ul>
          <ActionMessage state={result} />
        </div>
      )}
      {integration && (
        <>
          <Actions id={integration.id} rotatable={false} />
          <SettingsForm integration={integration} members={members} showSource={false} />
        </>
      )}
    </Shell>
  );
}

export function AddSource() {
  const { t } = useI18n();
  const { pending, result, run } = useRun();
  const kinds = ["WEB_FORM", "WEBHOOK", "GOOGLE_ADS"] as const;
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4">
      <h2 className="mb-3 text-sm font-semibold">{t.integrations.addTitle}</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {kinds.map((k) => {
          const Icon = ICONS[k];
          return (
            <button
              key={k}
              type="button"
              disabled={pending}
              onClick={() => run(() => createIntegrationAction(k, t.integrations.kinds[k].title))}
              className="flex items-start gap-2 rounded-lg border border-line bg-white p-3 text-left hover:border-brand-500 hover:bg-sky-50/50 disabled:opacity-50"
            >
              <Icon size={18} className="mt-0.5 shrink-0 text-brand-500" />
              <span>
                <span className="flex items-center gap-1 text-sm font-medium">
                  <Plus size={12} /> {t.integrations.kinds[k].title}
                </span>
                <span className="text-xs text-muted">{t.integrations.kinds[k].body}</span>
              </span>
            </button>
          );
        })}
      </div>
      {result && !result.ok && <ActionMessage state={result} />}
    </section>
  );
}
