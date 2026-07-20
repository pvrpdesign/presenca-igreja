"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  ClipboardList,
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
import { useAuth } from "@/contexts/AuthContext";
import { formatDateBR, SERVICE_LABELS, todayInputValue } from "@/lib/date";
import { datedFileName, downloadSimplePdf } from "@/lib/exports";
import { authorizeDataExport } from "@/lib/exportAudit";
import { supabase } from "@/lib/supabase";
import type {
  Attendance,
  ExportAuditLog,
  Member,
  Pastor,
  Service,
  ServiceType,
  SpecialMusic,
  Visitor,
  Profile
} from "@/lib/types";

type ReportMember = Pick<
  Member,
  "id" | "full_name" | "phone" | "neighborhood" | "ministry"
>;

type VisitorFrequency = Pick<Visitor, "id" | "full_name" | "phone" | "location"> & {
  total: number;
};

type PastorFrequency = Pick<Pastor, "id" | "full_name" | "phone" | "district"> & {
  total: number;
  visits: Pick<Attendance, "service_date" | "service_type">[];
};

type SpecialMusicReport = Pick<
  SpecialMusic,
  "id" | "performer_name" | "contact" | "church" | "visit_date"
>;

type Reports = {
  lastService: Pick<Service, "id" | "service_date" | "service_type"> | null;
  absentLast: ReportMember[];
  missedTwo: ReportMember[];
  missedThree: ReportMember[];
  visitorsMoreThanOnce: VisitorFrequency[];
  visitorsThreeOrMore: VisitorFrequency[];
  pastorsInPeriod: PastorFrequency[];
  specialMusic: SpecialMusicReport[];
  serviceCount: number;
};

type ReportFilters = {
  memberSearch: string;
  ministry: string;
  neighborhood: string;
  visitorSearch: string;
  visitorLocation: string;
  pastorSearch: string;
  pastorDistrict: string;
  musicSearch: string;
  musicChurch: string;
};

type ServiceTypeFilter = "todos" | ServiceType;
type AudienceFilter = "todos" | "membros" | "visitantes" | "pastores" | "musica";

const emptyReports: Reports = {
  lastService: null,
  absentLast: [],
  missedTwo: [],
  missedThree: [],
  visitorsMoreThanOnce: [],
  visitorsThreeOrMore: [],
  pastorsInPeriod: [],
  specialMusic: [],
  serviceCount: 0
};

const emptyReportFilters: ReportFilters = {
  memberSearch: "",
  ministry: "",
  neighborhood: "",
  visitorSearch: "",
  visitorLocation: "",
  pastorSearch: "",
  pastorDistrict: "",
  musicSearch: "",
  musicChurch: ""
};

const serviceTypeFilterOptions: { value: ServiceTypeFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "quarta", label: "Quarta" },
  { value: "sabado", label: "Sábado" },
  { value: "especial", label: "Especial" }
];

const audienceFilterOptions: { value: AudienceFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "membros", label: "Só membros" },
  { value: "visitantes", label: "Só visitantes" },
  { value: "pastores", label: "Só pastores" },
  { value: "musica", label: "Música Especial" }
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

function matchesPastorFilters(pastor: PastorFrequency, filters: ReportFilters) {
  const pastorSearch = normalizeFilterValue(filters.pastorSearch.trim());
  const pastorDistrict = normalizeFilterValue(filters.pastorDistrict.trim());
  const pastorText = normalizeFilterValue(
    [pastor.full_name, pastor.phone, pastor.district].filter(Boolean).join(" ")
  );

  return (
    (!pastorSearch || pastorText.includes(pastorSearch)) &&
    (!pastorDistrict || normalizeFilterValue(pastor.district ?? "").includes(pastorDistrict))
  );
}

function matchesSpecialMusicFilters(music: SpecialMusicReport, filters: ReportFilters) {
  const musicSearch = normalizeFilterValue(filters.musicSearch.trim());
  const musicChurch = normalizeFilterValue(filters.musicChurch.trim());
  const musicText = normalizeFilterValue(
    [music.performer_name, music.contact, music.church, music.visit_date]
      .filter(Boolean)
      .join(" ")
  );

  return (
    (!musicSearch || musicText.includes(musicSearch)) &&
    (!musicChurch || normalizeFilterValue(music.church ?? "").includes(musicChurch))
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
  const { profile, session } = useAuth();
  const [reports, setReports] = useState<Reports>(emptyReports);
  const [filters, setFilters] = useState<ReportFilters>(emptyReportFilters);
  const [reportStartDate, setReportStartDate] = useState(dateInputDaysAgo(30));
  const [reportEndDate, setReportEndDate] = useState(todayInputValue());
  const [reportServiceType, setReportServiceType] = useState<ServiceTypeFilter>("todos");
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>("todos");
  const [periodMessage, setPeriodMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [exportLogs, setExportLogs] = useState<ExportAuditLog[]>([]);
  const [exportUserNames, setExportUserNames] = useState<Record<string, string>>({});

  const loadExportLogs = useCallback(async () => {
    const { data } = await supabase
      .from("export_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    const logs = (data ?? []) as ExportAuditLog[];
    setExportLogs(logs);

    const userIds = [...new Set(logs.map((log) => log.user_id).filter((id): id is string => Boolean(id)))];
    if (userIds.length === 0) {
      setExportUserNames({});
      return;
    }
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    setExportUserNames(
      Object.fromEntries(
        ((profilesData ?? []) as Pick<Profile, "id" | "full_name">[]).map((item) => [
          item.id,
          item.full_name || "Usuário sem nome"
        ])
      )
    );
  }, []);

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
      ),
      pastorsInPeriod: reports.pastorsInPeriod.filter((pastor) =>
        matchesPastorFilters(pastor, filters)
      ),
      specialMusic: reports.specialMusic.filter((music) =>
        matchesSpecialMusicFilters(music, filters)
      )
    }),
    [filters, reports]
  );

  const showMemberReports = audienceFilter === "todos" || audienceFilter === "membros";
  const showVisitorReports = audienceFilter === "todos" || audienceFilter === "visitantes";
  const showPastorReports = audienceFilter === "todos" || audienceFilter === "pastores";
  const showSpecialMusicReports = audienceFilter === "todos" || audienceFilter === "musica";
  const audienceLabel =
    audienceFilter === "membros"
      ? "Membros"
      : audienceFilter === "visitantes"
        ? "Visitantes"
        : audienceFilter === "pastores"
          ? "Pastores"
          : audienceFilter === "musica"
            ? "Música Especial"
            : "Todos";

  const hasActiveMemberFilters = useMemo(
    () =>
      [filters.memberSearch, filters.ministry, filters.neighborhood].some(
        (value) => value.trim().length > 0
      ),
    [filters.memberSearch, filters.ministry, filters.neighborhood]
  );

  const hasActiveVisitorFilters = useMemo(
    () =>
      [filters.visitorSearch, filters.visitorLocation].some(
        (value) => value.trim().length > 0
      ),
    [filters.visitorLocation, filters.visitorSearch]
  );

  const hasActivePastorFilters = useMemo(
    () =>
      [filters.pastorSearch, filters.pastorDistrict].some(
        (value) => value.trim().length > 0
      ),
    [filters.pastorDistrict, filters.pastorSearch]
  );

  const hasActiveMusicFilters = useMemo(
    () =>
      [filters.musicSearch, filters.musicChurch].some(
        (value) => value.trim().length > 0
      ),
    [filters.musicChurch, filters.musicSearch]
  );

  const hasActiveFilters = useMemo(
    () =>
      (showMemberReports && hasActiveMemberFilters) ||
      (showVisitorReports && hasActiveVisitorFilters) ||
      (showPastorReports && hasActivePastorFilters) ||
      (showSpecialMusicReports && hasActiveMusicFilters),
    [
      hasActiveMemberFilters,
      hasActiveMusicFilters,
      hasActivePastorFilters,
      hasActiveVisitorFilters,
      showMemberReports,
      showPastorReports,
      showSpecialMusicReports,
      showVisitorReports
    ]
  );

  const periodText = useMemo(() => {
    if (!reportStartDate || !reportEndDate) return "Período não informado";
    return `${formatDateBR(reportStartDate)} até ${formatDateBR(reportEndDate)}`;
  }, [reportEndDate, reportStartDate]);

  function updateFilter(key: keyof ReportFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const reportHint =
    audienceFilter === "membros"
      ? "Faltas de membros consideram apenas cultos de sábado."
      : audienceFilter === "visitantes"
        ? "O tipo de culto filtra a recorrência de visitantes no período."
        : audienceFilter === "pastores"
          ? "Pastores usam as presenças marcadas no período."
          : audienceFilter === "musica"
            ? "Música Especial usa a data em que o cantor, cantora ou grupo esteve na igreja."
            : "Faltas de membros consideram apenas sábados. Visitantes e pastores usam as presenças. Música Especial usa a data da participação.";

  async function handleDownloadPdf() {
    const memberLine = (member: ReportMember) =>
      `${member.full_name} | ${member.phone || "Sem telefone"} | ${
        member.ministry || "Sem ministério"
      } | ${member.neighborhood || "Sem bairro"}`;

    const visitorLine = (visitor: VisitorFrequency) =>
      `${visitor.full_name} | ${visitor.phone || "Sem telefone"} | ${
        visitor.location || "Sem cidade/bairro"
      } | ${visitor.total} presenças`;
    const pastorLine = (pastor: PastorFrequency) =>
      `${pastor.full_name} | ${pastor.phone || "Sem telefone"} | ${
        pastor.district || "Sem distrito"
      } | ${pastor.total} presenças | ${pastor.visits
        .map((visit) => `${SERVICE_LABELS[visit.service_type]} ${formatDateBR(visit.service_date)}`)
        .join(", ")}`;
    const musicLine = (music: SpecialMusicReport) =>
      `${formatDateBR(music.visit_date)} | ${music.performer_name} | ${
        music.contact || "Sem contato"
      } | ${music.church || "Sem igreja"}`;

    const sections = [
      ...(showMemberReports
        ? [
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
            }
          ]
        : []),
      ...(showVisitorReports
        ? [
            {
              title: `Visitantes que vieram mais de uma vez (${filteredReports.visitorsMoreThanOnce.length})`,
              lines: filteredReports.visitorsMoreThanOnce.map(visitorLine)
            },
            {
              title: `Visitantes que vieram 3 vezes ou mais (${filteredReports.visitorsThreeOrMore.length})`,
              lines: filteredReports.visitorsThreeOrMore.map(visitorLine)
            }
          ]
        : []),
      ...(showPastorReports
        ? [
            {
              title: `Pastores no período (${filteredReports.pastorsInPeriod.length})`,
              lines: filteredReports.pastorsInPeriod.map(pastorLine)
            }
          ]
        : []),
      ...(showSpecialMusicReports
        ? [
            {
              title: `Música Especial no período (${filteredReports.specialMusic.length})`,
              lines: filteredReports.specialMusic.map(musicLine)
            }
          ]
        : [])
    ];

    const fileName = datedFileName("relatorios-presenca", "pdf");
    const recordCount = sections.reduce((total, section) => total + section.lines.length, 0);
    const authorized = await authorizeDataExport({
      userId: session?.user.id,
      userRole: profile?.role,
      exportType: "relatorio_presenca_completo",
      fileName,
      recordCount,
      filters: {
        inicio: reportStartDate,
        fim: reportEndDate,
        culto: reportServiceType,
        publico: audienceFilter
      }
    });
    if (!authorized) return;

    downloadSimplePdf({
      fileName,
      title: `Relatórios de presença - ${audienceLabel}`,
      subtitle: `${periodText} | Último sábado: ${lastServiceText}`,
      sections
    });
    await loadExportLogs();
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
      .is("archived_at", null)
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

    let pastorAttendanceQuery = supabase
      .from("attendances")
      .select("person_id, service_date, service_type")
      .eq("person_type", "pastor")
      .gte("service_date", reportStartDate)
      .lte("service_date", reportEndDate)
      .order("service_date", { ascending: false })
      .limit(5000);

    if (reportServiceType !== "todos") {
      pastorAttendanceQuery = pastorAttendanceQuery.eq("service_type", reportServiceType);
    }

    const { data: pastorAttendanceData } = await pastorAttendanceQuery;
    const pastorVisits = new Map<string, Pick<Attendance, "service_date" | "service_type">[]>();

    ((pastorAttendanceData ?? []) as Pick<
      Attendance,
      "person_id" | "service_date" | "service_type"
    >[]).forEach((attendance) => {
      const visits = pastorVisits.get(attendance.person_id) ?? [];
      visits.push({
        service_date: attendance.service_date,
        service_type: attendance.service_type
      });
      pastorVisits.set(attendance.person_id, visits);
    });

    const pastorIds = [...pastorVisits.keys()];
    let pastorRows: Pick<Pastor, "id" | "full_name" | "phone" | "district">[] = [];

    if (pastorIds.length > 0) {
      const { data } = await supabase
        .from("pastors")
        .select("id, full_name, phone, district")
        .in("id", pastorIds);

      pastorRows = (data ?? []) as Pick<Pastor, "id" | "full_name" | "phone" | "district">[];
    }

    const pastorsInPeriod = pastorRows
      .map((pastor) => {
        const visits = pastorVisits.get(pastor.id) ?? [];

        return {
          ...pastor,
          total: visits.length,
          visits
        };
      })
      .sort((a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name));

    const { data: specialMusicData } = await supabase
      .from("special_music")
      .select("id, performer_name, contact, church, visit_date")
      .gte("visit_date", reportStartDate)
      .lte("visit_date", reportEndDate)
      .order("visit_date", { ascending: false })
      .order("performer_name", { ascending: true })
      .limit(1000);

    setReports({
      lastService,
      absentLast,
      missedTwo,
      missedThree,
      visitorsMoreThanOnce: visitorsWithFrequency.filter((visitor) => visitor.total > 1),
      visitorsThreeOrMore: visitorsWithFrequency.filter((visitor) => visitor.total >= 3),
      pastorsInPeriod,
      specialMusic: (specialMusicData ?? []) as SpecialMusicReport[],
      serviceCount: services.length
    });
    setIsLoading(false);
  }, [reportEndDate, reportServiceType, reportStartDate]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    loadExportLogs();
  }, [loadExportLogs]);

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
            {audienceLabel}
          </StatusBadge>
        </div>

        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]"
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
          <Field label="Tipo de relatório">
            <select
              className="field-input"
              onChange={(event) => setAudienceFilter(event.target.value as AudienceFilter)}
              value={audienceFilter}
            >
              {audienceFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de culto das presenças">
            <select
              className="field-input"
              disabled={!showVisitorReports && !showPastorReports}
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
          {reportHint}
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
          {showMemberReports ? (
            <>
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
            </>
          ) : null}
          {showVisitorReports ? (
            <>
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
            </>
          ) : null}
          {showPastorReports ? (
            <>
              <Field label="Buscar pastor">
                <input
                  className="field-input"
                  onChange={(event) => updateFilter("pastorSearch", event.target.value)}
                  placeholder="Nome ou telefone"
                  value={filters.pastorSearch}
                />
              </Field>
              <Field label="Distrito do pastor">
                <input
                  className="field-input"
                  onChange={(event) => updateFilter("pastorDistrict", event.target.value)}
                  placeholder="Distrito"
                  value={filters.pastorDistrict}
                />
              </Field>
            </>
          ) : null}
          {showSpecialMusicReports ? (
            <>
              <Field label="Buscar música especial">
                <input
                  className="field-input"
                  onChange={(event) => updateFilter("musicSearch", event.target.value)}
                  placeholder="Cantor, grupo ou contato"
                  value={filters.musicSearch}
                />
              </Field>
              <Field label="Igreja do Cantor/Grupo">
                <input
                  className="field-input"
                  onChange={(event) => updateFilter("musicChurch", event.target.value)}
                  placeholder="Igreja"
                  value={filters.musicChurch}
                />
              </Field>
            </>
          ) : null}
        </div>
      </section>

      {isLoading ? (
        <Notice title="Carregando relatórios..." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {showMemberReports ? (
            <>
              <ReportSection
                count={filteredReports.absentLast.length}
                emptyText="Nenhum membro ausente no último sábado."
                hasActiveFilters={hasActiveMemberFilters}
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
                hasActiveFilters={hasActiveMemberFilters}
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
                hasActiveFilters={hasActiveMemberFilters}
                icon={AlertCircle}
                items={filteredReports.missedThree}
                title="Membros com 3 sábados seguidos"
              />
            </>
          ) : null}
          {showVisitorReports ? (
            <>
              <VisitorSection
                emptyText="Nenhum visitante veio mais de uma vez."
                hasActiveFilters={hasActiveVisitorFilters}
                icon={UserRoundPlus}
                items={filteredReports.visitorsMoreThanOnce}
                title="Visitantes que vieram mais de uma vez"
              />
              <VisitorSection
                emptyText="Nenhum visitante veio 3 vezes ou mais."
                hasActiveFilters={hasActiveVisitorFilters}
                icon={UserCheck}
                items={filteredReports.visitorsThreeOrMore}
                title="Visitantes que vieram 3 vezes ou mais"
              />
            </>
          ) : null}
          {showPastorReports ? (
            <PastorSection
              emptyText="Nenhum pastor encontrado no período."
              hasActiveFilters={hasActivePastorFilters}
              icon={UserCheck}
              items={filteredReports.pastorsInPeriod}
              title="Pastores no período"
            />
          ) : null}
          {showSpecialMusicReports ? (
            <SpecialMusicSection
              emptyText="Nenhuma música especial encontrada no período."
              hasActiveFilters={hasActiveMusicFilters}
              icon={UserCheck}
              items={filteredReports.specialMusic}
              title="Música Especial no período"
            />
          ) : null}
        </div>
      )}

      <section className="mt-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList aria-hidden="true" size={19} />
            <div>
              <h2 className="text-base font-semibold text-ink">Histórico de exportações</h2>
              <p className="text-sm text-muted">Últimos 50 arquivos gerados pelo sistema.</p>
            </div>
          </div>
          <StatusBadge tone="neutral">{exportLogs.length}</StatusBadge>
        </div>

        {exportLogs.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma exportação registrada.</p>
        ) : (
          <div className="space-y-3">
            {exportLogs.map((log) => (
              <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={log.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-ink">{log.file_name}</p>
                    <p className="text-sm text-muted">
                      {(log.user_id && exportUserNames[log.user_id]) || "Usuário removido"} • {log.user_role === "lideranca" ? "Liderança" : "Recepção"} • {log.record_count} registros
                    </p>
                    <p className="mt-1 text-xs text-muted">Finalidade: {log.purpose}</p>
                  </div>
                  <StatusBadge tone="neutral">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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

function PastorSection({
  emptyText,
  hasActiveFilters,
  icon: Icon,
  items,
  title
}: {
  emptyText: string;
  hasActiveFilters?: boolean;
  icon: LucideIcon;
  items: PastorFrequency[];
  title: string;
}) {
  const emptyMessage = hasActiveFilters
    ? "Nenhum pastor encontrado com os filtros atuais."
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
          {items.map((pastor) => (
            <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={pastor.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{pastor.full_name}</p>
                  <p className="text-sm text-muted">
                    {pastor.phone || "Sem telefone"} - {pastor.district || "Sem distrito"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {pastor.visits
                      .slice(0, 3)
                      .map(
                        (visit) =>
                          `${SERVICE_LABELS[visit.service_type]} em ${formatDateBR(visit.service_date)}`
                      )
                      .join(" | ")}
                  </p>
                </div>
                <StatusBadge tone="success">{pastor.total} presenças</StatusBadge>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SpecialMusicSection({
  emptyText,
  hasActiveFilters,
  icon: Icon,
  items,
  title
}: {
  emptyText: string;
  hasActiveFilters?: boolean;
  icon: LucideIcon;
  items: SpecialMusicReport[];
  title: string;
}) {
  const emptyMessage = hasActiveFilters
    ? "Nenhuma música especial encontrada com os filtros atuais."
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
          {items.map((music) => (
            <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={music.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{music.performer_name}</p>
                  <p className="text-sm text-muted">
                    {music.contact || "Sem contato"} - {music.church || "Sem igreja"}
                  </p>
                </div>
                <StatusBadge tone="warning">{formatDateBR(music.visit_date)}</StatusBadge>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
