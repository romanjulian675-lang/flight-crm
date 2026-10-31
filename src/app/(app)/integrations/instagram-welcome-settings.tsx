"use client";
import { configureInstagramWelcomeAction } from "@/app/actions/integrations";
import { ActionMessage, PendingButton, useActionForm } from "@/components/forms";

export function InstagramWelcomeSettings({ integrationId, enabled }: { integrationId: string; enabled: boolean }) {
  const { state, pending, formRef, onSubmit } = useActionForm(configureInstagramWelcomeAction.bind(null, integrationId));
  return <form key={String(enabled)} ref={formRef} onSubmit={onSubmit} className="mt-4 space-y-3 border-t border-line pt-4"><h3 className="font-semibold">Welcome new Instagram contacts once</h3><p className="text-sm text-muted">Sends “Hey, how are you?” only when a new contact starts with pilot, hi, hello, good morning, good afternoon or good evening. Existing CRM conversations never trigger it. Meta history must also confirm a new thread; if history is unavailable, the CRM stays quiet. Resuming after a break does not restart the welcome.</p><p className="text-xs text-muted">Keep Meta’s keyword greetings and Instagram instant reply turned off to avoid overlapping responses. Unconfirmed deliveries are never automatically resent.</p><label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={enabled} />Enable one-time welcome for new Instagram contacts</label><div className="flex items-center justify-end gap-3"><ActionMessage state={state} /><PendingButton pending={pending}>Save Instagram welcome</PendingButton></div></form>;
}
