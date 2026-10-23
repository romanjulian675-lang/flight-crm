"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Accessible modal: focus moves in, Escape and backdrop close it, focus returns on close. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea,button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92svh] w-full animate-sheet-in flex-col rounded-t-2xl bg-white shadow-2xl sm:animate-dialog-in sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="pressable -mr-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
