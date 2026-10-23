"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

/**
 * Tiny toaster built on Sonner's principles: call `toast()` from anywhere, mount <Toaster /> once.
 * CSS transitions (not keyframes) so rapid toasts retarget smoothly; enter and exit share a direction;
 * timers pause on hover and while the tab is hidden.
 */
type Tone = "success" | "error";
type Item = { id: number; message: string; tone: Tone; leaving: boolean };

let items: Item[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const snapshot = () => items;
const empty: Item[] = [];

const EXIT_MS = 200;
const VISIBLE_MS = 3200;
const MAX = 3;

function dismiss(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, EXIT_MS);
}

export function toast(message: string, tone: Tone = "success") {
  items = [...items.filter((t) => !t.leaving).slice(-(MAX - 1)), { id: nextId++, message, tone, leaving: false }];
  emit();
}

function ToastView({ item, paused }: { item: Item; paused: boolean }) {
  const left = useRef(VISIBLE_MS);
  const started = useRef(0);
  useEffect(() => {
    if (paused || item.leaving) return;
    started.current = Date.now();
    const id = setTimeout(() => dismiss(item.id), left.current);
    return () => {
      clearTimeout(id);
      left.current -= Date.now() - started.current;
    };
  }, [paused, item.id, item.leaving]);

  const Icon = item.tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <li
      role={item.tone === "error" ? "alert" : "status"}
      data-leaving={item.leaving || undefined}
      className="pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-line bg-white py-2.5 pr-2 pl-3 text-sm text-ink shadow-[0_8px_24px_-6px_rgb(16_22_31/0.18),0_2px_6px_-2px_rgb(16_22_31/0.08)] transition-[transform,opacity] duration-[400ms] ease-[cubic-bezier(0.23,1,0.32,1)] starting:translate-y-full starting:opacity-0 data-leaving:translate-y-2 data-leaving:opacity-0 data-leaving:duration-200 sm:w-80"
    >
      <Icon size={16} className={item.tone === "success" ? "shrink-0 text-emerald-600" : "shrink-0 text-red-600"} />
      <span className="flex-1">{item.message}</span>
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(item.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
        <X size={14} />
      </button>
    </li>
  );
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => empty);
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return (
    <ol
      aria-live="polite"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
    >
      {list.map((item) => (
        <ToastView key={item.id} item={item} paused={hover || hidden} />
      ))}
    </ol>
  );
}
