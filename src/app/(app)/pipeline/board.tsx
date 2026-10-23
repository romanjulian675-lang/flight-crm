"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, Phone } from "lucide-react";
import { moveLeadAction } from "@/app/actions/leads";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/modal";
import { Avatar, buttonClass, stageStyle } from "@/components/ui";
import { daysSince, formatDate, formatPhone } from "@/lib/format";
import { fmt } from "@/lib/i18n/format";
import type { PROGRAM_VALUES, SOURCE_VALUES } from "@/lib/enums";

type Card = {
  id: string;
  name: string;
  phone: string | null;
  program: (typeof PROGRAM_VALUES)[number];
  source: (typeof SOURCE_VALUES)[number];
  owner: string | null;
  stageChangedAt: string;
  nextDue: string | null;
};
type Stage = { id: string; name: string; kind: "OPEN" | "WON" | "LOST"; color: string; leads: Card[] };

const COL = "col:";

export function Board({ stages: initial }: { stages: Stage[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [stages, setStages] = useState(initial);
  // Server data wins whenever it changes (after a save, a filter, or another user's edit).
  const [activeId, setActiveId] = useState<string | null>(null);
  const [source, setSource] = useState(initial);
  // ...except mid-drag: an auto-refresh must not yank the card out from under the pointer.
  if (source !== initial && !activeId) {
    setSource(initial);
    setStages(initial);
  }
  const [origin, setOrigin] = useState<string | null>(null);
  const [lostPrompt, setLostPrompt] = useState<{ leadId: string; stageId: string; beforeId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findStage = (id: string) => (id.startsWith(COL) ? stages.find((s) => s.id === id.slice(COL.length)) : stages.find((s) => s.leads.some((l) => l.id === id)));
  const activeCard = activeId ? stages.flatMap((s) => s.leads).find((l) => l.id === activeId) : null;

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setOrigin(findStage(String(e.active.id))?.id ?? null);
    setError(null);
  };

  // Moving across columns while dragging, so the card previews in its new place.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findStage(String(active.id));
    const to = findStage(String(over.id));
    if (!from || !to || from.id === to.id) return;
    setStages((prev) =>
      prev.map((s) => {
        if (s.id === from.id) return { ...s, leads: s.leads.filter((l) => l.id !== active.id) };
        if (s.id === to.id) {
          const card = from.leads.find((l) => l.id === active.id)!;
          const idx = over.id === `${COL}${to.id}` ? s.leads.length : Math.max(0, s.leads.findIndex((l) => l.id === over.id));
          const leads = [...s.leads];
          leads.splice(idx, 0, card);
          return { ...s, leads };
        }
        return s;
      }),
    );
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const leadId = String(active.id);
    const stage = findStage(leadId);
    if (!over || !stage) return setStages(initial);
    let leads = stage.leads;
    // Reorder inside the column.
    const overIdx = leads.findIndex((l) => l.id === over.id);
    const curIdx = leads.findIndex((l) => l.id === leadId);
    if (overIdx >= 0 && overIdx !== curIdx) {
      leads = [...leads];
      const [card] = leads.splice(curIdx, 1);
      leads.splice(overIdx, 0, card);
      setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, leads } : s)));
    }
    const idx = leads.findIndex((l) => l.id === leadId);
    const beforeId = leads[idx + 1]?.id ?? null;
    const unchanged = stage.id === origin && (overIdx < 0 || overIdx === curIdx);
    if (unchanged) return;
    if (stage.kind === "LOST" && stage.id !== origin) return setLostPrompt({ leadId, stageId: stage.id, beforeId });
    save(leadId, stage.id, beforeId, null);
  };

  const save = (leadId: string, stageId: string, beforeId: string | null, reason: string | null) => {
    start(async () => {
      const res = await moveLeadAction(leadId, stageId, beforeId, reason);
      if (!res?.ok) {
        setError(res?.message ?? t.common.unexpected);
        setStages(initial);
      }
      router.refresh();
    });
  };

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <DndContext
        id="pipeline-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setStages(initial);
        }}
      >
        <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:scroll-px-6 sm:px-6">
          {stages.map((s) => (
            <Column key={s.id} stage={s} />
          ))}
        </div>
        {/* Drop settles with the same strong ease-out the rest of the UI uses. */}
        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}>{activeCard ? <CardView card={activeCard} dragging /> : null}</DragOverlay>
      </DndContext>

      {lostPrompt && (
        <LostReasonModal
          onCancel={() => {
            setLostPrompt(null);
            setStages(initial);
          }}
          onSave={(reason) => {
            save(lostPrompt.leadId, lostPrompt.stageId, lostPrompt.beforeId, reason);
            setLostPrompt(null);
          }}
        />
      )}
    </>
  );
}

function Column({ stage }: { stage: Stage }) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: `${COL}${stage.id}` });
  return (
    <section className="flex w-72 shrink-0 snap-start flex-col rounded-lg border border-line bg-raised" aria-label={stage.name}>
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={`h-2 w-2 rounded-full ${stageStyle(stage.color).dot}`} />
        <h2 className="flex-1 truncate text-sm font-semibold text-ink">{stage.name}</h2>
        <span className="text-xs font-medium text-slate-500 tabular-nums">{stage.leads.length}</span>
      </header>
      <SortableContext id={stage.id} items={stage.leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`flex min-h-24 flex-1 flex-col gap-2 rounded-b-lg p-2 transition-colors ${isOver ? "bg-accent/8" : ""}`}>
          {stage.leads.map((l) => (
            <SortableCard key={l.id} card={l} />
          ))}
          {stage.leads.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{t.pipeline.emptyColumn}</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "rounded-md opacity-40 outline-2 -outline-offset-2 outline-dashed outline-slate-300 [&>*]:invisible" : ""} {...attributes} {...listeners}>
      <CardView card={card} />
    </div>
  );
}

function CardView({ card, dragging = false }: { card: Card; dragging?: boolean }) {
  const { t, locale, timeZone } = useI18n();
  const days = daysSince(card.stageChangedAt);
  const overdue = card.nextDue && new Date(card.nextDue) < new Date();
  return (
    <div className={`rounded-md border border-line bg-white p-3 text-sm shadow-xs transition-[border-color,box-shadow] ${dragging ? "rotate-1 cursor-grabbing border-slate-300 shadow-[0_16px_32px_-12px_rgb(16_22_31/0.28)]" : "cursor-grab hover:border-slate-300 hover:shadow-sm"}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/leads/${card.id}`} className="font-medium text-slate-900 hover:text-brand-500 hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {card.name}
        </Link>
        {card.owner && <Avatar name={card.owner} />}
      </div>
      {card.phone && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted">
          <Phone size={11} />
          <a href={`tel:+${card.phone}`} onPointerDown={(e) => e.stopPropagation()} className="font-mono hover:text-ink hover:underline">
            {formatPhone(card.phone)}
          </a>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{t.program[card.program]}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{t.source[card.source]}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className={card.nextDue ? (overdue ? "font-medium text-red-600" : "text-slate-500") : "text-amber-600"}>
          <Clock size={11} className="mr-0.5 inline" />
          {card.nextDue ? fmt(t.pipeline.followUp, { date: formatDate(card.nextDue, locale, timeZone) }) : t.pipeline.noFollowUp}
        </span>
        <span className="text-slate-400">{fmt(t.pipeline.daysInStage, { n: days })}</span>
      </div>
    </div>
  );
}

function LostReasonModal({ onCancel, onSave }: { onCancel: () => void; onSave: (reason: string) => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  return (
    <Modal title={t.lead.lostReason} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(reason);
        }}
        className="flex flex-col gap-3"
      >
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass("ghost")} onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button type="submit" className={buttonClass("primary")}>
            {t.common.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}
