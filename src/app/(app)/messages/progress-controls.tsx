"use client";
import { useActionForm, ActionMessage } from "@/components/forms";
import { buttonClass } from "@/components/ui";
import { syncSocialHistoryAction, reconcileContactsAction, bookConsultationAction, recoverAllChatsAction } from "@/app/actions/social-messages";
export function ContactProgressReview() {
  const { formRef, onSubmit, pending, state } = useActionForm(reconcileContactsAction);
  const { formRef: recoverRef, onSubmit: recoverSubmit, pending: recoverPending, state: recoverState } = useActionForm(recoverAllChatsAction);
  return <div className="space-y-3"><form ref={recoverRef} onSubmit={recoverSubmit}><button disabled={recoverPending} className={buttonClass("primary")}>{recoverPending ? "Recovering conversations…" : "Recover and review recent chats"}</button><ActionMessage state={recoverState} /></form><form ref={formRef} onSubmit={onSubmit} className="space-y-2"><button disabled={pending} className={buttonClass("secondary")}>{pending ? "Reviewing…" : "Update stages from verified replies"}</button><ActionMessage state={state} /></form></div>;
}
export function ConversationProgress({ id, stage, evidence, manager, timeZone }: { id: string; stage: string; evidence: string | null; manager: boolean; timeZone: string }) {
  const { formRef: syncRef, onSubmit: syncSubmit, pending: syncPending, state: syncState } = useActionForm(syncSocialHistoryAction.bind(null, id));
  const { formRef: bookingRef, onSubmit: bookingSubmit, pending: bookingPending, state: bookingState } = useActionForm(bookConsultationAction.bind(null, id));
  return <section className="space-y-3 rounded-lg border border-line bg-white p-4">
    <h2 className="font-semibold">Pipeline progress · {stage}</h2>
    <p className="text-sm text-muted">Verified school replies move new inquiries to Contacted. Recover recent Meta history to include replies sent outside the CRM. Closed leads and later stages stay in place.</p>
    <form ref={syncRef} onSubmit={syncSubmit}><button disabled={syncPending} className={buttonClass("secondary")}>{syncPending ? "Recovering…" : "Recover recent chat history"}</button><ActionMessage state={syncState} /></form>
    {evidence && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-medium">Possible consultation — check the agreement and time</p><p className="whitespace-pre-wrap">{evidence}</p></div>}
    {manager && <details><summary className="cursor-pointer text-sm font-medium">Record a confirmed consultation / visa meeting</summary><form ref={bookingRef} onSubmit={bookingSubmit} className="mt-3 space-y-3">
      <p className="text-xs text-muted">Use only after both sides agreed. This records a booking, not a completed meeting or visa eligibility.</p>
      <label className="block text-sm">Meeting topic<input name="title" required maxLength={200} placeholder="Visa information meeting" className="mt-1 w-full" /></label>
      <div className="flex gap-3"><label className="text-sm">Date<input type="date" name="date" required className="mt-1 block" /></label><label className="text-sm">Time ({timeZone})<input type="time" name="time" required className="mt-1 block" /></label></div>
      <button disabled={bookingPending} className={buttonClass("primary")}>{bookingPending ? "Saving…" : "Confirm booking and update pipeline"}</button><ActionMessage state={bookingState} />
    </form></details>}
  </section>;
}
