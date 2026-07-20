"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  HeartHandshake,
  Home,
  LogOut,
  MoreHorizontal,
  Search,
  Settings,
  ShieldCheck,
  UserPlus
} from "lucide-react";
import clsx from "clsx";
import { SoftwareCopyright } from "@/components/SoftwareCopyright";
import { InstallAppButton } from "@/components/InstallAppButton";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";

type NavigationItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: typeof Home;
};

const navigation: NavigationItem[] = [
  { href: "/", label: "Início", icon: Home },
  { href: "/presenca", label: "Presença", icon: CalendarCheck },
  { href: "/cultos", label: "Cultos", icon: CalendarDays },
  { href: "/cadastros", label: "Cadastros", icon: UserPlus },
  { href: "/acompanhamento", label: "Acompanhamento", mobileLabel: "Acomp.", icon: HeartHandshake },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/busca", label: "Busca", icon: Search }
];

const receptionNavigation = navigation.filter((item) =>
  ["/", "/presenca", "/cultos", "/cadastros"].includes(item.href)
);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { settings } = useSystemSettings();
  const visibleNavigation = profile?.is_admin
    ? [
        ...navigation,
        { href: "/usuarios", label: "Usuários", icon: ShieldCheck },
        { href: "/configuracoes", label: "Configurações", mobileLabel: "Config.", icon: Settings }
      ]
    : profile?.role === "lideranca"
      ? navigation
      : receptionNavigation;
  const desktopMoreHrefs = profile?.is_admin
    ? ["/busca", "/usuarios", "/configuracoes"]
    : profile?.role === "lideranca"
      ? ["/busca"]
      : [];
  const desktopNavigation = visibleNavigation.filter((item) => !desktopMoreHrefs.includes(item.href));
  const desktopMoreNavigation = visibleNavigation.filter((item) => desktopMoreHrefs.includes(item.href));
  const moreIsActive = desktopMoreNavigation.some((item) => pathname === item.href)
    || (profile?.is_admin === true && pathname === "/duplicados");

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link className="flex shrink-0 items-center gap-3" href="/">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card border border-line bg-white p-1 shadow-soft">
              <Image
                alt=""
                aria-hidden="true"
                className="h-9 w-9 object-contain"
                height={40}
                priority
                src="/iasd-calcada-marca.png"
                unoptimized
                width={40}
              />
            </span>
            <span className="hidden w-36 min-w-0 lg:block xl:w-44">
              <span className="block truncate text-sm font-semibold text-ink">
                {settings.church_name}
              </span>
              <span className="block truncate text-xs text-muted">
                {profile?.is_admin ? "Administrador" : profile?.role === "lideranca" ? "Liderança" : "Recepção"}
              </span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label="Principal">
            {desktopNavigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex shrink-0 items-center gap-2 rounded-card px-2.5 py-2 text-sm font-medium transition xl:px-3",
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

            {desktopMoreNavigation.length > 0 ? (
              <details className="group relative shrink-0">
                <summary
                  className={clsx(
                    "inline-flex cursor-pointer list-none items-center gap-2 rounded-card px-2.5 py-2 text-sm font-medium transition xl:px-3 [&::-webkit-details-marker]:hidden",
                    moreIsActive
                      ? "bg-forest text-white"
                      : "text-muted hover:bg-paper hover:text-ink"
                  )}
                >
                  <MoreHorizontal aria-hidden="true" size={18} />
                  Mais
                </summary>
                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-card border border-line bg-white p-2 shadow-xl">
                  <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase text-muted">Outras áreas</p>
                  {desktopMoreNavigation.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link
                        className={clsx(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                          active ? "bg-forest text-white" : "text-ink hover:bg-paper"
                        )}
                        href={item.href}
                        key={item.href}
                        onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
                      >
                        <Icon aria-hidden="true" size={17} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </nav>

          <button
            className="secondary-button hidden px-3 py-2 lg:inline-flex"
            onClick={handleSignOut}
            type="button"
          >
            <LogOut aria-hidden="true" size={17} />
            Sair
          </button>

          <button
            aria-label="Sair"
            className="secondary-button px-3 py-2 lg:hidden"
            onClick={handleSignOut}
            type="button"
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:pt-7 lg:pb-10">
        {children}
        <footer className="mt-10 border-t border-line py-5 text-center text-xs text-muted">
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link className="font-semibold text-forest underline" href="/privacidade">
              Aviso de Privacidade e canal de atendimento
            </Link>
            <Link className="font-semibold text-forest underline" href="/termos">
              Termos de Uso
            </Link>
          </div>
          <div className="mt-3 flex justify-center">
            <InstallAppButton className="secondary-button px-3 py-2" />
          </div>
          <SoftwareCopyright className="mt-3" />
        </footer>
      </main>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 overflow-x-auto border-t border-line bg-white lg:hidden"
      >
        <div className="grid min-w-max" style={{ gridTemplateColumns: `repeat(${visibleNavigation.length}, 5rem)` }}>
          {visibleNavigation.map((item) => {
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
                <span>{item.mobileLabel ?? item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
