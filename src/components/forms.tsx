"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/toaster";
import { buttonClass } from "@/components/ui";

/** Keeps the label (so the button doesn't jump in width) and adds a spinner while saving. */
function Pending({ text, children }: { text?: string; children: React.ReactNode }) {
  return (
    <>
      <Loader2 size={14} className="animate-spin" aria-hidden />
      {text && text !== "…" ? text : children}
    </>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className = "", pendingText }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; size?: "sm" | "md"; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonClass(variant, size)} ${className}`}>
      {pending ? <Pending text={pendingText}>{children}</Pending> : children}
    </button>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

/** Success messages go to a toast (out of the way); errors stay inline, next to what needs fixing. */
export function ActionMessage({ state }: { state: { ok: boolean; message: string; at: number } | null | undefined }) {
  const shown = useRef<number | null>(null);
  useEffect(() => {
    if (state?.ok && state.message && shown.current !== state.at) {
      shown.current = state.at;
      toast(state.message);
    }
  }, [state]);
  if (!state?.message || state.ok) return null;
  return (
    <p role="alert" className="animate-fade-in text-sm text-red-700">
      {state.message}
    </p>
  );
}

const noopSubscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || null;
const ZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["America/New_York"];

/** Time-zone picker. Without a saved value it defaults to the browser's zone (after hydration). */
export function TimeZoneSelect({ name = "timeZone", defaultValue }: { name?: string; defaultValue?: string }) {
  const detected = useSyncExternalStore(noopSubscribe, browserZone, () => null);
  const [chosen, setChosen] = useState<string | null>(null);
  const value = chosen ?? defaultValue ?? detected ?? "America/New_York";
  return (
    <select name={name} value={value} onChange={(e) => setChosen(e.target.value)}>
      {ZONES.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}

type Result = { ok: boolean; message: string; at: number } | null;

/**
 * Submit a form to a server action without React's automatic form reset, so typed values survive
 * a validation error. Clears the form only after a successful save when `resetOnSuccess` is set.
 */
export function useActionForm<S extends Result>(action: (prev: S, fd: FormData) => Promise<S>, { resetOnSuccess = false } = {}) {
  const [state, dispatch, pending] = useActionState(action as (prev: Awaited<S>, fd: FormData) => Promise<S>, null as Awaited<S>);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, pending, formRef, onSubmit };
}

export function PendingButton({ pending, children, variant = "primary", size = "md", pendingText = "…" }: { pending: boolean; children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; size?: "sm" | "md"; pendingText?: string }) {
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size)}>
      {pending ? <Pending text={pendingText}>{children}</Pending> : children}
    </button>
  );
}
