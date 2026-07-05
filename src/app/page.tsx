"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Search,
  UserPlus,
  UsersRound
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { MetricCard, Notice, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateBR, inferServiceType, SERVICE_LABELS, todayInputValue } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Attendance, ServiceType } from "@/lib/types";

type Summary = {
  total: number;
  members: number;
  visitors: number;
};

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardContent />
    </AuthGate>
  );
}

function DashboardContent() {
  const { profile } = useAuth();
  const [serviceDate, setServiceDate] = useState(todayInputValue());
  const [serviceType, setServiceType] = useState<ServiceType>(() =>
    inferServiceType(todayInputValue())
  );
  const [summary, setSummary] = useState<Summary>({ total: 0, members: 0, visitors: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const roleLabel = profile?.role === "lideranca" ? "Liderança" : "Recepção";

  const loadSummary = useCallback(async () => {
    setIsLoading(true);

    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("id")
      .eq("service_date", serviceDate)
      .eq("service_type", serviceType)
      .maybeSingle();

    if (serviceError || !service) {
      setSummary({ total: 0, members: 0, visitors: 0 });
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("attendances")
      .select("person_type")
      .eq("service_id", service.id);

    if (error) {
      setSummary({ total: 0, members: 0, visitors: 0 });
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as Pick<Attendance, "person_type">[];
    setSummary({
      total: rows.length,
      members: rows.filter((row) => row.person_type === "membro").length,
      visitors: rows.filter((row) => row.person_type === "visitante").length
    });
    setIsLoading(false);
  }, [serviceDate, serviceType]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const actions = useMemo(
    () => [
      {
        href: "/presenca",
        label: "Registrar presença",
        icon: ClipboardCheck,
        tone: "bg-forest text-white hover:bg-forestDark"
      },
      {
        href: "/membros",
        label: "Cadastrar membro",
        icon: UsersRound,
        tone: "bg-white text-ink hover:border-forest hover:text-forest"
      },
      {
        href: "/visitantes",
        label: "Cadastrar visitante",
        icon: UserPlus,
        tone: "bg-white text-ink hover:border-forest hover:text-forest"
      },
      {
        href: "/relatorios",
        label: "Relatórios",
        icon: BarChart3,
        tone: "bg-white text-ink hover:border-wine hover:text-wine"
      }
    ],
    []
  );

  return (
    <div>
      <PageHeader eyebrow={roleLabel} title="Dashboard" />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              className={`flex min-h-20 items-center justify-between gap-3 rounded-card border border-line p-4 text-sm font-semibold shadow-soft transition ${action.tone}`}
              href={action.href}
              key={action.href}
            >
              <span>{action.label}</span>
              <Icon aria-hidden="true" size={22} />
            </Link>
          );
        })}
      </section>

      <section className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarDays aria-hidden="true" size={18} />
          Culto atual
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <label>
            <span className="field-label">Data</span>
            <input
              className="field-input"
              onChange={(event) => {
                setServiceDate(event.target.value);
                setServiceType(inferServiceType(event.target.value));
              }}
              type="date"
              value={serviceDate}
            />
          </label>
          <label>
            <span className="field-label">Tipo de culto</span>
            <select
              className="field-input"
              onChange={(event) => setServiceType(event.target.value as ServiceType)}
              value={serviceType}
            >
              <option value="quarta">Quarta</option>
              <option value="sabado">Sábado</option>
              <option value="especial">Especial</option>
            </select>
          </label>
          <Link className="primary-button sm:mb-0" href="/presenca">
            <Search aria-hidden="true" size={18} />
            Check-in
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted">
          {SERVICE_LABELS[serviceType]} em {formatDateBR(serviceDate)}
        </p>
      </section>

      {isLoading ? (
        <Notice title="Carregando resumo..." />
      ) : (
        <section className="grid gap-3 sm:grid-cols-3">
          <MetricCard icon={CalendarCheck} label="Total de presentes" value={summary.total} />
          <MetricCard icon={UsersRound} label="Membros presentes" tone="gold" value={summary.members} />
          <MetricCard icon={UserPlus} label="Visitantes presentes" tone="wine" value={summary.visitors} />
        </section>
      )}
    </div>
  );
}
