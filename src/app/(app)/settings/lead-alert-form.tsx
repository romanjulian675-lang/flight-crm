"use client";
import { updateLeadAlertsAction } from "@/app/actions/settings";
import { useActionForm, ActionMessage } from "@/components/forms";
import { buttonClass } from "@/components/ui";
export function LeadAlertForm({ enabled, recipients, es }: { enabled: boolean; recipients: string[]; es: boolean }) {
  const { state, pending, formRef, onSubmit } = useActionForm(updateLeadAlertsAction);
  return <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
    <label className="flex gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={enabled} />{es ? "Enviar alertas para prospectos nuevos" : "Email alerts for new leads"}</label>
    <label className="block text-sm">{es ? "Destinatarios (uno por línea)" : "Recipients (one per line)"}<textarea name="recipients" rows={3} required maxLength={1000} defaultValue={recipients.join("\n")} className="mt-1 w-full" /></label>
    <p className="text-xs text-muted">{es ? "Solo prospectos nuevos. El correo incluye un enlace que requiere iniciar sesión; no incluye mensajes ni datos de contacto." : "New leads only. Emails contain a link requiring CRM sign-in, with no message text or contact details."}</p>
    <ActionMessage state={state} /><button disabled={pending} className={buttonClass("primary")}>{es ? "Guardar alertas" : "Save alerts"}</button>
  </form>;
}
