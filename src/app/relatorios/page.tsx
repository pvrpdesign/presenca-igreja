"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  FileDown,
  RefreshCw,
  Search,
  UserCheck,
  UserRoundPlus,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { formatDateBR, SERVICE_LABELS, todayInputValue } from "@/lib/date";
import { datedFileName, downloadSimplePdf } from "@/lib/exports";
import { supabase } from "@/lib/supabase";
import type { Attendance, Member, Service, ServiceType, Visitor } from "@/lib/types";

type ReportMember = Pick<
  Member,
  "id" | "full_name" | "phone" | "neighborhood" | "ministry"
>;

type VisitorFrequency = Pick<Visitor, "id" | "full_name" | "phone" | "location"> & {
  total: number;
};

type Reports = {
  lastService: Pick<Service, "id" | "service_date" | "service_type"> | null;
  absentLast: ReportMember[];
  missedTwo: ReportMember[];
  missedThree: ReportMember[];
  visitorsMoreThanOnce: VisitorFrequency[];
  visitorsThreeOrMore: VisitorFrequency[];
  serviceCount: number;
};

type ReportFilters = {
  memberSearch: string;
  ministry: string;
  neighborhood: string;
  visitorSearch: string;
  visitorLocation: string;
};

type ServiceTypeFilter = "todos" | ServiceType;

const emptyReports: Reports = {
  lastService: null,
  absentLast: [],
  missedTwo: [],
  missedThree: [],
  visitorsMoreThanOnce: [],
  visitorsThreeOrMore: [],
  serviceCount: 0
};

const emptyReportFilters: ReportFilters = {
  memberSearch: "",
  ministry: "",
  neighborhood: "",
  visitorSearch: "",
  visitorLocation: ""
};

const serviceTypeFilterOptions: { value: ServiceTypeFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "quarta", label: "Quarta" },
  { value: "sabado", label: "Sábado" },
  { value: "especial", label: "Especial" }
];

function dateInputDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeFilterValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesMemberFilters(member: ReportMember, filters: ReportFilters) {
  const memberSearch = normalizeFilterValue(filters.memberSearch.trim());
  const ministry = normalizeFilterValue(filters.ministry.trim());
  const neighborhood = normalizeFilterValue(filters.neighborhood.trim());
  const memberText = normalizeFilterValue(
    [member.full_name, member.phone, member.ministry, member.neighborhood]
      .filter(Boolean)
      .join(" ")
  );

  return (
    (!memberSearch || memberText.includes(memberSearch)) &&
    (!ministry || normalizeFilterValue(member.ministry ?? "").includes(ministry)) &&
    (!neighborhood || normalizeFilterValue(member.neighborhood ?? "").includes(neighborhood))
  );
}

function matchesVisitorFilters(visitor: VisitorFrequency, filters: ReportFilters) {
  const visitorSearch = normalizeFilterValue(filters.visitorSearch.trim());
  const visitorLocation = normalizeFilterValue(filters.visitorLocation.trim());
  const visitorText = normalizeFilterValue(
    [visitor.full_name, visitor.phone, visitor.location].filter(Boolean).join(" ")
  );

  return (
    (!visitorSearch || visitorText.includes(visitorSearch)) &&
    (!visitorLocation || normalizeFilterValue(visitor.location ?? "").includes(visitorLocation))
  );
}

export default function ReportsPage() {
  return (
    <AuthGate allowedRoles={["lideranca"]}>
      <ReportsContent />
    </AuthGate>
  );
}

function ReportsContent() {
  const [reports, setReports] = useState<Reports>(emptyReports);
  const [filters, setFilters] = useState<ReportFilters>(emptyReportFilters);
  const [reportStartDate, setReportStartDate] = useState(dateInputDaysAgo(30));
  const [reportEndDate, setReportEndDate] = useState(todayInputValue());
  const [reportServiceType, setReportServiceType] = useState<ServiceTypeFilter>("todos");
  const [periodMessage, setPeriodMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const lastServiceText = useMemo(() => {
    if (!reports.lastService) return "Nenhum sábado registrado";
    return `${SERVICE_LABELS[reports.lastService.service_type]} em ${formatDateBR(
      reports.lastService.service_date
    )}`;
  }, [reports.lastService]);

  const filteredReports = useMemo(
    () => ({
      ...reports,
      absentLast: reports.absentLast.filter((member) =>
        matchesMemberFilters(member, filters)
      ),
      missedTwo: reports.missedTwo.filter((member) =>
        matchesMemberFilters(member, filters)
      ),
      missedThree: reports.missedThree.filter((member) =>
        matchesMemberFilters(member, filters)
      ),
      visitorsMoreThanOnce: reports.visitorsMoreThanOnce.filter((visitor) =>
        matchesVisitorFilters(visitor, filters)
      ),
      visitorsThreeOrMore: reports.visitorsThreeOrMore.filter((visitor) =>
        matchesVisitorFilters(visitor, filters)
      )
    }),
    [filters, reports]
  );

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((value) => value.trim().length > 0),
    [filters]
  );

  const periodText = useMemo(() => {
    if (!reportStartDate || !reportEndDate) return "Período não informado";
    return `${formatDateBR(reportStartDate)} até ${formatDateBR(reportEndDate)}`;
  }, [reportEndDate, reportStartDate]);

  function updateFilter(key: keyof ReportFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function handleDownloadPdf() {
    const memberLine = (member: ReportMember) =>
      `${member.full_name} | ${member.phone || "Sem telefone"} | ${
        member.ministry || "Sem ministério"
      } | ${member.neighborhood || "Sem bairro"}`;

    const visitorLine = (visitor: VisitorFrequency) =>
      `${visitor.full_name} | ${visitor.phone || "Sem telefone"} | ${
        visitor.location || "Sem cidade/bairro"
      } | ${visitor.total} presenças`;

    downloadSimplePdf({
      fileName: datedFileName("relatorios-presenca", "pdf"),
      title: "Relatórios de presença",
      subtitle: `${periodText} | Último sábado: ${lastServiceText}`,
      sections: [
        {
          title: `Membros ausentes no último sábado (${filteredReports.absentLast.length})`,
          lines: filteredReports.absentLast.map(memberLine)
        },
        {
          title: `Membros com 2 sábados seguidos (${filteredReports.missedTwo.length})`,
          lines: filteredReports.missedTwo.map(memberLine)
        },
        {
          title: `Membros com 3 sábados seguidos (${filteredReports.missedThree.length})`,
          lines: filteredReports.missedThree.map(memberLine)
        },
        {
          title: `Visitantes que vieram mais de uma vez (${filteredReports.visitorsMoreThanOnce.length})`,
          lines: filteredReports.visitorsMoreThanOnce.map(visitorLine)
        },
        {
          title: `Visitantes que vieram 3 vezes ou mais (${filteredReports.visitorsThreeOrMore.length})`,
          lines: filteredReports.visitorsThreeOrMore.map(visitorLine)
        }
      ]
    });
  }

  const loadReports = useCallback(async () => {
    setIsLoading(true);

    if (!reportStartDate || !reportEndDate) {
      setReports(emptyReports);
      setPeriodMessage("Informe a data inicial e final para carregar os relatórios.");
      setIsLoading(false);
      return;
    }

    if (reportStartDate > reportEndDate) {
      setReports(emptyReports);
      setPeriodMessage("A data inicial não pode ser maior que a data final.");
      setIsLoading(false);
      return;
    }

    setPeriodMessage("");

    const servicesQuery = supabase
      .from("services")
      .select("id, service_date, service_type")
      .eq("service_type", "sabado")
      .gte("service_date", reportStartDate)
      .lte("service_date", reportEndDate);

    const { data: servicesData, error: servicesError } = await servicesQuery
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60);

    if (servicesError) {
      setReports(emptyReports);
      setPeriodMessage("Não foi possível carregar os sábados deste período.");
      setIsLoading(false);
      return;
    }

    const services = (servicesData ?? []) as Pick<
      Service,
      "id" | "service_date" | "service_type"
    >[];
    const recentServices = services.slice(0, 3);
    const serviceIds = recentServices.map((service) => service.id);

    const { data: membersData } = await supabase
      .from("members")
      .select("id, full_name, phone, neighborhood, ministry")
      .eq("status", "ativo")
      .order("full_name", { ascending: true });

    const activeMembers = (membersData ?? []) as ReportMember[];

    let memberAttendances: Pick<
      Attendance,
      "person_id" | "person_type" | "service_id"
    >[] = [];

    if (serviceIds.length > 0) {
      const { data } = await supabase
        .from("attendances")
        .select("person_id, person_type, service_id")
        .eq("person_type", "membro")
        .in("service_id", serviceIds);

      memberAttendances = (data ?? []) as Pick<
        Attendance,
        "person_id" | "person_type" | "service_id"
      >[];
    }

    const attendanceByService = new Map<string, Set<string>>();
    recentServices.forEach((service) => attendanceByService.set(service.id, new Set()));
    memberAttendances.forEach((attendance) => {
      attendanceByService.get(attendance.service_id)?.add(attendance.person_id);
    });

    const lastService = recentServices[0] ?? null;
    const lastPresent = lastService ? attendanceByService.get(lastService.id) : null;

    const absentLast =
      lastPresent && lastService
        ? activeMembers.filter((member) => !lastPresent.has(member.id))
        : [];

    const missedTwo =
      recentServices.length >= 2
        ? activeMembers.filter((member) =>
            recentServices
              .slice(0, 2)
              .every((service) => !attendanceByService.get(service.id)?.has(member.id))
          )
        : [];

    const missedThree =
      recentServices.length >= 3
        ? activeMembers.filter((member) =>
            recentServices
              .slice(0, 3)
              .every((service) => !attendanceByService.get(service.id)?.has(member.id))
          )
        : [];

    let visitorAttendanceQuery = supabase
      .from("attendances")
      .select("person_id")
      .eq("person_type", "visitante")
      .gte("service_date", reportStartDate)
      .lte("service_date", reportEndDate);

    if (reportServiceType !== "todos") {
      visitorAttendanceQuery = visitorAttendanceQuery.eq("service_type", reportServiceType);
    }

    const { data: visitorAttendanceData } = await visitorAttendanceQuery.limit(5000);

    const visitorCounts = new Map<string, number>();
    (visitorAttendanceData ?? []).forEach((attendance) => {
      visitorCounts.set(attendance.person_id, (visitorCounts.get(attendance.person_id) ?? 0) + 1);
    });

    const recurringVisitorIds = [...visitorCounts.entries()]
      .filter(([, total]) => total > 1)
      .map(([id]) => id);

    let visitorRows: Pick<Visitor, "id" | "full_name" | "phone" | "location">[] = [];

    if (recurringVisitorIds.length > 0) {
      const { data } = await supabase
        .from("visitors")
        .select("id, full_name, phone, location")
        .in("id", recurringVisitorIds);

      visitorRows = (data ?? []) as Pick<Visitor, "id" | "full_name" | "phone" | "location">[];
    }

    const visitorsWithFrequency = visitorRows
      .map((visitor) => ({
        ...visitor,
        total: visitorCounts.get(visitor.id) ?? 0
      }))
      .sort((a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name));

    setReports({
      lastService,
      absentLast,
      missedTwo,
      missedThree,
      visitorsMoreThanOnce: visitorsWithFrequency.filter((visitor) => visitor.total > 1),
      visitorsThreeOrMore: visitorsWithFrequency.filter((visitor) => visitor.total >= 3),
      serviceCount: services.length
    });
    setIsLoading(false);
  }, [reportEndDate, reportServiceType, reportStartDate]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  return (
    <div>
      <PageHeader
        action={
          <>
            <button
              className="secondary-button"
              disabled={isLoading}
              onClick={handleDownloadPdf}
              type="button"
            >
              <FileDown aria-hidden="true" size={17} />
              Baixar PDF
            </button>
            <button className="secondary-button" onClick={loadReports} type="button">
              <RefreshCw aria-hidden="true" size={17} />
              Atualizar
            </button>
          </>
        }
        eyebrow="Liderança"
        title="Relatórios"
      />

      <section className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Último sábado</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">{lastServiceText}</h2>
            <p className="mt-1 text-sm text-muted">{periodText}</p>
          </div>
          <StatusBadge tone={reports.serviceCount > 0 ? "success" : "warning"}>
            {reports.serviceCount} sábados na base
          </StatusBadge>
        </div>
      </section>

      <section className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Período</p>
            <h2 className="text-base font-semibold text-ink">Período do relatório</h2>
          </div>
          <StatusBadge tone={reportServiceType === "todos" ? "neutral" : "success"}>
            {reportServiceType === "todos" ? "Visitantes: todos" : `Visitantes: ${SERVICE_LABELS[reportServiceType]}`}
          </StatusBadge>
        </div>

        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            loadReports();
          }}
        >
          <Field label="Data inicial">
            <input
              className="field-input"
              onChange={(event) => setReportStartDate(event.target.value)}
              type="date"
              value={reportStartDate}
            />
          </Field>
          <Field label="Data final">
            <input
              className="field-input"
              onChange={(event) => setReportEndDate(event.target.value)}
              type="date"
              value={reportEndDate}
            />
          </Field>
          <Field label="Tipo de culto dos visitantes">
            <select
              className="field-input"
              onChange={(event) =>
                setReportServiceType(event.target.value as ServiceTypeFilter)
              }
              value={reportServiceType}
            >
              {serviceTypeFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <button className="primary-button self-end" disabled={isLoading} type="submit">
            <RefreshCw aria-hidden="true" size={17} />
            {isLoading ? "Carregando..." : "Aplicar"}
          </button>
        </form>
        <p className="mt-3 text-sm text-muted">
          Faltas seguidas consideram apenas cultos de sábado. O tipo de culto acima filtra a recorrência de visitantes.
        </p>
      </section>

      {periodMessage ? (
        <Notice title={periodMessage} tone="warning" />
      ) : null}

      <section className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Search aria-hidden="true" size={18} />
            <h2 className="text-base font-semibold text-ink">Filtros do relatório</h2>
          </div>
          {hasActiveFilters ? (
            <button
              className="secondary-button min-h-9 px-3 py-2 text-sm"
              onClick={() => setFilters(emptyReportFilters)}
              type="button"
            >
              <X aria-hidden="true" size={16} />
              Limpar filtros
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Buscar membro">
            <input
              className="field-input"
              onChange={(event) => updateFilter("memberSearch", event.target.value)}
              placeholder="Nome ou telefone"
              value={filters.memberSearch}
            />
          </Field>
          <Field label="Ministério">
            <input
              className="field-input"
              onChange={(event) => updateFilter("ministry", event.target.value)}
              placeholder="Ex.: louvor"
              value={filters.ministry}
            />
          </Field>
          <Field label="Bairro">
            <input
              className="field-input"
              onChange={(event) => updateFilter("neighborhood", event.target.value)}
              placeholder="Bairro"
              value={filters.neighborhood}
            />
          </Field>
          <Field label="Buscar visitante">
            <input
              className="field-input"
              onChange={(event) => updateFilter("visitorSearch", event.target.value)}
              placeholder="Nome ou telefone"
              value={filters.visitorSearch}
            />
          </Field>
          <Field label="Cidade/bairro visitante">
            <input
              className="field-input"
              onChange={(event) => updateFilter("visitorLocation", event.target.value)}
              placeholder="Cidade ou bairro"
              value={filters.visitorLocation}
            />
          </Field>
        </div>
      </section>

      {isLoading ? (
        <Notice title="Carregando relatórios..." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <ReportSection
            count={filteredReports.absentLast.length}
            emptyText="Nenhum membro ausente no último sábado."
            hasActiveFilters={hasActiveFilters}
            icon={CalendarClock}
            items={filteredReports.absentLast}
            title="Membros ausentes no último sábado"
          />
          <ReportSection
            count={filteredReports.missedTwo.length}
            emptyText={
              reports.serviceCount < 2
                ? "Ainda não há 2 cultos de sábado registrados."
                : "Nenhum membro com 2 sábados seguidos."
            }
            hasActiveFilters={hasActiveFilters}
            icon={AlertCircle}
            items={filteredReports.missedTwo}
            title="Membros com 2 sábados seguidos"
          />
          <ReportSection
            count={filteredReports.missedThree.length}
            emptyText={
              reports.serviceCount < 3
                ? "Ainda não há 3 cultos de sábado registrados."
                : "Nenhum membro com 3 sábados seguidos."
            }
            hasActiveFilters={hasActiveFilters}
            icon={AlertCircle}
            items={filteredReports.missedThree}
            title="Membros com 3 sábados seguidos"
          />
          <VisitorSection
            emptyText="Nenhum visitante veio mais de uma vez."
            hasActiveFilters={hasActiveFilters}
            icon={UserRoundPlus}
            items={filteredReports.visitorsMoreThanOnce}
            title="Visitantes que vieram mais de uma vez"
          />
          <VisitorSection
            emptyText="Nenhum visitante veio 3 vezes ou mais."
            hasActiveFilters={hasActiveFilters}
            icon={UserCheck}
            items={filteredReports.visitorsThreeOrMore}
            title="Visitantes que vieram 3 vezes ou mais"
          />
        </div>
      )}
    </div>
  );
}

function ReportSection({
  count,
  emptyText,
  hasActiveFilters,
  icon: Icon,
  items,
  title
}: {
  count: number;
  emptyText: string;
  hasActiveFilters?: boolean;
  icon: LucideIcon;
  items: ReportMember[];
  title: string;
}) {
  const emptyMessage = hasActiveFilters
    ? "Nenhum membro encontrado com os filtros atuais."
    : emptyText;

  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" size={19} />
          <h2 className="text-base font-semibold text-ink">{title}</h2>
        </div>
        <StatusBadge tone={count > 0 ? "warning" : "success"}>{count}</StatusBadge>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {items.map((member) => (
            <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={member.id}>
              <p className="font-medium text-ink">{member.full_name}</p>
              <p className="text-sm text-muted">
                {member.phone || member.ministry || member.neighborhood || "Sem contato"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function VisitorSection({
  emptyText,
  hasActiveFilters,
  icon: Icon,
  items,
  title
}: {
  emptyText: string;
  hasActiveFilters?: boolean;
  icon: LucideIcon;
  items: VisitorFrequency[];
  title: string;
}) {
  const emptyMessage = hasActiveFilters
    ? "Nenhum visitante encontrado com os filtros atuais."
    : emptyText;

  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" size={19} />
          <h2 className="text-base font-semibold text-ink">{title}</h2>
        </div>
        <StatusBadge tone={items.length > 0 ? "success" : "neutral"}>{items.length}</StatusBadge>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {items.map((visitor) => (
            <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={visitor.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{visitor.full_name}</p>
                  <p className="text-sm text-muted">
                    {visitor.phone || visitor.location || "Sem contato"}
                  </p>
                </div>
                <StatusBadge tone="success">{visitor.total} presenças</StatusBadge>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
