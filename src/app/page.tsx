"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  HeartHandshake,
  Search,
  UserPlus,
  UsersRound
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { MetricCard, Notice, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatDateBR,
  inferServiceType,
  serviceTitle,
  SERVICE_LABELS,
  todayInputValue
} from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Attendance, Member, Service, ServiceType } from "@/lib/types";

type Summary = {
  total: number;
  members: number;
  visitors: number;
};

type AbsenceAlert = {
  missedTwoCount: number;
  pendingFollowUpsCount: number;
  recentServiceCount: number;
  lastServiceText: string;
};

const emptyAbsenceAlert: AbsenceAlert = {
  missedTwoCount: 0,
  pendingFollowUpsCount: 0,
  recentServiceCount: 0,
  lastServiceText: ""
};

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardContent />
    </AuthGate>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const [serviceDate, setServiceDate] = useState(todayInputValue());
  const [serviceType, setServiceType] = useState<ServiceType>(() =>
    inferServiceType(todayInputValue())
  );
  const [summary, setSummary] = useState<Summary>({ total: 0, members: 0, visitors: 0 });
  const [absenceAlert, setAbsenceAlert] = useState<AbsenceAlert>(emptyAbsenceAlert);
  const [checkInMessage, setCheckInMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAlertLoading, setIsAlertLoading] = useState(false);
  const [isStartingCheckIn, setIsStartingCheckIn] = useState(false);

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

  const loadAbsenceAlert = useCallback(async () => {
    if (profile?.role !== "lideranca") {
      setAbsenceAlert(emptyAbsenceAlert);
      setIsAlertLoading(false);
      return;
    }

    setIsAlertLoading(true);

    const { data: servicesData, error: servicesError } = await supabase
      .from("services")
      .select("id, service_date, service_type, created_at")
      .lte("service_date", todayInputValue())
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2);

    if (servicesError) {
      setAbsenceAlert(emptyAbsenceAlert);
      setIsAlertLoading(false);
      return;
    }

    const recentServices = (servicesData ?? []) as Pick<
      Service,
      "id" | "service_date" | "service_type" | "created_at"
    >[];

    if (recentServices.length < 2) {
      const latestService = recentServices[0];
      setAbsenceAlert({
        missedTwoCount: 0,
        pendingFollowUpsCount: 0,
        recentServiceCount: recentServices.length,
        lastServiceText: latestService
          ? `${SERVICE_LABELS[latestService.service_type]} em ${formatDateBR(latestService.service_date)}`
          : ""
      });
      setIsAlertLoading(false);
      return;
    }

    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select("id")
      .eq("status", "ativo");

    if (membersError) {
      setAbsenceAlert(emptyAbsenceAlert);
      setIsAlertLoading(false);
      return;
    }

    const activeMemberIds = ((membersData ?? []) as Pick<Member, "id">[]).map(
      (member) => member.id
    );

    if (activeMemberIds.length === 0) {
      setAbsenceAlert({
        missedTwoCount: 0,
        pendingFollowUpsCount: 0,
        recentServiceCount: recentServices.length,
        lastServiceText: `${SERVICE_LABELS[recentServices[0].service_type]} em ${formatDateBR(
          recentServices[0].service_date
        )}`
      });
      setIsAlertLoading(false);
      return;
    }

    const serviceIds = recentServices.map((service) => service.id);
    const { data: attendancesData, error: attendancesError } = await supabase
      .from("attendances")
      .select("person_id, service_id, person_type")
      .eq("person_type", "membro")
      .in("service_id", serviceIds);

    if (attendancesError) {
      setAbsenceAlert(emptyAbsenceAlert);
      setIsAlertLoading(false);
      return;
    }

    const presentByService = new Map<string, Set<string>>();
    ((attendancesData ?? []) as Pick<
      Attendance,
      "person_id" | "service_id" | "person_type"
    >[]).forEach((attendance) => {
      const currentSet = presentByService.get(attendance.service_id) ?? new Set<string>();
      currentSet.add(attendance.person_id);
      presentByService.set(attendance.service_id, currentSet);
    });

    const missedTwoMemberIds = activeMemberIds.filter((memberId) =>
      recentServices.every((service) => !presentByService.get(service.id)?.has(memberId))
    );

    let accompaniedCount = 0;

    if (missedTwoMemberIds.length > 0) {
      const { data: followUpsData } = await supabase
        .from("member_followups")
        .select("member_id, status")
        .eq("last_service_id", recentServices[0].id)
        .in("status", ["acompanhado", "removido"])
        .in("member_id", missedTwoMemberIds);

      accompaniedCount = (followUpsData ?? []).length;
    }

    setAbsenceAlert({
      missedTwoCount: missedTwoMemberIds.length,
      pendingFollowUpsCount: Math.max(missedTwoMemberIds.length - accompaniedCount, 0),
      recentServiceCount: recentServices.length,
      lastServiceText: `${SERVICE_LABELS[recentServices[0].service_type]} em ${formatDateBR(
        recentServices[0].service_date
      )}`
    });
    setIsAlertLoading(false);
  }, [profile?.role]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadAbsenceAlert();
  }, [loadAbsenceAlert]);

  async function handleStartCheckIn() {
    setCheckInMessage("");

    if (!serviceDate) {
      setCheckInMessage("Informe a data do culto para iniciar o check-in.");
      return;
    }

    setIsStartingCheckIn(true);

    const { data: existingService, error: existingServiceError } = await supabase
      .from("services")
      .select("id")
      .eq("service_date", serviceDate)
      .eq("service_type", serviceType)
      .maybeSingle();

    if (existingServiceError) {
      setCheckInMessage("Não foi possível verificar se o culto já existe.");
      setIsStartingCheckIn(false);
      return;
    }

    if (!existingService) {
      const { error: insertError } = await supabase.from("services").insert({
        service_date: serviceDate,
        service_type: serviceType,
        title: serviceTitle(serviceDate, serviceType),
        created_by: session?.user.id ?? null
      });

      if (insertError && insertError.code !== "23505") {
        setCheckInMessage("Não foi possível criar o culto. Confira sua conexão e tente novamente.");
        setIsStartingCheckIn(false);
        return;
      }
    }

    router.push(`/presenca?data=${serviceDate}&tipo=${serviceType}`);
  }

  const actions = useMemo(
    () => [
      {
        href: "#culto-atual",
        label: "Iniciar culto",
        icon: ClipboardCheck,
        tone: "bg-forest text-white hover:bg-forestDark"
      },
      {
        href: "/cultos",
        label: "Cultos",
        icon: CalendarDays,
        tone: "bg-white text-ink hover:border-forest hover:text-forest"
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
        href: "/acompanhamento",
        label: "Acompanhamento",
        icon: HeartHandshake,
        tone: "bg-white text-ink hover:border-wine hover:text-wine"
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

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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

      <section
        className="mb-5 scroll-mt-24 rounded-card border border-line bg-white p-4 shadow-soft"
        id="culto-atual"
      >
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
                setCheckInMessage("");
              }}
              type="date"
              value={serviceDate}
            />
          </label>
          <label>
            <span className="field-label">Tipo de culto</span>
            <select
              className="field-input"
              onChange={(event) => {
                setServiceType(event.target.value as ServiceType);
                setCheckInMessage("");
              }}
              value={serviceType}
            >
              <option value="quarta">Quarta</option>
              <option value="sabado">Sábado</option>
              <option value="especial">Especial</option>
            </select>
          </label>
          <button
            className="primary-button sm:mb-0"
            disabled={isStartingCheckIn}
            onClick={handleStartCheckIn}
            type="button"
          >
            <Search aria-hidden="true" size={18} />
            {isStartingCheckIn ? "Abrindo..." : "Iniciar culto / check-in"}
          </button>
        </div>
        {checkInMessage ? (
          <p className="mt-3 rounded-card border border-gold/40 bg-gold/10 p-3 text-sm text-ink">
            {checkInMessage}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-muted">
          {SERVICE_LABELS[serviceType]} em {formatDateBR(serviceDate)}
        </p>
      </section>

      {profile?.role === "lideranca" ? (
        <section
          className={`mb-5 rounded-card border p-4 shadow-soft sm:p-5 ${
            absenceAlert.missedTwoCount > 0
              ? "border-wine/30 bg-wine/5"
              : "border-line bg-white"
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-card ${
                  absenceAlert.missedTwoCount > 0
                    ? "bg-wine/10 text-wine"
                    : "bg-forest/10 text-forest"
                }`}
              >
                <AlertCircle aria-hidden="true" size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">Alerta de faltas seguidas</p>
                {isAlertLoading ? (
                  <p className="mt-1 text-sm text-muted">Verificando os últimos cultos...</p>
                ) : absenceAlert.recentServiceCount < 2 ? (
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Cadastre pelo menos 2 cultos para o sistema calcular faltas seguidas.
                  </p>
                ) : (
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {absenceAlert.missedTwoCount} membros ativos faltaram nos 2 últimos cultos.
                    {" "}
                    {absenceAlert.pendingFollowUpsCount} pendentes de acompanhamento.
                    {absenceAlert.lastServiceText ? ` Último culto: ${absenceAlert.lastServiceText}.` : ""}
                  </p>
                )}
              </div>
            </div>
            <Link className="secondary-button w-full sm:w-auto" href="/acompanhamento">
              Abrir acompanhamento
            </Link>
          </div>
        </section>
      ) : null}

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
