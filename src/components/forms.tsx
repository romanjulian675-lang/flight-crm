"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";

export function SubmitButton({ children, variant = "primary", size = "md", className = "", pendingText }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; size?: "sm" | "md"; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass(variant, size)} ${className}`}>
      {pending ? (pendingText ?? "…") : children}
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

/** Shows an action's result message; success messages fade after a moment, errors stay. */
export function ActionMessage({ state }: { state: { ok: boolean; message: string; at: number } | null | undefined }) {
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);
  useEffect(() => {
    if (!state?.ok) return;
    const id = setTimeout(() => setHiddenAt(state.at), 2500);
    return () => clearTimeout(id);
  }, [state]);
  if (!state?.message || hiddenAt === state.at) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
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
    <button type="submit" disabled={pending} className={buttonClass(variant, size)}>
      {pending ? pendingText : children}
    </button>
  );
}
