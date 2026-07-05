"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  Church,
  HeartHandshake,
  Home,
  LogOut,
  UserPlus,
  UsersRound
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/contexts/AuthContext";

const navigation = [
  { href: "/", label: "Início", icon: Home },
  { href: "/presenca", label: "Presença", icon: CalendarCheck },
  { href: "/membros", label: "Membros", icon: UsersRound },
  { href: "/visitantes", label: "Visitantes", icon: UserPlus },
  { href: "/acompanhamento", label: "Acomp.", icon: HeartHandshake },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link className="flex min-w-0 items-center gap-3" href="/">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-forest text-white">
              <Church aria-hidden="true" size={22} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">
                Presença Igreja
              </span>
              <span className="block truncate text-xs text-muted">
                {profile?.role === "lideranca" ? "Liderança" : "Recepção"}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-card px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-forest text-white"
                      : "text-muted hover:bg-paper hover:text-ink"
                  )}
                >
                  <Icon aria-hidden="true" size={17} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            className="secondary-button hidden px-3 py-2 md:inline-flex"
            onClick={handleSignOut}
            type="button"
          >
            <LogOut aria-hidden="true" size={17} />
            Sair
          </button>

          <button
            aria-label="Sair"
            className="secondary-button px-3 py-2 md:hidden"
            onClick={handleSignOut}
            type="button"
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:pt-7 md:pb-10">
        {children}
      </main>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white md:hidden"
      >
        <div className="grid grid-cols-6">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-forest" : "text-muted"
                )}
              >
                <Icon aria-hidden="true" size={21} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
