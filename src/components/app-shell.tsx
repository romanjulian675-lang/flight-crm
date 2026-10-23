"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { BarChart3, CheckSquare, ChartNoAxesColumn, ChevronsUpDown, Columns3, LayoutDashboard, LogOut, Menu, MessageCircle, Plug, Plus, Search, Settings, Users, X } from "lucide-react";
import { signOut, switchSchool } from "@/app/actions/session";
import { useI18n } from "@/components/i18n-provider";
import { LanguageToggle } from "@/components/language-toggle";
import { Logo } from "@/components/logo";
import { QuickAddLead } from "@/components/quick-add-lead";
import { Toaster } from "@/components/toaster";
import { Avatar, buttonClass } from "@/components/ui";
import type { Role } from "@/generated/prisma/enums";

type Props = {
  me: { name: string; email: string; role: Role; membershipId: string };
  org: { id: string; name: string };
  orgs: { orgId: string; name: string; role: Role }[];
  canAssign: boolean;
  canManage: boolean;
  members: { id: string; name: string }[];
  /** Unread WhatsApp messages, or null when WhatsApp isn't set up (hides the menu item). */
  waUnread: number | null;
  children: React.ReactNode;
};

const isTyping = (el: HTMLElement) => ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;

/**
 * Framed sheet shell: one blue-grey frame holds the sidebar and the top bar (no rule between them);
 * the page sits on a white sheet inset 8px from the window's right and bottom edges.
 */
export function AppShell({ me, org, orgs, canAssign, canManage, members, waUnread, children }: Props) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [adding, setAdding] = useState(false);
  const [, startSwitch] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  // Close the mobile drawer after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawer(false);
  }

  // "n" opens quick-add, "/" jumps to search — from anywhere, not while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target as HTMLElement)) return;
      if (e.key === "n") {
        e.preventDefault();
        setAdding(true);
      } else if (e.key === "/") {
        e.preventDefault();
        // On screens with their own search, "/" goes to that one.
        const local = document.querySelector<HTMLInputElement>("main input:not([type=checkbox]):not([type=radio]):not([type=hidden])");
        (searchRef.current?.closest(".invisible") ? local : searchRef.current)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const main = [
    { href: "/", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/pipeline", label: t.nav.pipeline, icon: Columns3 },
    { href: "/reports", label: t.nav.reports, icon: ChartNoAxesColumn },
    ...(waUnread !== null ? [{ href: "/inbox", label: t.nav.inbox, icon: MessageCircle, badge: waUnread }] : []),
    { href: "/leads", label: t.nav.leads, icon: Users },
    { href: "/tasks", label: t.nav.tasks, icon: CheckSquare },
    { href: "/team", label: canManage ? t.nav.team : t.nav.myStats, icon: BarChart3 },
  ];
  const admin = [...(canManage ? [{ href: "/integrations", label: t.nav.integrations, icon: Plug }] : []), { href: "/settings", label: t.nav.settings, icon: Settings }];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // Screens with their own search box don't need a second one above them.
  const ownSearch = pathname === "/leads" || pathname === "/pipeline";

  const navItem = ({ href, label, icon: Icon, badge }: { href: string; label: string; icon: typeof Users; badge?: number }) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors ${active ? "bg-frame-active font-medium text-ink" : "text-slate-600 hover:bg-frame-hover hover:text-ink"}`}
      >
        <Icon size={16} strokeWidth={1.75} className={active ? "text-accent" : "text-slate-500"} /> {label}
        {badge ? <span className="ml-auto rounded-full bg-[#1fa855] px-1.5 text-[11px] leading-[18px] font-semibold text-white tabular-nums">{badge}</span> : null}
      </Link>
    );
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-frame">
      <div className="flex h-12 items-center px-4">
        <Logo name={t.app.name} />
      </div>

      <div className="px-3 pt-1">
        {orgs.length > 1 ? (
          <label className="relative block">
            <span className="sr-only">{t.nav.switchSchool}</span>
            <select
              value={org.id}
              onChange={(e) => startSwitch(() => switchSchool(e.target.value))}
              className="h-9 appearance-none border-line bg-white/70 pr-8 text-sm font-medium text-ink"
            >
              {orgs.map((o) => (
                <option key={o.orgId} value={o.orgId}>
                  {o.name}
                </option>
              ))}
            </select>
            <ChevronsUpDown size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400" />
          </label>
        ) : (
          <div className="truncate rounded-md border border-line bg-white/70 px-3 py-2 text-sm font-medium text-ink">{org.name}</div>
        )}
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-0.5 px-3" aria-label="Main">
        {main.map(navItem)}
        <div className="mt-auto flex flex-col gap-0.5 pt-4">{admin.map(navItem)}</div>
      </nav>

      <div className="mx-3 mt-3 mb-3 flex items-center gap-2.5 border-t border-line px-1 pt-3">
        <Avatar name={me.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{me.name}</div>
          <div className="truncate text-xs text-slate-500">{t.roles[me.role]}</div>
        </div>
        <LanguageToggle locale={locale} t={t} />
        <form action={signOut}>
          <button aria-label={t.nav.signOut} title={t.nav.signOut} className="pressable rounded-md p-1.5 text-slate-500 hover:bg-frame-hover hover:text-ink">
            <LogOut size={15} />
          </button>
        </form>
      </div>
    </div>
  );

  const newLead = (
    <button onClick={() => setAdding(true)} className={buttonClass("primary")}>
      <Plus size={16} /> {t.nav.newLead}
      <kbd className="ml-1 hidden rounded bg-white/15 px-1.5 text-[11px] font-medium md:inline">N</kbd>
    </button>
  );

  return (
    <div className="min-h-screen bg-frame md:flex">
      {/* Phone top bar: the frame shrinks to a 48px bar; the sheet becomes the screen. */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-frame px-2 md:hidden">
        <button aria-label="Menu" onClick={() => setDrawer(true)} className="pressable relative rounded-md p-2 text-slate-700 hover:bg-frame-hover">
          <Menu size={20} />
          {waUnread ? <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#1fa855]" /> : null}
        </button>
        <span className="flex-1 truncate text-sm font-semibold text-ink">{org.name}</span>
        <button aria-label={t.nav.newLead} onClick={() => setAdding(true)} className={`${buttonClass("primary")} px-2.5`}>
          <Plus size={18} />
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 md:block">{sidebar}</aside>

      {/* Phone drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/30" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-drawer-in border-r border-line">
            <button aria-label={t.common.close} onClick={() => setDrawer(false)} className="absolute top-2.5 right-2.5 z-10 rounded-md p-1.5 text-slate-500 hover:bg-frame-hover">
              <X size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col md:h-screen">
        {/* Desktop top bar, on the frame, no rule */}
        <header className="hidden h-12 shrink-0 items-center gap-3 pr-4 pl-2 md:flex">
          <form action="/leads" role="search" className={`relative mx-auto w-full max-w-[548px] ${ownSearch ? "invisible" : ""}`}>
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              name="q"
              type="search"
              aria-label={t.common.search}
              placeholder={t.pipeline.searchPlaceholder}
              className="h-8 border-line bg-white/80 pr-10 pl-9 focus:bg-white"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-line bg-raised px-1.5 text-[11px] text-slate-500">/</kbd>
          </form>
          {newLead}
        </header>

        {/* The sheet */}
        <main className="min-w-0 flex-1 bg-sheet px-4 pt-16 pb-10 sm:px-6 md:mr-2 md:mb-2 md:overflow-y-auto md:rounded-2xl md:border md:border-line md:pt-6">{children}</main>
      </div>

      <Toaster />
      {adding && <QuickAddLead onClose={() => setAdding(false)} canAssign={canAssign} members={members} myId={me.membershipId} />}
    </div>
  );
}
