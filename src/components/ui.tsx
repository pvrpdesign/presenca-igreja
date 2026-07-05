import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export function PageHeader({
  eyebrow,
  title,
  action
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase text-forest">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">{title}</h1>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
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
    <div className="rounded-card border border-line bg-white p-4 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className={clsx("flex h-10 w-10 items-center justify-center rounded-card", toneClass)}>
          <Icon aria-hidden="true" size={20} />
        </span>
      </div>
      <p className="text-3xl font-semibold text-ink">{value}</p>
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

  return (
    <div className={clsx("rounded-card border p-4 text-sm", toneClass)}>
      <p className="font-semibold">{title}</p>
      {text ? <p className="mt-1 leading-6">{text}</p> : null}
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
