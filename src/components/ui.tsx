import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-[24px] border border-white/80 bg-gradient-to-br from-white via-white to-wine/5 p-5 shadow-soft sm:p-6">
      <div aria-hidden="true" className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-wine/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
        {eyebrow ? (
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-forest">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-wine" />
              {eyebrow}
            </p>
        ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "forest"
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "forest" | "wine" | "gold";
}) {
  const toneClass = {
    forest: "bg-forest/10 text-forest",
    wine: "bg-wine/10 text-wine",
    gold: "bg-gold/20 text-ink"
  }[tone];

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-line bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium leading-5 text-muted">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{value}</p>
        </div>
        <span className={clsx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", toneClass)}>
          <Icon aria-hidden="true" size={20} />
        </span>
      </div>
    </div>
  );
}

export function Notice({
  title,
  text,
  tone = "neutral"
}: {
  title: string;
  text?: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClass = {
    neutral: "border-line bg-white text-muted",
    success: "border-forest/25 bg-forest/5 text-forestDark",
    warning: "border-gold/40 bg-gold/10 text-ink"
  }[tone];
  const Icon = {
    neutral: Info,
    success: CheckCircle2,
    warning: AlertCircle
  }[tone];

  return (
    <div className={clsx("flex items-start gap-3 rounded-2xl border p-4 text-sm shadow-[0_4px_16px_rgba(87,0,36,0.04)]", toneClass)}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-current/10">
        <Icon aria-hidden="true" size={17} />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        {text ? <p className="mt-1 leading-6">{text}</p> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function StatusBadge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "border-line bg-paper text-muted",
    success: "border-forest/20 bg-forest/10 text-forest",
    warning: "border-gold/30 bg-gold/20 text-ink",
    danger: "border-wine/25 bg-wine/10 text-wine"
  }[tone];

  return (
    <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", toneClass)}>
      {children}
    </span>
  );
}
