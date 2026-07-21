"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  History as HistoryIcon,
  HeartHandshake,
  Minus,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Notice, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";
import {
  formatDateBR,
  inferServiceType,
  serviceTitle,
  SERVICE_LABELS,
  todayInputValue
} from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Attendance, FollowUpHistory, Member, RegistryHistory, Service, ServiceType, Visitor } from "@/lib/types";

type Summary = {
  total: number;
  members: number;
  visitors: number;
  pastors: number;
  music: number;
};

type AbsenceAlert = {
  missedTwoMembersCount: number;
  missedTwoVisitorsCount: number;
  pendingFollowUpsCount: number;
  recentServiceCount: number;
  lastServiceText: string;
};

type RecentActivity = {
  id: string;
  href: string;
  title: string;
  performedBy: string;
  performedAt: string;
  tone: "neutral" | "success" | "warning";
};

type MonthlyService = Pick<Service, "id" | "service_date" | "service_type" | "title">;
type MonthlyAttendance = Pick<Attendance, "person_type" | "service_id">;

type MonthSummary = {
  attendanceTotal: number;
  average: number;
  members: number;
  visitors: number;
  serviceCount: number;
  busiestService: { label: string; total: number } | null;
  quietestService: { label: string; total: number } | null;
};

type ComparedServiceType = "quarta" | "sabado";

type ServiceTypeMonthComparison = {
  current: MonthSummary;
  previous: MonthSummary;
  percentageChange: number | null;
};

type MonthComparison = {
  currentLabel: string;
  previousLabel: string;
  byServiceType: Record<ComparedServiceType, ServiceTypeMonthComparison>;
};

const followUpActionLabels: Record<FollowUpHistory["action_type"], string> = {
  mensagem: "Mensagem registrada",
  ligacao: "Ligação registrada",
  visita: "Visita registrada",
  oracao: "Oração registrada",
  agradecimento: "Agradecimento registrado",
  outro: "Contato registrado"
};

function formatActivityDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bahia"
  });
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function summarizeMonth(services: MonthlyService[], attendances: MonthlyAttendance[]): MonthSummary {
  const totalsByService = new Map(services.map((service) => [service.id, 0]));
  attendances.forEach((attendance) => {
    totalsByService.set(attendance.service_id, (totalsByService.get(attendance.service_id) ?? 0) + 1);
  });

  const rankedServices = services
    .map((service) => ({
      label: service.title || `${SERVICE_LABELS[service.service_type]} em ${formatDateBR(service.service_date)}`,
      total: totalsByService.get(service.id) ?? 0,
      date: service.service_date
    }))
    .sort((first, second) => second.total - first.total || second.date.localeCompare(first.date));
  const quietest = [...rankedServices].sort(
    (first, second) => first.total - second.total || second.date.localeCompare(first.date)
  )[0];

  return {
    attendanceTotal: attendances.length,
    average: services.length > 0 ? attendances.length / services.length : 0,
    members: attendances.filter((attendance) => attendance.person_type === "membro").length,
    visitors: attendances.filter((attendance) => attendance.person_type === "visitante").length,
    serviceCount: services.length,
    busiestService: rankedServices[0] ? { label: rankedServices[0].label, total: rankedServices[0].total } : null,
    quietestService: quietest ? { label: quietest.label, total: quietest.total } : null
  };
}

const emptyAbsenceAlert: AbsenceAlert = {
  missedTwoMembersCount: 0,
  missedTwoVisitorsCount: 0,
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
  const { settings } = useSystemSettings();
  const [serviceDate, setServiceDate] = useState(todayInputValue());
  const [serviceType, setServiceType] = useState<ServiceType>(() =>
    inferServiceType(todayInputValue())
  );
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    members: 0,
    visitors: 0,
    pastors: 0,
    music: 0
  });
  const [absenceAlert, setAbsenceAlert] = useState<AbsenceAlert>(emptyAbsenceAlert);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [monthComparison, setMonthComparison] = useState<MonthComparison | null>(null);
  const [isMonthComparisonLoading, setIsMonthComparisonLoading] = useState(false);
  const [monthComparisonMessage, setMonthComparisonMessage] = useState("");
  const [isActivitiesLoading, setIsActivitiesLoading] = useState(false);
  const [activitiesMessage, setActivitiesMessage] = useState("");
  const [checkInMessage, setCheckInMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAlertLoading, setIsAlertLoading] = useState(false);
  const [isStartingCheckIn, setIsStartingCheckIn] = useState(false);

  const roleLabel = profile?.is_admin
    ? "Administrador"
    : profile?.role === "lideranca"
      ? "Liderança"
      : "Recepção";
  const canViewLeadershipContent = profile?.role === "lideranca" || Boolean(profile?.is_admin);
  const currentMonthLabel = monthLabel(new Date());

  const loadSummary = useCallback(async () => {
    setIsLoading(true);

    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("id")
      .eq("service_date", serviceDate)
      .eq("service_type", serviceType)
      .maybeSingle();

    if (serviceError || !service) {
      setSummary({ total: 0, members: 0, visitors: 0, pastors: 0, music: 0 });
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("attendances")
      .select("person_type")
      .eq("service_id", service.id);

    if (error) {
      setSummary({ total: 0, members: 0, visitors: 0, pastors: 0, music: 0 });
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as Pick<Attendance, "person_type">[];
    setSummary({
      total: rows.length,
      members: rows.filter((row) => row.person_type === "membro").length,
      visitors: rows.filter((row) => row.person_type === "visitante").length,
      pastors: rows.filter((row) => row.person_type === "pastor").length,
      music: rows.filter((row) => row.person_type === "musica").length
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
      .eq("service_type", "sabado")
      .lte("service_date", todayInputValue())
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.max(settings.member_absence_threshold, settings.visitor_absence_threshold));

    if (servicesError) {
      setAbsenceAlert(emptyAbsenceAlert);
      setIsAlertLoading(false);
      return;
    }

    const recentServices = (servicesData ?? []) as Pick<
      Service,
      "id" | "service_date" | "service_type" | "created_at"
    >[];

    const requiredServiceCount = Math.max(
      settings.member_absence_threshold,
      settings.visitor_absence_threshold
    );

    if (recentServices.length < requiredServiceCount) {
      const latestService = recentServices[0];
      setAbsenceAlert({
        missedTwoMembersCount: 0,
        missedTwoVisitorsCount: 0,
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
      .eq("status", "ativo")
      .is("archived_at", null);

    if (membersError) {
      setAbsenceAlert(emptyAbsenceAlert);
      setIsAlertLoading(false);
      return;
    }

    const activeMemberIds = ((membersData ?? []) as Pick<Member, "id">[]).map(
      (member) => member.id
    );

    const memberServices = recentServices.slice(0, settings.member_absence_threshold);
    const visitorServices = recentServices.slice(0, settings.visitor_absence_threshold);
    const serviceIds = recentServices.map((service) => service.id);
    const { data: attendancesData, error: attendancesError } = await supabase
      .from("attendances")
      .select("person_id, service_id, person_type")
      .in("person_type", ["membro", "visitante"])
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
      const key = `${attendance.person_type}:${attendance.service_id}`;
      const currentSet = presentByService.get(key) ?? new Set<string>();
      currentSet.add(attendance.person_id);
      presentByService.set(key, currentSet);
    });

    const missedTwoMemberIds = activeMemberIds.filter((memberId) =>
      memberServices.every((service) => !presentByService.get(`membro:${service.id}`)?.has(memberId))
    );

    const { data: visitorHistoryData } = await supabase
      .from("attendances")
      .select("person_id")
      .eq("person_type", "visitante")
      .eq("service_type", "sabado")
      .lte("service_date", todayInputValue())
      .limit(5000);

    const visitorIdsWithSaturdayHistory = [
      ...new Set(
        ((visitorHistoryData ?? []) as Pick<Attendance, "person_id">[]).map(
          (attendance) => attendance.person_id
        )
      )
    ];

    const { data: activeVisitorsData } = visitorIdsWithSaturdayHistory.length > 0
      ? await supabase.from("visitors").select("id").in("id", visitorIdsWithSaturdayHistory).is("archived_at", null)
      : { data: [] };
    const activeVisitorIds = new Set(((activeVisitorsData ?? []) as Pick<Visitor, "id">[]).map((visitor) => visitor.id));

    const missedTwoVisitorIds =
      visitorServices.length < settings.visitor_absence_threshold
        ? []
        : visitorIdsWithSaturdayHistory.filter((visitorId) =>
            activeVisitorIds.has(visitorId) &&
            visitorServices.every(
              (service) => !presentByService.get(`visitante:${service.id}`)?.has(visitorId)
            )
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

    if (missedTwoVisitorIds.length > 0) {
      const { data: followUpsData } = await supabase
        .from("visitor_followups")
        .select("visitor_id, status")
        .eq("last_service_id", recentServices[0].id)
        .in("status", ["acompanhado", "removido"])
        .in("visitor_id", missedTwoVisitorIds);

      accompaniedCount += (followUpsData ?? []).length;
    }

    const missedTwoTotal = missedTwoMemberIds.length + missedTwoVisitorIds.length;

    setAbsenceAlert({
      missedTwoMembersCount: missedTwoMemberIds.length,
      missedTwoVisitorsCount: missedTwoVisitorIds.length,
      pendingFollowUpsCount: Math.max(missedTwoTotal - accompaniedCount, 0),
      recentServiceCount: recentServices.length,
      lastServiceText: `${SERVICE_LABELS[recentServices[0].service_type]} em ${formatDateBR(
        recentServices[0].service_date
      )}`
    });
    setIsAlertLoading(false);
  }, [profile?.role, settings.member_absence_threshold, settings.visitor_absence_threshold]);

  const loadRecentActivities = useCallback(async () => {
    if (!canViewLeadershipContent) {
      setRecentActivities([]);
      return;
    }

    setIsActivitiesLoading(true);
    setActivitiesMessage("");

    const [registryResponse, followUpResponse] = await Promise.all([
      supabase
        .from("registry_history")
        .select("id, person_id, person_type, action, performed_by, performed_by_name, performed_at")
        .order("performed_at", { ascending: false })
        .limit(12),
      supabase
        .from("followup_history")
        .select("id, person_id, person_type, action_type, performed_by_name, performed_at")
        .order("performed_at", { ascending: false })
        .limit(12)
    ]);

    const registryRows = (registryResponse.data ?? []) as RegistryHistory[];
    const followUpRows = (followUpResponse.data ?? []) as Pick<
      FollowUpHistory,
      "id" | "person_id" | "person_type" | "action_type" | "performed_by_name" | "performed_at"
    >[];

    if (registryResponse.error || followUpResponse.error) {
      setActivitiesMessage("Não foi possível carregar todo o histórico recente.");
    }

    const allRows = [...registryRows, ...followUpRows];
    const idsFor = (personType: RegistryHistory["person_type"]) => [
      ...new Set(allRows.filter((row) => row.person_type === personType).map((row) => row.person_id))
    ];
    const memberIds = idsFor("membro");
    const visitorIds = idsFor("visitante");
    const pastorIds = idsFor("pastor");
    const musicIds = idsFor("musica");

    const [membersResponse, visitorsResponse, pastorsResponse, musicResponse] = await Promise.all([
      memberIds.length > 0
        ? supabase.from("members").select("id, full_name").in("id", memberIds)
        : Promise.resolve({ data: [], error: null }),
      visitorIds.length > 0
        ? supabase.from("visitors").select("id, full_name").in("id", visitorIds)
        : Promise.resolve({ data: [], error: null }),
      pastorIds.length > 0
        ? supabase.from("pastors").select("id, full_name").in("id", pastorIds)
        : Promise.resolve({ data: [], error: null }),
      musicIds.length > 0
        ? supabase.from("special_music").select("id, performer_name").in("id", musicIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const personNames = new Map<string, string>();
    (membersResponse.data ?? []).forEach((person) => personNames.set(`membro:${person.id}`, person.full_name));
    (visitorsResponse.data ?? []).forEach((person) => personNames.set(`visitante:${person.id}`, person.full_name));
    (pastorsResponse.data ?? []).forEach((person) => personNames.set(`pastor:${person.id}`, person.full_name));
    (musicResponse.data ?? []).forEach((person) => personNames.set(`musica:${person.id}`, person.performer_name));

    const registryActivities: RecentActivity[] = registryRows.map((entry) => ({
      id: `registry:${entry.id}`,
      href: `/pessoas/${entry.person_type}/${entry.person_id}`,
      title: `${entry.action === "cadastrado" ? "Cadastro realizado" : entry.action === "arquivado" ? "Cadastro arquivado" : "Cadastro restaurado"}: ${personNames.get(`${entry.person_type}:${entry.person_id}`) ?? "Cadastro removido"}`,
      performedBy: entry.performed_by_name,
      performedAt: entry.performed_at,
      tone: entry.action === "arquivado" ? "warning" : entry.action === "restaurado" ? "success" : "neutral"
    }));
    const followUpActivities: RecentActivity[] = followUpRows.map((entry) => ({
      id: `followup:${entry.id}`,
      href: `/pessoas/${entry.person_type}/${entry.person_id}`,
      title: `${followUpActionLabels[entry.action_type]}: ${personNames.get(`${entry.person_type}:${entry.person_id}`) ?? "Cadastro removido"}`,
      performedBy: entry.performed_by_name,
      performedAt: entry.performed_at,
      tone: "success"
    }));

    setRecentActivities(
      [...registryActivities, ...followUpActivities]
        .sort((first, second) => new Date(second.performedAt).getTime() - new Date(first.performedAt).getTime())
        .slice(0, 10)
    );
    setIsActivitiesLoading(false);
  }, [canViewLeadershipContent]);

  const loadMonthComparison = useCallback(async () => {
    if (!canViewLeadershipContent) {
      setMonthComparison(null);
      return;
    }

    setIsMonthComparisonLoading(true);
    setMonthComparisonMessage("");

    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = now;
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const { data: servicesData, error: servicesError } = await supabase
      .from("services")
      .select("id, service_date, service_type, title")
      .gte("service_date", dateInputValue(previousStart))
      .lte("service_date", dateInputValue(currentEnd))
      .order("service_date", { ascending: true })
      .limit(500);

    if (servicesError) {
      setMonthComparison(null);
      setMonthComparisonMessage("Não foi possível carregar o comparativo mensal.");
      setIsMonthComparisonLoading(false);
      return;
    }

    const services = (servicesData ?? []) as MonthlyService[];
    const serviceIds = services.map((service) => service.id);
    const { data: attendancesData, error: attendancesError } = serviceIds.length > 0
      ? await supabase
          .from("attendances")
          .select("person_type, service_id")
          .in("service_id", serviceIds)
          .limit(10000)
      : { data: [], error: null };

    if (attendancesError) {
      setMonthComparison(null);
      setMonthComparisonMessage("Os cultos foram encontrados, mas não foi possível carregar as presenças.");
      setIsMonthComparisonLoading(false);
      return;
    }

    const attendances = (attendancesData ?? []) as MonthlyAttendance[];
    const currentServices = services.filter(
      (service) => service.service_date >= dateInputValue(currentStart) && service.service_date <= dateInputValue(currentEnd)
    );
    const previousServices = services.filter(
      (service) => service.service_date >= dateInputValue(previousStart) && service.service_date <= dateInputValue(previousEnd)
    );
    const compareType = (serviceType: ComparedServiceType): ServiceTypeMonthComparison => {
      const currentTypeServices = currentServices.filter((service) => service.service_type === serviceType);
      const previousTypeServices = previousServices.filter((service) => service.service_type === serviceType);
      const currentServiceIds = new Set(currentTypeServices.map((service) => service.id));
      const previousServiceIds = new Set(previousTypeServices.map((service) => service.id));
      const currentSummary = summarizeMonth(
        currentTypeServices,
        attendances.filter((attendance) => currentServiceIds.has(attendance.service_id))
      );
      const previousSummary = summarizeMonth(
        previousTypeServices,
        attendances.filter((attendance) => previousServiceIds.has(attendance.service_id))
      );

      return {
        current: currentSummary,
        previous: previousSummary,
        percentageChange: previousSummary.average > 0
          ? Math.round(((currentSummary.average - previousSummary.average) / previousSummary.average) * 100)
          : null
      };
    };

    setMonthComparison({
      currentLabel: monthLabel(currentStart),
      previousLabel: monthLabel(previousStart),
      byServiceType: {
        quarta: compareType("quarta"),
        sabado: compareType("sabado")
      }
    });
    setIsMonthComparisonLoading(false);
  }, [canViewLeadershipContent]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadAbsenceAlert();
  }, [loadAbsenceAlert]);

  useEffect(() => {
    void loadRecentActivities();
  }, [loadRecentActivities]);

  useEffect(() => {
    void loadMonthComparison();
  }, [loadMonthComparison]);

  async function handleStartCheckIn() {
    setCheckInMessage("");

    if (!serviceDate) {
      setCheckInMessage("Informe a data do culto para iniciar o check-in.");
      return;
    }

    if (profile?.role === "recepcao" && serviceDate !== todayInputValue()) {
      setCheckInMessage("A Recepção pode iniciar somente o culto de hoje.");
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

  const actions = useMemo(() => {
    const receptionActions = [
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
        href: "/cadastros",
        label: "Cadastros",
        icon: UserPlus,
        tone: "bg-white text-ink hover:border-forest hover:text-forest"
      }
    ];

    return canViewLeadershipContent
      ? [
          ...receptionActions,
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
        ]
      : receptionActions;
  }, [canViewLeadershipContent]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-forestDark via-forest to-wine p-6 text-white shadow-[0_20px_50px_rgba(87,0,36,0.2)] sm:p-8 lg:p-10">
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-20 left-1/3 h-52 w-52 rounded-full bg-gold/20 blur-3xl"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
              <Sparkles aria-hidden="true" size={16} />
              {currentMonthLabel}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Resumo da igreja
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
              Acompanhe as presenças, os cultos e os cuidados com as pessoas em um só lugar.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
            <ShieldCheck aria-hidden="true" size={17} />
            Ambiente protegido • {roleLabel}
          </span>
        </div>
      </section>

      <section
        className="scroll-mt-24 rounded-[24px] border border-line bg-white p-5 shadow-soft sm:p-6"
        id="culto-atual"
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest/10 text-forest">
              <CalendarDays aria-hidden="true" size={21} />
            </span>
            <div>
              <h2 className="font-semibold text-ink">Culto atual</h2>
              <p className="text-sm text-muted">Selecione o culto para abrir a marcação de presença.</p>
            </div>
          </div>
          <StatusBadge tone="success">
            {SERVICE_LABELS[serviceType]} • {formatDateBR(serviceDate)}
          </StatusBadge>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_220px] lg:grid-cols-[1fr_240px_auto] lg:items-end">
          <label>
            <span className="field-label">Data</span>
            <input
              className="field-input"
              disabled={profile?.role === "recepcao"}
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
            className="primary-button w-full lg:min-w-56"
            disabled={isStartingCheckIn}
            onClick={handleStartCheckIn}
            type="button"
          >
            <Search aria-hidden="true" size={18} />
            {isStartingCheckIn ? "Abrindo..." : "Iniciar culto / check-in"}
          </button>
        </div>
        {checkInMessage ? (
          <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-ink">
            {checkInMessage}
          </p>
        ) : null}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-ink">Presença no culto selecionado</h2>
          <p className="mt-1 text-sm text-muted">Resumo atualizado conforme a data e o tipo de culto.</p>
        </div>
        {isLoading ? (
          <Notice title="Carregando resumo..." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <DashboardMetric icon={CalendarCheck} label="Total de presentes" value={summary.total} />
            <DashboardMetric icon={UsersRound} label="Membros presentes" tone="gold" value={summary.members} />
            <DashboardMetric icon={UserPlus} label="Visitantes presentes" tone="wine" value={summary.visitors} />
            <DashboardMetric icon={HeartHandshake} label="Pastores presentes" value={summary.pastors} />
            <DashboardMetric icon={BarChart3} label="Música Especial" tone="gold" value={summary.music} />
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-ink">Acessos rápidos</h2>
          <p className="mt-1 text-sm text-muted">Atalhos para as tarefas mais usadas no dia a dia.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                className={`group flex min-h-24 flex-col justify-between gap-4 rounded-2xl border border-line p-4 text-sm font-semibold shadow-soft transition ${action.tone}`}
                href={action.href}
                key={action.href}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-current/10">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <ArrowRight aria-hidden="true" className="transition group-hover:translate-x-1" size={18} />
                </div>
                <span>{action.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {canViewLeadershipContent ? (
        <section
          className={`rounded-[24px] border p-5 shadow-soft sm:p-6 ${
            absenceAlert.missedTwoMembersCount + absenceAlert.missedTwoVisitorsCount > 0
              ? "border-wine/30 bg-wine/5"
              : "border-line bg-white"
          }`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  absenceAlert.missedTwoMembersCount + absenceAlert.missedTwoVisitorsCount > 0
                    ? "bg-wine/10 text-wine"
                    : "bg-forest/10 text-forest"
                }`}
              >
                <AlertCircle aria-hidden="true" size={21} />
              </span>
              <div>
                <p className="font-semibold text-ink">Alerta de faltas seguidas</p>
                {isAlertLoading ? (
                  <p className="mt-1 text-sm text-muted">Verificando os últimos sábados...</p>
                ) : absenceAlert.recentServiceCount < Math.max(
                    settings.member_absence_threshold,
                    settings.visitor_absence_threshold
                  ) ? (
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Cadastre pelo menos {Math.max(settings.member_absence_threshold, settings.visitor_absence_threshold)} cultos de sábado para o sistema calcular todos os alertas.
                  </p>
                ) : (
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {absenceAlert.missedTwoMembersCount} membros ativos estão há {settings.member_absence_threshold} sábados sem aparecer;{" "}
                    {absenceAlert.missedTwoVisitorsCount} visitantes estão há {settings.visitor_absence_threshold} sábados sem aparecer. {absenceAlert.pendingFollowUpsCount} pendentes de acompanhamento.
                    {absenceAlert.lastServiceText ? ` Último sábado: ${absenceAlert.lastServiceText}.` : ""}
                  </p>
                )}
              </div>
            </div>
            <Link className="secondary-button w-full shrink-0 sm:w-auto" href="/acompanhamento">
              Abrir acompanhamento
              <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </div>
        </section>
      ) : null}

      {canViewLeadershipContent ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
          <section className="rounded-[24px] border border-line bg-white p-5 shadow-soft sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-wine/10 text-wine">
                <BarChart3 aria-hidden="true" size={21} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-ink">Comparativo mensal</h2>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Sábados são comparados com sábados; quartas, com quartas.
                </p>
              </div>
            </div>

            {monthComparisonMessage ? <p className="mt-4 text-sm text-wine">{monthComparisonMessage}</p> : null}
            {isMonthComparisonLoading ? <p className="mt-4 text-sm text-muted">Calculando os dois últimos meses...</p> : null}
            {!isMonthComparisonLoading && monthComparison ? (
              <div className="mt-5 space-y-4">
                <ServiceTypeComparisonPanel
                  comparison={monthComparison.byServiceType.sabado}
                  currentLabel={monthComparison.currentLabel}
                  label="Cultos de sábado"
                  previousLabel={monthComparison.previousLabel}
                />
                <ServiceTypeComparisonPanel
                  comparison={monthComparison.byServiceType.quarta}
                  currentLabel={monthComparison.currentLabel}
                  label="Cultos de quarta-feira"
                  previousLabel={monthComparison.previousLabel}
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-line bg-white p-5 shadow-soft sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-wine/10 text-wine">
                <HistoryIcon aria-hidden="true" size={21} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-ink">Atividades recentes</h2>
                <p className="mt-1 text-sm text-muted">Últimas movimentações da liderança.</p>
              </div>
            </div>
            {activitiesMessage ? <p className="mb-3 text-sm text-wine">{activitiesMessage}</p> : null}
            {isActivitiesLoading ? (
              <p className="text-sm text-muted">Carregando atividades...</p>
            ) : recentActivities.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma atividade registrada até o momento.</p>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <Link
                    className="block rounded-2xl border border-line bg-paper/70 p-4 transition hover:border-wine/30 hover:bg-wine/5"
                    href={activity.href}
                    key={activity.id}
                  >
                    <div className="flex flex-col gap-2">
                      <p className="font-semibold leading-6 text-ink">{activity.title}</p>
                      <StatusBadge tone={activity.tone}>{formatActivityDate(activity.performedAt)}</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-muted">Responsável: {activity.performedBy}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function DashboardMetric({
  icon: Icon,
  label,
  tone = "forest",
  value
}: {
  icon: LucideIcon;
  label: string;
  tone?: "forest" | "wine" | "gold";
  value: number | string;
}) {
  const toneClasses = {
    forest: "bg-forest/10 text-forest",
    wine: "bg-wine/10 text-wine",
    gold: "bg-gold/20 text-ink"
  }[tone];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium leading-5 text-muted">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{value}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneClasses}`}>
          <Icon aria-hidden="true" size={21} />
        </span>
      </div>
    </div>
  );
}

function ServiceTypeComparisonPanel({
  comparison,
  currentLabel,
  label,
  previousLabel
}: {
  comparison: ServiceTypeMonthComparison;
  currentLabel: string;
  label: string;
  previousLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-paper/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold text-ink">{label}</h3>
        {comparison.percentageChange !== null ? (
          <StatusBadge tone={comparison.percentageChange >= 0 ? "success" : "warning"}>
            {comparison.percentageChange > 0 ? <TrendingUp aria-hidden="true" className="mr-1" size={14} /> : null}
            {comparison.percentageChange < 0 ? <TrendingDown aria-hidden="true" className="mr-1" size={14} /> : null}
            {comparison.percentageChange === 0 ? <Minus aria-hidden="true" className="mr-1" size={14} /> : null}
            {comparison.percentageChange > 0 ? "+" : ""}{comparison.percentageChange}% na média
          </StatusBadge>
        ) : null}
      </div>

      {comparison.current.serviceCount === 0 ? (
        <p className="mt-3 text-sm text-muted">Nenhum culto desta categoria foi realizado em {currentLabel}.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MonthlyMetric label="Média por culto" value={comparison.current.average.toFixed(1).replace(".", ",")} />
            <MonthlyMetric label="Total de presenças" value={comparison.current.attendanceTotal} />
            <MonthlyMetric label="Presenças de membros" value={comparison.current.members} />
            <MonthlyMetric label="Presenças de visitantes" value={comparison.current.visitors} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-line bg-white p-3">
              <p className="text-xs font-semibold uppercase text-muted">Período atual</p>
              <p className="mt-2 font-semibold text-ink">{currentLabel}</p>
              <p className="mt-1 text-sm text-muted">{comparison.current.serviceCount} culto(s) registrado(s).</p>
            </div>
            <div className="rounded-xl border border-line bg-white p-3">
              <p className="text-xs font-semibold uppercase text-muted">Maior presença</p>
              <p className="mt-2 font-semibold text-ink">{comparison.current.busiestService?.label}</p>
              <p className="mt-1 text-sm text-muted">{comparison.current.busiestService?.total ?? 0} pessoas.</p>
            </div>
            <div className="rounded-xl border border-line bg-white p-3">
              <p className="text-xs font-semibold uppercase text-muted">Menor presença</p>
              <p className="mt-2 font-semibold text-ink">{comparison.current.quietestService?.label}</p>
              <p className="mt-1 text-sm text-muted">{comparison.current.quietestService?.total ?? 0} pessoas.</p>
            </div>
          </div>
        </>
      )}

      <p className="mt-3 text-sm text-muted">
        {comparison.previous.serviceCount > 0
          ? `${previousLabel}: média de ${comparison.previous.average.toFixed(1).replace(".", ",")} pessoas em ${comparison.previous.serviceCount} culto(s) desta categoria.`
          : `Não há cultos desta categoria em ${previousLabel} para comparação.`}
      </p>
    </div>
  );
}

function MonthlyMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
