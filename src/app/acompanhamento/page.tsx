"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  HeartHandshake,
  History as HistoryIcon,
  MessageCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundPlus,
  UsersRound
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { MetricCard, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";
import { formatDateBR, SERVICE_LABELS, todayInputValue } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import { getThankYouWhatsAppUrl } from "@/lib/whatsapp";
import type {
  Attendance,
  FollowUpActionType,
  FollowUpHistory,
  FollowUpOutcome,
  FollowUpStatus,
  Member,
  MemberFollowUp,
  Pastor,
  PersonType,
  Service,
  SpecialMusic,
  Visitor,
  VisitorFollowUp
} from "@/lib/types";

type FollowMember = Pick<Member, "id" | "full_name" | "phone" | "neighborhood" | "ministry">;
type FollowVisitor = Pick<Visitor, "id" | "full_name" | "phone" | "location">;
type ReceptionGuest = {
  attendanceId: string;
  serviceId: string;
  personId: string;
  kind: "visitante" | "pastor" | "musica";
  fullName: string;
  contact: string | null;
  detail: string | null;
  kindLabel: string;
  followedUpBy: string | null;
  followedUpAt: string | null;
};
type ServiceSummary = Pick<Service, "id" | "service_date" | "service_type" | "title">;
type AttendanceSummary = Pick<
  Attendance,
  "person_id" | "person_type" | "service_id" | "service_date" | "service_type"
>;
type MemberFollowUpRow = Pick<
  MemberFollowUp,
  | "id"
  | "member_id"
  | "last_service_id"
  | "last_service_date"
  | "absence_streak"
  | "status"
  | "notes"
  | "contacted_by"
  | "contacted_at"
>;
type VisitorFollowUpRow = Pick<
  VisitorFollowUp,
  | "id"
  | "visitor_id"
  | "last_service_id"
  | "last_service_date"
  | "absence_streak"
  | "status"
  | "notes"
  | "contacted_by"
  | "contacted_at"
>;
type FollowUpRow = {
  id: string;
  person_id: string;
  last_service_id: string;
  last_service_date: string;
  absence_streak: number;
  status: FollowUpStatus;
  notes: string | null;
  contacted_by: string | null;
  contacted_at: string | null;
};

type FollowUpItem = {
  kind: PersonType;
  id: string;
  full_name: string;
  phone: string | null;
  neighborhood?: string | null;
  ministry?: string | null;
  location?: string | null;
  absenceStreak: number;
  lastAttendance: Pick<Attendance, "service_date" | "service_type"> | null;
  lastService: ServiceSummary;
  followUp: FollowUpRow | null;
};

type FilterMode = "pendentes" | "todos" | "acompanhados" | "criticos" | "membros" | "visitantes";
type GuestFilterMode = "todos" | "pendentes" | "concluidos" | "visitantes" | "pastores" | "musicas";

const followUpActionOptions: { label: string; value: FollowUpActionType }[] = [
  { label: "Mensagem", value: "mensagem" },
  { label: "Ligação", value: "ligacao" },
  { label: "Visita", value: "visita" },
  { label: "Oração", value: "oracao" },
  { label: "Outro", value: "outro" }
];

const followUpActionLabels: Record<FollowUpActionType, string> = {
  mensagem: "Mensagem",
  ligacao: "Ligação",
  visita: "Visita",
  oracao: "Oração",
  agradecimento: "Agradecimento",
  outro: "Outro"
};

const filterOptions: { label: string; value: FilterMode }[] = [
  { label: "Pendentes", value: "pendentes" },
  { label: "Todos", value: "todos" },
  { label: "Acompanhados", value: "acompanhados" },
  { label: "Membros", value: "membros" },
  { label: "Visitantes", value: "visitantes" },
  { label: "Alertas de ausência", value: "criticos" }
];

const guestFilterOptions: { label: string; value: GuestFilterMode }[] = [
  { label: "Todos", value: "todos" },
  { label: "Pendentes", value: "pendentes" },
  { label: "Concluídos", value: "concluidos" },
  { label: "Visitantes", value: "visitantes" },
  { label: "Pastores/Pregadores", value: "pastores" },
  { label: "Música Especial", value: "musicas" }
];

function normalizeSearch(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function getWhatsAppUrl(phone: string | null, fullName: string) {
  if (!phone) return null;

  const digits = onlyDigits(phone);
  if (!digits) return null;

  const normalizedPhone = digits.startsWith("55") ? digits : `55${digits}`;
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;
  const message = encodeURIComponent(
    `Olá, ${firstName}! Sentimos sua falta nos últimos sábados e queremos saber como você está. Podemos orar por você?`
  );

  return `https://wa.me/${normalizedPhone}?text=${message}`;
}

function lastAttendanceText(attendance: FollowUpItem["lastAttendance"]) {
  if (!attendance) return "Nenhuma presença anterior";
  return `${SERVICE_LABELS[attendance.service_type]} em ${formatDateBR(attendance.service_date)}`;
}

function formatActionDate(value: string | null) {
  if (!value) return "data não informada";
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bahia"
  });
}

function itemKey(item: Pick<FollowUpItem, "id" | "kind">) {
  return `${item.kind}:${item.id}`;
}

function attendanceHistoryKey(attendanceId: string) {
  return `attendance:${attendanceId}`;
}

function FollowUpHistoryList({
  actorNames,
  entries
}: {
  actorNames: Record<string, string>;
  entries: FollowUpHistory[];
}) {
  if (entries.length === 0) return null;

  return (
    <details className="mt-4 rounded-xl border border-line bg-white px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink">
        <HistoryIcon aria-hidden="true" size={16} />
        Histórico ({entries.length})
      </summary>
      <div className="mt-3 space-y-3 border-t border-line pt-3">
        {entries.map((entry) => (
          <div className="text-sm" key={entry.id}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={entry.outcome === "realizado" ? "success" : "warning"}>
                {entry.outcome === "realizado" ? "Realizado" : "Sem retorno"}
              </StatusBadge>
              <span className="font-semibold text-ink">{followUpActionLabels[entry.action_type]}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {entry.performed_by_name || (entry.performed_by
                ? actorNames[entry.performed_by] ?? "Usuário não disponível"
                : "Usuário não identificado")} em {formatActionDate(entry.performed_at)}
            </p>
            {entry.notes ? <p className="mt-1 whitespace-pre-wrap text-muted">{entry.notes}</p> : null}
          </div>
        ))}
      </div>
    </details>
  );
}

function presentKey(personType: PersonType, serviceId: string) {
  return `${personType}:${serviceId}`;
}

function isCritical(item: FollowUpItem, memberThreshold: number, visitorThreshold: number) {
  return item.absenceStreak >= (item.kind === "visitante" ? visitorThreshold : memberThreshold);
}

export default function FollowUpPage() {
  return (
    <AuthGate allowedRoles={["lideranca"]}>
      <FollowUpContent />
    </AuthGate>
  );
}

function FollowUpContent() {
  const { session } = useAuth();
  const { settings } = useSystemSettings();
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});
  const [currentService, setCurrentService] = useState<ServiceSummary | null>(null);
  const [serviceCount, setServiceCount] = useState(0);
  const [filter, setFilter] = useState<FilterMode>("pendentes");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [needsSqlSetup, setNeedsSqlSetup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [visitorServices, setVisitorServices] = useState<ServiceSummary[]>([]);
  const [selectedVisitorServiceId, setSelectedVisitorServiceId] = useState("");
  const [guestsByService, setGuestsByService] = useState<Record<string, ReceptionGuest[]>>({});
  const [guestFilter, setGuestFilter] = useState<GuestFilterMode>("pendentes");
  const [guestSearch, setGuestSearch] = useState("");
  const [isVisitorHistoryLoading, setIsVisitorHistoryLoading] = useState(true);
  const [visitorHistoryMessage, setVisitorHistoryMessage] = useState("");
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [histories, setHistories] = useState<Record<string, FollowUpHistory[]>>({});
  const [actionByItem, setActionByItem] = useState<Record<string, FollowUpActionType>>({});

  const loadActorNames = useCallback(async (userIds: (string | null)[]) => {
    const uniqueUserIds = [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];
    if (uniqueUserIds.length === 0) return;

    const { data, error } = await supabase.rpc("get_followup_actor_names", {
      p_user_ids: uniqueUserIds
    });

    if (error) {
      setNeedsSqlSetup(true);
      return;
    }

    setActorNames((current) => ({
      ...current,
      ...Object.fromEntries(
        (data ?? []).map((actor) => [actor.user_id, actor.display_name])
      )
    }));
  }, []);

  const loadHistory = useCallback(async (mode: "attendance" | "person", ids: string[]) => {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return;

    let query = supabase
      .from("followup_history")
      .select("id, person_id, person_type, attendance_id, service_id, action_type, outcome, notes, performed_by, performed_by_name, performed_at")
      .order("performed_at", { ascending: false });

    query = mode === "attendance"
      ? query.in("attendance_id", uniqueIds)
      : query.in("person_id", uniqueIds);

    const { data, error } = await query;
    if (error) {
      setNeedsSqlSetup(true);
      return;
    }

    const entries = (data ?? []) as FollowUpHistory[];
    await loadActorNames(entries.map((entry) => entry.performed_by));
    setHistories((current) => {
      const next = { ...current };
      uniqueIds.forEach((id) => {
        if (mode === "attendance") {
          next[attendanceHistoryKey(id)] = [];
        } else {
          next[itemKey({ id, kind: "membro" })] = [];
          next[itemKey({ id, kind: "visitante" })] = [];
        }
      });
      entries.forEach((entry) => {
        if (mode === "attendance" && !entry.attendance_id) return;
        const key = mode === "attendance"
          ? attendanceHistoryKey(entry.attendance_id!)
          : itemKey({ id: entry.person_id, kind: entry.person_type });
        next[key] = [...(next[key] ?? []), entry];
      });
      return next;
    });
  }, [loadActorNames]);

  const loadVisitorsByService = useCallback(async () => {
    setIsVisitorHistoryLoading(true);
    setVisitorHistoryMessage("");

    const { data: servicesData, error: servicesError } = await supabase
      .from("services")
      .select("id, service_date, service_type, title")
      .lte("service_date", todayInputValue())
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(24);

    if (servicesError) {
      setVisitorServices([]);
      setGuestsByService({});
      setVisitorHistoryMessage("Não foi possível carregar os visitantes por culto.");
      setIsVisitorHistoryLoading(false);
      return;
    }

    const services = (servicesData ?? []) as ServiceSummary[];
    setVisitorServices(services);
    setSelectedVisitorServiceId((current) =>
      services.some((service) => service.id === current) ? current : services[0]?.id ?? ""
    );

    if (services.length === 0) {
      setGuestsByService({});
      setIsVisitorHistoryLoading(false);
      return;
    }

    const serviceIds = services.map((service) => service.id);
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("attendances")
      .select("id, person_id, person_type, service_id, followed_up_by, followed_up_at")
      .in("person_type", ["visitante", "pastor", "musica"])
      .in("service_id", serviceIds);

    if (attendanceError) {
      setGuestsByService({});
      setNeedsSqlSetup(true);
      setVisitorHistoryMessage("Não foi possível carregar os acompanhamentos. Rode o SQL 18 no Supabase.");
      setIsVisitorHistoryLoading(false);
      return;
    }

    const attendances = (attendanceData ?? []) as Pick<
      Attendance,
      "id" | "person_id" | "person_type" | "service_id" | "followed_up_by" | "followed_up_at"
    >[];
    await Promise.all([
      loadActorNames(attendances.map((attendance) => attendance.followed_up_by)),
      loadHistory("attendance", attendances.map((attendance) => attendance.id))
    ]);
    const visitorIds = [
      ...new Set(
        attendances
          .filter((row) => row.person_type === "visitante")
          .map((row) => row.person_id)
      )
    ];
    const pastorIds = [
      ...new Set(
        attendances.filter((row) => row.person_type === "pastor").map((row) => row.person_id)
      )
    ];
    const musicIds = [
      ...new Set(
        attendances.filter((row) => row.person_type === "musica").map((row) => row.person_id)
      )
    ];

    if (attendances.length === 0) {
      setGuestsByService({});
      setIsVisitorHistoryLoading(false);
      return;
    }

    const [visitorsResponse, pastorsResponse, musicResponse] = await Promise.all([
      visitorIds.length ? supabase.from("visitors").select("id, full_name, phone, location").in("id", visitorIds) : Promise.resolve({ data: [], error: null }),
      pastorIds.length ? supabase.from("pastors").select("id, full_name, phone, district, speaker_role").in("id", pastorIds) : Promise.resolve({ data: [], error: null }),
      musicIds.length ? supabase.from("special_music").select("id, performer_name, contact, church").in("id", musicIds) : Promise.resolve({ data: [], error: null })
    ]);

    if (visitorsResponse.error || pastorsResponse.error || musicResponse.error) {
      setGuestsByService({});
      setVisitorHistoryMessage("Não foi possível carregar os dados dos convidados.");
      setIsVisitorHistoryLoading(false);
      return;
    }

    const visitorById = new Map(
      ((visitorsResponse.data ?? []) as FollowVisitor[]).map((visitor) => [visitor.id, visitor])
    );
    const pastorById = new Map(((pastorsResponse.data ?? []) as Pick<Pastor, "id" | "full_name" | "phone" | "district" | "speaker_role">[]).map((pastor) => [pastor.id, pastor]));
    const musicById = new Map(((musicResponse.data ?? []) as Pick<SpecialMusic, "id" | "performer_name" | "contact" | "church">[]).map((music) => [music.id, music]));

    setGuestsByService(
      Object.fromEntries(
        services.map((service) => [
          service.id,
          attendances.filter((row) => row.service_id === service.id).map((row): ReceptionGuest | null => {
            if (row.person_type === "visitante") {
              const person = visitorById.get(row.person_id);
              return person ? { attendanceId: row.id, serviceId: row.service_id, personId: row.person_id, kind: "visitante", kindLabel: "Visitante", fullName: person.full_name, contact: person.phone, detail: person.location, followedUpBy: row.followed_up_by, followedUpAt: row.followed_up_at } : null;
            }
            if (row.person_type === "pastor") {
              const person = pastorById.get(row.person_id);
              return person ? { attendanceId: row.id, serviceId: row.service_id, personId: row.person_id, kind: "pastor", kindLabel: person.speaker_role === "pregador" ? "Pregador" : "Pastor", fullName: person.full_name, contact: person.phone, detail: person.district, followedUpBy: row.followed_up_by, followedUpAt: row.followed_up_at } : null;
            }
            const person = musicById.get(row.person_id);
            return person ? { attendanceId: row.id, serviceId: row.service_id, personId: row.person_id, kind: "musica", kindLabel: "Música Especial", fullName: person.performer_name, contact: person.contact, detail: person.church, followedUpBy: row.followed_up_by, followedUpAt: row.followed_up_at } : null;
          }).filter((guest): guest is ReceptionGuest => Boolean(guest)).sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"))
        ])
      )
    );
    setIsVisitorHistoryLoading(false);
  }, [loadActorNames, loadHistory]);

  const loadFollowUps = useCallback(async () => {
    setIsLoading(true);
    setNeedsSqlSetup(false);

    const { data: servicesData, error: servicesError } = await supabase
      .from("services")
      .select("id, service_date, service_type")
      .eq("service_type", "sabado")
      .lte("service_date", todayInputValue())
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12);

    if (servicesError) {
      setItems([]);
      setCurrentService(null);
      setServiceCount(0);
      setMessage("Não foi possível carregar os cultos.");
      setIsLoading(false);
      return;
    }

    const services = (servicesData ?? []) as ServiceSummary[];
    setCurrentService(services[0] ?? null);
    setServiceCount(services.length);

    if (services.length < Math.min(settings.member_absence_threshold, settings.visitor_absence_threshold)) {
      setItems([]);
      setNotesByItem({});
      setIsLoading(false);
      return;
    }

    const serviceIds = services.map((service) => service.id);

    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select("id, full_name, phone, neighborhood, ministry")
      .eq("status", "ativo")
      .is("archived_at", null)
      .order("full_name", { ascending: true });

    const { data: visitorsData, error: visitorsError } = await supabase
      .from("visitors")
      .select("id, full_name, phone, location")
      .is("archived_at", null)
      .order("full_name", { ascending: true });

    if (membersError || visitorsError) {
      setItems([]);
      setMessage("Não foi possível carregar membros e visitantes.");
      setIsLoading(false);
      return;
    }

    const activeMembers = (membersData ?? []) as FollowMember[];
    const visitors = (visitorsData ?? []) as FollowVisitor[];

    const { data: attendanceData } = await supabase
      .from("attendances")
      .select("person_id, person_type, service_id, service_date, service_type")
      .in("person_type", ["membro", "visitante"])
      .in("service_id", serviceIds);

    const attendances = (attendanceData ?? []) as AttendanceSummary[];
    const presentByService = new Map<string, Set<string>>();
    services.forEach((service) => {
      presentByService.set(presentKey("membro", service.id), new Set());
      presentByService.set(presentKey("visitante", service.id), new Set());
    });
    attendances.forEach((attendance) => {
      presentByService
        .get(presentKey(attendance.person_type, attendance.service_id))
        ?.add(attendance.person_id);
    });

    const membersWithStreak = activeMembers
      .map((member) => {
        let absenceStreak = 0;

        for (const service of services) {
          if (presentByService.get(presentKey("membro", service.id))?.has(member.id)) break;
          absenceStreak += 1;
        }

        return { ...member, absenceStreak };
      })
      .filter((member) => member.absenceStreak >= settings.member_absence_threshold);

    const { data: visitorLastAttendanceData } = await supabase
      .from("attendances")
      .select("person_id, service_date, service_type")
      .eq("person_type", "visitante")
      .eq("service_type", "sabado")
      .order("service_date", { ascending: false })
      .limit(5000);

    const lastAttendanceByVisitor = new Map<string, Pick<Attendance, "service_date" | "service_type">>();

    ((visitorLastAttendanceData ?? []) as Pick<
      Attendance,
      "person_id" | "service_date" | "service_type"
    >[]).forEach((attendance) => {
      if (!lastAttendanceByVisitor.has(attendance.person_id)) {
        lastAttendanceByVisitor.set(attendance.person_id, {
          service_date: attendance.service_date,
          service_type: attendance.service_type
        });
      }
    });

    const visitorsWithStreak = visitors
      .filter((visitor) => lastAttendanceByVisitor.has(visitor.id))
      .map((visitor) => {
        let absenceStreak = 0;

        for (const service of services) {
          if (presentByService.get(presentKey("visitante", service.id))?.has(visitor.id)) break;
          absenceStreak += 1;
        }

        return { ...visitor, absenceStreak };
      })
      .filter((visitor) => visitor.absenceStreak >= settings.visitor_absence_threshold);

    const memberIds = membersWithStreak.map((member) => member.id);
    const visitorIds = visitorsWithStreak.map((visitor) => visitor.id);
    const lastAttendanceByMember = new Map<string, Pick<Attendance, "service_date" | "service_type">>();

    if (memberIds.length > 0) {
      const { data: lastAttendanceData } = await supabase
        .from("attendances")
        .select("person_id, service_date, service_type")
        .eq("person_type", "membro")
        .eq("service_type", "sabado")
        .in("person_id", memberIds)
        .order("service_date", { ascending: false })
        .limit(5000);

      ((lastAttendanceData ?? []) as Pick<
        Attendance,
        "person_id" | "service_date" | "service_type"
      >[]).forEach((attendance) => {
        if (!lastAttendanceByMember.has(attendance.person_id)) {
          lastAttendanceByMember.set(attendance.person_id, {
            service_date: attendance.service_date,
            service_type: attendance.service_type
          });
        }
      });
    }

    let memberFollowUps: FollowUpRow[] = [];
    let visitorFollowUps: FollowUpRow[] = [];

    if (memberIds.length > 0 && services[0]) {
      const { data: followUpData, error: followUpError } = await supabase
        .from("member_followups")
        .select(
          "id, member_id, last_service_id, last_service_date, absence_streak, status, notes, contacted_by, contacted_at"
        )
        .eq("last_service_id", services[0].id)
        .in("member_id", memberIds);

      if (followUpError) {
        setNeedsSqlSetup(true);
      } else {
        memberFollowUps = ((followUpData ?? []) as MemberFollowUpRow[]).map((followUp) => ({
          ...followUp,
          person_id: followUp.member_id
        }));
      }
    }

    if (visitorIds.length > 0 && services[0]) {
      const { data: followUpData, error: followUpError } = await supabase
        .from("visitor_followups")
        .select(
          "id, visitor_id, last_service_id, last_service_date, absence_streak, status, notes, contacted_by, contacted_at"
        )
        .eq("last_service_id", services[0].id)
        .in("visitor_id", visitorIds);

      if (followUpError) {
        setNeedsSqlSetup(true);
      } else {
        visitorFollowUps = ((followUpData ?? []) as VisitorFollowUpRow[]).map((followUp) => ({
          ...followUp,
          person_id: followUp.visitor_id
        }));
      }
    }

    await loadActorNames(
      [...memberFollowUps, ...visitorFollowUps].map((followUp) => followUp.contacted_by)
    );
    await loadHistory("person", [...memberIds, ...visitorIds]);

    const followUpByMember = new Map(memberFollowUps.map((followUp) => [followUp.person_id, followUp]));
    const followUpByVisitor = new Map(visitorFollowUps.map((followUp) => [followUp.person_id, followUp]));
    const memberItems: FollowUpItem[] = membersWithStreak
      .map((member) => ({
        ...member,
        kind: "membro" as PersonType,
        lastAttendance: lastAttendanceByMember.get(member.id) ?? null,
        lastService: services[0],
        followUp: followUpByMember.get(member.id) ?? null
      }));
    const visitorItems: FollowUpItem[] = visitorsWithStreak.map((visitor) => ({
      ...visitor,
      kind: "visitante" as PersonType,
      neighborhood: visitor.location,
      ministry: "Visitante",
      lastAttendance: lastAttendanceByVisitor.get(visitor.id) ?? null,
      lastService: services[0],
      followUp: followUpByVisitor.get(visitor.id) ?? null
    }));
    const nextItems = [...memberItems, ...visitorItems]
      .filter((item) => item.followUp?.status !== "removido")
      .sort(
        (a, b) =>
          b.absenceStreak - a.absenceStreak ||
          a.kind.localeCompare(b.kind, "pt-BR") ||
          a.full_name.localeCompare(b.full_name, "pt-BR")
      );

    setItems(nextItems);
    setNotesByItem(
      Object.fromEntries(
        nextItems.map((item) => [itemKey(item), item.followUp?.notes ?? ""])
      )
    );
    setActionByItem((current) =>
      Object.fromEntries(nextItems.map((item) => [itemKey(item), current[itemKey(item)] ?? "mensagem"]))
    );
    setIsLoading(false);
  }, [
    loadActorNames,
    loadHistory,
    settings.member_absence_threshold,
    settings.visitor_absence_threshold
  ]);

  useEffect(() => {
    loadFollowUps();
    loadVisitorsByService();
  }, [loadFollowUps, loadVisitorsByService]);

  const selectedVisitorService = visitorServices.find(
    (service) => service.id === selectedVisitorServiceId
  );
  const selectedServiceGuests = useMemo(
    () => guestsByService[selectedVisitorServiceId] ?? [],
    [guestsByService, selectedVisitorServiceId]
  );
  const filteredServiceGuests = useMemo(() => {
    const normalizedGuestSearch = normalizeSearch(guestSearch);

    return selectedServiceGuests.filter((guest) => {
      const isCompleted = Boolean(guest.followedUpAt);
      const matchesFilter =
        guestFilter === "todos" ||
        (guestFilter === "pendentes" && !isCompleted) ||
        (guestFilter === "concluidos" && isCompleted) ||
        (guestFilter === "visitantes" && guest.kind === "visitante") ||
        (guestFilter === "pastores" && guest.kind === "pastor") ||
        (guestFilter === "musicas" && guest.kind === "musica");

      if (!matchesFilter) return false;
      if (!normalizedGuestSearch) return true;

      return [guest.fullName, guest.contact, guest.detail, guest.kindLabel]
        .some((value) => normalizeSearch(value).includes(normalizedGuestSearch));
    });
  }, [guestFilter, guestSearch, selectedServiceGuests]);

  const stats = useMemo(() => {
    const accompanied = items.filter((item) => item.followUp?.status === "acompanhado").length;
    const critical = items.filter((item) => isCritical(
      item,
      settings.member_absence_threshold,
      settings.visitor_absence_threshold
    )).length;

    return {
      total: items.length,
      pending: items.length - accompanied,
      accompanied,
      critical,
      members: items.filter((item) => item.kind === "membro").length,
      visitors: items.filter((item) => item.kind === "visitante").length
    };
  }, [items, settings.member_absence_threshold, settings.visitor_absence_threshold]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return items.filter((item) => {
      const isAccompanied = item.followUp?.status === "acompanhado";
      const matchesFilter =
        filter === "todos" ||
        (filter === "pendentes" && !isAccompanied) ||
        (filter === "acompanhados" && isAccompanied) ||
        (filter === "criticos" && isCritical(
          item,
          settings.member_absence_threshold,
          settings.visitor_absence_threshold
        )) ||
        (filter === "membros" && item.kind === "membro") ||
        (filter === "visitantes" && item.kind === "visitante");

      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;

      return [item.full_name, item.phone, item.neighborhood, item.ministry, item.location, item.kind]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearch));
    });
  }, [filter, items, search, settings.member_absence_threshold, settings.visitor_absence_threshold]);

  const currentServiceText = currentService
    ? `${SERVICE_LABELS[currentService.service_type]} em ${formatDateBR(currentService.service_date)}`
    : "Nenhum culto registrado";

  const saveFollowUp = useCallback(
    async (item: FollowUpItem, status?: FollowUpStatus, outcome?: FollowUpOutcome) => {
      if (!session?.user.id) return;

      const nextStatus = status ?? item.followUp?.status ?? "pendente";
      const isAccompanied = nextStatus === "acompanhado";
      const currentItemKey = itemKey(item);
      const saveKey = `${currentItemKey}:${nextStatus}`;

      setSavingId(saveKey);
      setMessage("");

      const payload = {
        last_service_id: item.lastService.id,
        last_service_date: item.lastService.service_date,
        absence_streak: item.absenceStreak,
        status: nextStatus,
        notes: notesByItem[currentItemKey]?.trim() || null,
        contacted_by: isAccompanied ? item.followUp?.contacted_by ?? session.user.id : null,
        contacted_at: isAccompanied
          ? item.followUp?.contacted_at ?? new Date().toISOString()
          : null
      };

      const { error } =
        item.kind === "membro"
          ? await supabase.from("member_followups").upsert(
              {
                ...payload,
                member_id: item.id
              },
              { onConflict: "member_id,last_service_id" }
            )
          : await supabase.from("visitor_followups").upsert(
              {
                ...payload,
                visitor_id: item.id
              },
              { onConflict: "visitor_id,last_service_id" }
            );

      if (error) {
        setNeedsSqlSetup(true);
        setMessage("Não foi possível salvar. Rode o SQL 12 no Supabase e tente de novo.");
        setSavingId(null);
        return;
      }

      if (outcome) {
        const { error: historyError } = await supabase.from("followup_history").insert({
          person_id: item.id,
          person_type: item.kind,
          service_id: item.lastService.id,
          action_type: actionByItem[currentItemKey] ?? "mensagem",
          outcome,
          notes: notesByItem[currentItemKey]?.trim() || null,
          performed_by: session.user.id
        });

        if (historyError) {
          setNeedsSqlSetup(true);
          setMessage("O status foi salvo, mas o histórico não. Execute o SQL 25 no Supabase.");
          await loadFollowUps();
          setSavingId(null);
          return;
        }
      }

      setMessage(
        outcome === "sem_retorno"
          ? "Tentativa de contato registrada no histórico."
          : nextStatus === "acompanhado"
          ? "Acompanhamento marcado como concluído."
          : "Acompanhamento salvo."
      );
      await loadFollowUps();
      setSavingId(null);
    },
    [actionByItem, loadFollowUps, notesByItem, session?.user.id]
  );

  const removeFromFollowUpList = useCallback(
    async (item: FollowUpItem) => {
      if (!session?.user.id) return;

      const currentItemKey = itemKey(item);
      const personLabel = item.kind === "membro" ? "membro" : "visitante";
      const confirmed = window.confirm(
        `Excluir ${item.full_name} da lista de acompanhamento deste culto? O cadastro do ${personLabel} não será apagado.`
      );

      if (!confirmed) return;

      setSavingId(`${currentItemKey}:removido`);
      setMessage("");

      const payload = {
        last_service_id: item.lastService.id,
        last_service_date: item.lastService.service_date,
        absence_streak: item.absenceStreak,
        status: "removido" as FollowUpStatus,
        notes: notesByItem[currentItemKey]?.trim() || item.followUp?.notes || null,
        contacted_by: null,
        contacted_at: null
      };

      const { error } =
        item.kind === "membro"
          ? await supabase.from("member_followups").upsert(
              {
                ...payload,
                member_id: item.id
              },
              { onConflict: "member_id,last_service_id" }
            )
          : await supabase.from("visitor_followups").upsert(
              {
                ...payload,
                visitor_id: item.id
              },
              { onConflict: "visitor_id,last_service_id" }
            );

      if (error) {
        setNeedsSqlSetup(true);
        setMessage("Não foi possível excluir da lista. Rode o SQL 12 no Supabase e tente de novo.");
        setSavingId(null);
        return;
      }

      setMessage("Pessoa removida da lista de acompanhamento.");
      await loadFollowUps();
      setSavingId(null);
    },
    [loadFollowUps, notesByItem, session?.user.id]
  );

  const toggleReceptionFollowUp = useCallback(async (guest: ReceptionGuest) => {
    if (!session?.user.id) return;
    setSavingId(`attendance:${guest.attendanceId}`);
    setMessage("");

    const completed = !guest.followedUpAt;
    const { error } = await supabase
      .from("attendances")
      .update({
        followed_up_at: completed ? new Date().toISOString() : null,
        followed_up_by: completed ? session.user.id : null
      })
      .eq("id", guest.attendanceId);

    if (error) {
      setNeedsSqlSetup(true);
      setMessage("Não foi possível marcar a conclusão. Rode o SQL 18 no Supabase.");
    } else {
      const actionLabel = guest.kind === "visitante" ? "Acompanhamento" : "Agradecimento";
      if (completed) {
        const { error: historyError } = await supabase.from("followup_history").insert({
          person_id: guest.personId,
          person_type: guest.kind,
          attendance_id: guest.attendanceId,
          service_id: guest.serviceId,
          action_type: guest.kind === "visitante" ? "mensagem" : "agradecimento",
          outcome: "realizado",
          performed_by: session.user.id
        });

        if (historyError) {
          setNeedsSqlSetup(true);
          setMessage(`${actionLabel} marcado, mas o histórico não foi salvo. Execute o SQL 25 no Supabase.`);
          await loadVisitorsByService();
          setSavingId(null);
          return;
        }
      }
      setMessage(completed ? `${actionLabel} marcado como realizado.` : `${actionLabel} reaberto.`);
      await loadVisitorsByService();
    }
    setSavingId(null);
  }, [loadVisitorsByService, session?.user.id]);

  return (
    <div>
      <PageHeader
        action={
          <button
            className="secondary-button"
            onClick={() => {
              setMessage("");
              loadFollowUps();
              loadVisitorsByService();
            }}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={17} />
            Atualizar
          </button>
        }
        eyebrow="Liderança"
        title="Acompanhamento"
      />

      <section className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Base do acompanhamento</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">{currentServiceText}</h2>
          </div>
          <StatusBadge tone={serviceCount >= 2 ? "success" : "warning"}>
            {serviceCount} sábados analisados
          </StatusBadge>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard icon={HeartHandshake} label="Pendentes" tone="wine" value={stats.pending} />
        <MetricCard icon={ShieldCheck} label="Acompanhados" value={stats.accompanied} />
        <MetricCard icon={UsersRound} label="Membros" value={stats.members} />
        <MetricCard icon={UserRoundPlus} label="Visitantes" tone="wine" value={stats.visitors} />
        <MetricCard icon={AlertCircle} label="Alertas de ausência" tone="gold" value={stats.critical} />
      </section>

      <section className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Recepção, boas-vindas e gratidão</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Acompanhamentos e agradecimentos</h2>
            <p className="mt-1 text-sm text-muted">
              Acompanhe visitantes e agradeça pastores, pregadores e músicas especiais após cada culto.
            </p>
          </div>
          <StatusBadge tone={selectedServiceGuests.length > 0 ? "success" : "neutral"}>
            {selectedServiceGuests.filter((guest) => guest.followedUpAt).length}/{selectedServiceGuests.length} concluídos
          </StatusBadge>
        </div>

        {visitorServices.length > 0 ? (
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="field-label">Culto</span>
              <select
                className="field-input"
                onChange={(event) => setSelectedVisitorServiceId(event.target.value)}
                value={selectedVisitorServiceId}
              >
                {visitorServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.title || SERVICE_LABELS[service.service_type]} — {formatDateBR(service.service_date)}
                  </option>
                ))}
              </select>
            </label>
            <label className="relative block">
              <span className="field-label">Buscar convidado</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute bottom-3.5 left-3 text-muted"
                size={18}
              />
              <input
                className="field-input pl-10"
                onChange={(event) => setGuestSearch(event.target.value)}
                placeholder="Nome, contato, igreja, distrito..."
                value={guestSearch}
              />
            </label>
          </div>
        ) : null}

        {visitorServices.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {guestFilterOptions.map((option) => (
              <button
                aria-pressed={guestFilter === option.value}
                className={`secondary-button min-h-10 px-3 py-2 ${
                  guestFilter === option.value ? "border-forest bg-forest text-white hover:text-white" : ""
                }`}
                key={option.value}
                onClick={() => setGuestFilter(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {visitorHistoryMessage ? (
          <Notice title={visitorHistoryMessage} tone="warning" />
        ) : isVisitorHistoryLoading ? (
          <Notice title="Carregando visitantes dos cultos..." />
        ) : !selectedVisitorService ? (
          <Notice title="Nenhum culto encontrado" text="Cadastre um culto para iniciar o acompanhamento." />
        ) : selectedServiceGuests.length === 0 ? (
          <Notice
            title="Nenhum convidado neste culto"
            text="Visitantes, pastores e músicas especiais aparecerão aqui após a presença ser registrada."
          />
        ) : filteredServiceGuests.length === 0 ? (
          <Notice
            title="Nenhum resultado neste filtro"
            text="Escolha outro tipo, status ou limpe a busca para ver os convidados deste culto."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredServiceGuests.map((guest) => {
              const whatsappUrl = getThankYouWhatsAppUrl(
                guest.contact,
                guest.fullName,
                guest.kind,
                settings.thank_you_message,
                settings.church_name
              );
              const isAccompanied = Boolean(guest.followedUpAt);
              const isThankYou = guest.kind !== "visitante";

              return (
                <article className={`rounded-card border bg-paper p-4 ${isAccompanied ? "border-forest/30" : "border-line"}`} key={guest.attendanceId}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="font-semibold text-ink hover:text-wine hover:underline" href={`/pessoas/${guest.kind}/${guest.personId}`}>
                            {guest.fullName}
                        </Link>
                        <StatusBadge tone={isAccompanied ? "success" : "warning"}>
                          {isAccompanied ? (isThankYou ? "Agradecimento feito" : "Acompanhado") : "Pendente"}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {guest.kindLabel} • {guest.contact || "Sem contato"} • {guest.detail || "Sem local informado"}
                      </p>
                      {isAccompanied ? (
                        <p className="mt-2 text-xs font-medium text-forest">
                          Realizado por {guest.followedUpBy
                            ? actorNames[guest.followedUpBy] ?? "Usuário não disponível"
                            : "Usuário não identificado"} em {formatActionDate(guest.followedUpAt)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {whatsappUrl ? <a className="secondary-button shrink-0" href={whatsappUrl} rel="noreferrer" target="_blank"><MessageCircle aria-hidden="true" size={17} />{isThankYou ? "Agradecer" : "Mensagem"}</a> : null}
                      <button className={isAccompanied ? "secondary-button" : "primary-button"} disabled={savingId === `attendance:${guest.attendanceId}`} onClick={() => toggleReceptionFollowUp(guest)} type="button">
                        <CheckCircle2 aria-hidden="true" size={17} />
                        {isAccompanied ? "Reabrir" : isThankYou ? "Marcar agradecimento" : "Marcar acompanhado"}
                      </button>
                    </div>
                  </div>
                  <FollowUpHistoryList
                    actorNames={actorNames}
                    entries={histories[attendanceHistoryKey(guest.attendanceId)] ?? []}
                  />
                </article>
              );
            })}
          </div>
        )}
      </section>

      {needsSqlSetup ? (
        <div className="mb-5">
          <Notice
            tone="warning"
            title="Atualização do Supabase pendente"
            text="Rode o SQL indicado pela mensagem. O histórico de contatos requer supabase/25_followup_history.sql."
          />
        </div>
      ) : null}

      {message ? (
        <div className="mb-5">
          <Notice title={message} tone={message.includes("Não") ? "warning" : "success"} />
        </div>
      ) : null}

      <section className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="relative">
            <span className="field-label">Buscar pessoa</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3.5 left-3 text-muted"
              size={18}
            />
            <input
              className="field-input pl-10"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Digite nome, bairro, ministério, cidade ou telefone"
              value={search}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button
                aria-pressed={filter === option.value}
                className={`secondary-button min-h-10 px-3 py-2 ${
                  filter === option.value ? "border-forest bg-forest text-white hover:text-white" : ""
                }`}
                key={option.value}
                onClick={() => setFilter(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {isLoading ? (
        <Notice title="Carregando acompanhamento..." />
      ) : serviceCount < 2 ? (
        <Notice
          tone="warning"
          title="Ainda não há sábados suficientes"
          text="Cadastre pelo menos 2 cultos de sábado para o sistema montar a lista de acompanhamento."
        />
      ) : filteredItems.length === 0 ? (
        <Notice
          tone="success"
          title="Nenhuma pessoa nesta lista"
          text="Altere o filtro ou a busca para ver outros registros."
        />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {filteredItems.map((item) => {
            const isAccompanied = item.followUp?.status === "acompanhado";
            const whatsappUrl = getWhatsAppUrl(item.phone, item.full_name);
            const currentItemKey = itemKey(item);
            const personLabel = item.kind === "membro" ? "Membro" : "Visitante";
            const detailText =
              item.kind === "membro"
                ? `${item.ministry || "Sem ministério"} • ${item.neighborhood || "Sem bairro"}`
                : `${item.location || "Sem cidade/bairro"}`;

            return (
              <article
                className={`rounded-card border bg-white p-4 shadow-soft sm:p-5 ${
                  isAccompanied
                    ? "border-forest/25"
                    : isCritical(item, settings.member_absence_threshold, settings.visitor_absence_threshold)
                      ? "border-wine/30"
                      : "border-line"
                }`}
                key={item.id}
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">
                      <Link className="hover:text-wine hover:underline" href={`/pessoas/${item.kind}/${item.id}`}>
                        {item.full_name}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {personLabel} • {detailText}
                    </p>
                  </div>
                  <StatusBadge tone={isAccompanied ? "success" : isCritical(item, settings.member_absence_threshold, settings.visitor_absence_threshold) ? "danger" : "warning"}>
                    {isAccompanied ? "Acompanhado" : `${item.absenceStreak} sábados`}
                  </StatusBadge>
                </div>

                <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-ink">Telefone/WhatsApp</dt>
                    <dd className="mt-1 text-muted">{item.phone || "Sem telefone"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Última presença</dt>
                    <dd className="mt-1 text-muted">{lastAttendanceText(item.lastAttendance)}</dd>
                  </div>
                  {isAccompanied ? (
                    <div className="sm:col-span-2">
                      <dt className="font-semibold text-ink">Acompanhamento realizado por</dt>
                      <dd className="mt-1 text-forest">
                        {item.followUp?.contacted_by
                          ? actorNames[item.followUp.contacted_by] ?? "Usuário não disponível"
                          : "Usuário não identificado"} em {formatActionDate(item.followUp?.contacted_at ?? null)}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <label className="mb-3 block">
                  <span className="field-label">Forma do contato</span>
                  <select
                    className="field-input"
                    onChange={(event) =>
                      setActionByItem((current) => ({
                        ...current,
                        [currentItemKey]: event.target.value as FollowUpActionType
                      }))
                    }
                    value={actionByItem[currentItemKey] ?? "mensagem"}
                  >
                    {followUpActionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="field-label">Observação do acompanhamento</span>
                  <textarea
                    className="field-input min-h-24 resize-y"
                    onChange={(event) =>
                      setNotesByItem((current) => ({
                        ...current,
                        [currentItemKey]: event.target.value
                      }))
                    }
                    placeholder="Ex.: liguei, pediu oração, está enfermo, mudou de bairro..."
                    value={notesByItem[currentItemKey] ?? ""}
                  />
                </label>

                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  {whatsappUrl ? (
                    <a
                      className="primary-button"
                      href={whatsappUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <MessageCircle aria-hidden="true" size={17} />
                      WhatsApp
                    </a>
                  ) : (
                    <button className="secondary-button" disabled type="button">
                      <MessageCircle aria-hidden="true" size={17} />
                      Sem WhatsApp
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    disabled={savingId === `${currentItemKey}:pendente`}
                    onClick={() => saveFollowUp(item, "pendente", "sem_retorno")}
                    type="button"
                  >
                    <Save aria-hidden="true" size={17} />
                    Registrar tentativa
                  </button>
                  {isAccompanied ? (
                    <button
                      className="secondary-button"
                      disabled={savingId === `${currentItemKey}:pendente`}
                      onClick={() => saveFollowUp(item, "pendente")}
                      type="button"
                    >
                      Reabrir
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      disabled={savingId === `${currentItemKey}:acompanhado`}
                      onClick={() => saveFollowUp(item, "acompanhado", "realizado")}
                      type="button"
                    >
                      <CheckCircle2 aria-hidden="true" size={17} />
                      Concluir
                    </button>
                  )}
                  <button
                    className="danger-button"
                    disabled={savingId === `${currentItemKey}:removido`}
                    onClick={() => removeFromFollowUpList(item)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={17} />
                    Excluir
                  </button>
                </div>

                <FollowUpHistoryList
                  actorNames={actorNames}
                  entries={histories[currentItemKey] ?? []}
                />
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
