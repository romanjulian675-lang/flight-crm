"use client";
import { useEffect, useRef } from "react";
import { replySocialAction, readSocialAction } from "@/app/actions/social-messages";
import { useActionForm, ActionMessage } from "@/components/forms";
import { buttonClass } from "@/components/ui";
export function SocialComposer({ id, es, open, unread }: { id: string; es: boolean; open: boolean; unread: boolean }) {
  const request = useRef<{ id: string; successAt: number | null } | null>(null);
  const { state, pending, formRef, onSubmit } = useActionForm(replySocialAction.bind(null, id), { resetOnSuccess: true });
  useEffect(() => { if (unread) void readSocialAction(id); }, [id, unread]);
  return <div className="space-y-3 border-t border-line p-4">
    {open ? <form ref={formRef} onSubmit={e => {
      const successAt = state?.ok ? state.at : null;
      if (!request.current || request.current.successAt !== successAt) request.current = { id: crypto.randomUUID(), successAt };
      (e.currentTarget.elements.namedItem("requestId") as HTMLInputElement).value = request.current.id;
      onSubmit(e);
    }} className="space-y-3">
      <input type="hidden" name="requestId" defaultValue="" />
      <label className="block text-sm">{es ? "Tu respuesta" : "Your reply"}<textarea name="text" rows={3} required maxLength={1000} className="mt-1 w-full" /></label>
      <ActionMessage state={state} />
      <button type="submit" disabled={pending || !!(state && !state.ok)} className={buttonClass("primary")}>{pending ? (es ? "Enviando…" : "Sending…") : (es ? "Enviar respuesta" : "Send reply")}</button>
      {state && !state.ok && <p className="text-xs text-amber-800">{es ? "Revisa Meta Business Suite antes de intentar enviar de nuevo. Si el envío no está confirmado, recargar no debe interpretarse como un reintento seguro." : "Check Meta Business Suite before attempting another send. An unconfirmed send may already have reached the recipient."}</p>}
    </form> : <p className="text-sm text-amber-800">{es ? "La ventana de respuesta de 24 horas está cerrada o el canal está pausado." : "The 24-hour reply window is closed, or this channel is paused."}</p>}
    <a href="https://business.facebook.com/latest/inbox" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 underline">{es ? "Abrir Meta Business Suite" : "Open Meta Business Suite"}</a>
  </div>;
}
