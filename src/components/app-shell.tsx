"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CheckSquare, ChevronsUpDown, Columns3, LayoutDashboard, LogOut, Menu, Plane, Plug, Plus, Settings, Users, X } from "lucide-react";
import { signOut, switchSchool } from "@/app/actions/session";
import { useI18n } from "@/components/i18n-provider";
import { LanguageToggle } from "@/components/language-toggle";
import { QuickAddLead } from "@/components/quick-add-lead";
import { Avatar } from "@/components/ui";
import type { Role } from "@/generated/prisma/enums";

type Props = {
  me: { name: string; email: string; role: Role; membershipId: string };
  org: { id: string; name: string };
  orgs: { orgId: string; name: string; role: Role }[];
  canAssign: boolean;
  canManage: boolean;
  members: { id: string; name: string }[];
  children: React.ReactNode;
};

export function AppShell({ me, org, orgs, canAssign, canManage, members, children }: Props) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [adding, setAdding] = useState(false);
  const [, startSwitch] = useTransition();

  // Close the mobile drawer after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawer(false);
  }

  // "n" opens quick-add from anywhere (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        setAdding(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = [
    { href: "/", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/pipeline", label: t.nav.pipeline, icon: Columns3 },
    { href: "/leads", label: t.nav.leads, icon: Users },
    { href: "/tasks", label: t.nav.tasks, icon: CheckSquare },
    ...(canManage ? [{ href: "/integrations", label: t.nav.integrations, icon: Plug }] : []),
    { href: "/settings", label: t.nav.settings, icon: Settings },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col bg-brand text-slate-200">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
          <Plane size={16} />
        </span>
        <span className="font-bold text-white">{t.app.name}</span>
      </div>

      <div className="px-3">
        {orgs.length > 1 ? (
          <label className="relative block">
            <span className="sr-only">{t.nav.switchSchool}</span>
            <select
              value={org.id}
              onChange={(e) => startSwitch(() => switchSchool(e.target.value))}
              className="appearance-none border-white/10 bg-white/5 pr-8 text-sm font-medium text-white focus:ring-white/20 [&>option]:text-slate-900"
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
          <div className="truncate rounded-lg bg-white/5 px-3 py-2 text-sm font-medium text-white">{org.name}</div>
        )}
      </div>

      <div className="px-3 pt-3">
        <button onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow hover:bg-sky-400">
          <Plus size={16} /> {t.nav.newLead}
          <kbd className="ml-auto hidden rounded bg-white/20 px-1.5 text-[10px] font-medium md:inline">N</kbd>
        </button>
      </div>

      <nav className="mt-4 flex-1 space-y-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive(href) ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon size={17} /> {label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name={me.name} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{me.name}</div>
            <div className="truncate text-xs text-slate-400">{t.roles[me.role]}</div>
          </div>
          <LanguageToggle locale={locale} t={t} dark />
        </div>
        <form action={signOut} className="mt-2">
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5 hover:text-white">
            <LogOut size={14} /> {t.nav.signOut}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Phone top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-2 bg-brand px-3 text-white md:hidden">
        <button aria-label="Menu" onClick={() => setDrawer(true)} className="rounded p-1.5 hover:bg-white/10">
          <Menu size={20} />
        </button>
        <span className="flex-1 truncate font-semibold">{org.name}</span>
        <button aria-label={t.nav.newLead} onClick={() => setAdding(true)} className="rounded-lg bg-accent p-1.5">
          <Plus size={18} />
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 md:block">{sidebar}</aside>

      {/* Phone drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <button aria-label={t.common.close} onClick={() => setDrawer(false)} className="absolute top-3 right-3 z-10 rounded p-1 text-slate-300 hover:bg-white/10">
              <X size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pt-16 pb-10 sm:px-6 md:pt-6">{children}</main>

      {adding && <QuickAddLead onClose={() => setAdding(false)} canAssign={canAssign} members={members} myId={me.membershipId} />}
    </div>
  );
}
