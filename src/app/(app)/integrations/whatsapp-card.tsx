"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { connectWhatsAppAction, disconnectWhatsAppAction, updateAutoReplyAction } from "@/app/actions/whatsapp";
import { ActionMessage, PendingButton, useActionForm } from "@/components/forms";
import { useI18n } from "@/components/i18n-provider";
import { Badge, buttonClass } from "@/components/ui";
import { fmt } from "@/lib/i18n/format";
import { CopyField } from "./integration-cards";

type Account = {
  connected: boolean;
  displayPhone: string | null;
  verifiedName: string | null;
  phoneNumberId: string;
  wabaId: string;
  webhookUrl: string;
  verifyToken: string;
  autoReply: string;
  lastError: string | null;
};

export function WhatsAppCard({ account }: { account: Account | null }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(!account?.connected);
  const live = account?.connected;
  return (
    <section className="rounded-lg border border-line bg-white">
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#128C7E]">
          <MessageCircle size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t.integrations.kinds.WHATSAPP.title}</h2>
          <p className="text-xs text-muted">{t.integrations.kinds.WHATSAPP.body}</p>
        </div>
        <Badge tone={live ? "green" : "slate"}>{live ? t.integrations.connected : t.integrations.off}</Badge>
      </header>
      <div className="space-y-4 p-4">
        {live && (
          <p className="text-sm font-medium text-emerald-800">
            {fmt(t.whatsapp.connectedAs, { name: account.verifiedName ?? "", phone: account.displayPhone ?? account.phoneNumberId })}
          </p>
        )}
        {account?.lastError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{account.lastError}</p>}

        {live && (
          <div className="space-y-2">
            <Label>{t.whatsapp.webhookUrl}</Label>
            <CopyField value={account.webhookUrl} />
            <Label>{t.whatsapp.verifyToken}</Label>
            <CopyField value={account.verifyToken} />
            <p className="text-xs text-muted">{t.whatsapp.webhookHelp}</p>
          </div>
        )}

        {live && <AutoReplyForm value={account.autoReply} />}

        {editing ? (
          <ConnectForm account={account} onSaved={() => setEditing(false)} onCancel={live ? () => setEditing(false) : undefined} />
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button type="button" onClick={() => setEditing(true)} className={buttonClass("secondary", "sm")}>
              {t.whatsapp.update}
            </button>
            <Disconnect />
          </div>
        )}
      </div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-slate-600">{children}</div>;
}

function ConnectForm({ account, onSaved, onCancel }: { account: Account | null; onSaved: () => void; onCancel?: () => void }) {
  const { t } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(connectWhatsAppAction, { resetOnSuccess: true });
  useEffect(() => {
    if (state?.ok) onSaved();
  }, [state, onSaved]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3 border-t border-line pt-4">
      <h3 className="text-sm font-semibold">{t.whatsapp.setupTitle}</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        {t.whatsapp.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="text-xs text-muted">{t.whatsapp.numberNote}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span>{t.whatsapp.phoneNumberId}</span>
          <input name="phoneNumberId" inputMode="numeric" defaultValue={account?.phoneNumberId} required />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.whatsapp.wabaId}</span>
          <input name="wabaId" inputMode="numeric" defaultValue={account?.wabaId} required />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.whatsapp.accessToken}</span>
          <input name="accessToken" type="password" autoComplete="off" required />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.whatsapp.appSecret}</span>
          <input name="appSecret" type="password" autoComplete="off" required />
        </label>
      </div>
      <p className="text-xs text-muted">{t.whatsapp.secretsNote}</p>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <ActionMessage state={state} />
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClass("ghost", "sm")}>
            {t.common.cancel}
          </button>
        )}
        <PendingButton pending={pending} pendingText={t.common.working}>
          {t.whatsapp.connect}
        </PendingButton>
      </div>
    </form>
  );
}

function AutoReplyForm({ value }: { value: string }) {
  const { t } = useI18n();
  const { state, pending, formRef, onSubmit } = useActionForm(updateAutoReplyAction);
  return (
    <form key={value} ref={formRef} onSubmit={onSubmit} className="space-y-2 border-t border-line pt-4">
      <label className="flex flex-col gap-1">
        <span>{t.whatsapp.autoReply}</span>
        <textarea name="autoReply" rows={3} defaultValue={value} placeholder={t.whatsapp.autoReplyPlaceholder} maxLength={1000} />
      </label>
      <p className="text-xs text-muted">{t.whatsapp.autoReplyHint}</p>
      <div className="flex items-center justify-end gap-3">
        <ActionMessage state={state} />
        <PendingButton pending={pending} size="sm" variant="secondary">
          {t.common.save}
        </PendingButton>
      </div>
    </form>
  );
}

function Disconnect() {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => confirm(t.whatsapp.disconnectConfirm) && start(async () => void (await disconnectWhatsAppAction()))}
      className={buttonClass("danger", "sm")}
    >
      {t.whatsapp.disconnect}
    </button>
  );
}
