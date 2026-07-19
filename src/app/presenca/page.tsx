"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarCheck,
  CheckCircle2,
  PlusCircle,
  Search,
  Trash2,
  UserPlus,
  UsersRound
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateBR, inferServiceType, serviceTitle, SERVICE_LABELS, todayInputValue } from "@/lib/date";
import { findPotentialDuplicate, normalizeBrazilPhone } from "@/lib/duplicates";
import { supabase } from "@/lib/supabase";
import type {
  Attendance,
  Member,
  Pastor,
  PersonType,
  Service,
  ServiceType,
  SpecialMusic,
  Visitor
} from "@/lib/types";

type SearchResult = {
  id: string;
  full_name: string;
  phone: string | null;
  detail: string | null;
  kind: PersonType;
  alreadyPresent: boolean;
};

type QuickVisitorForm = {
  full_name: string;
  phone: string;
  location: string;
  denomination_choice: "nao_informado" | "adventista" | "outra";
  denomination_other: string;
  how_heard: string;
  prayer_request: string;
  notes: string;
};

type CurrentAttendance = {
  attendanceId: string;
  personId: string;
  personType: PersonType;
  fullName: string;
  detail: string | null;
  createdAt: string;
};

type ResultFilter = "todos" | PersonType | "marcados" | "nao_marcados";
type AttendanceListFilter = "todos" | PersonType;
type ServiceTypeFilter = "todos" | ServiceType;

type AttendanceHistoryRow = {
  attendanceId: string;
  personId: string;
  personType: PersonType;
  fullName: string;
  detail: string | null;
  serviceDate: string;
  serviceType: ServiceType;
  createdAt: string;
};

const emptyQuickVisitor: QuickVisitorForm = {
  full_name: "",
  phone: "",
  location: "",
  denomination_choice: "nao_informado",
  denomination_other: "",
  how_heard: "",
  prayer_request: "",
  notes: ""
};

const MIN_SEARCH_LENGTH = 2;

const personTypeLabels: Record<PersonType, string> = {
  membro: "Membro",
  visitante: "Visitante",
  pastor: "Pastor",
  musica: "Música Especial"
};

const personTypeOrder: Record<PersonType, number> = {
  membro: 0,
  visitante: 1,
  pastor: 2,
  musica: 3
};

const resultFilterOptions: { value: ResultFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "membro", label: "Membros" },
  { value: "visitante", label: "Visitantes" },
  { value: "pastor", label: "Pastores" },
  { value: "musica", label: "Música Especial" },
  { value: "nao_marcados", label: "Não marcados" },
  { value: "marcados", label: "Marcados" }
];

const attendanceFilterOptions: { value: AttendanceListFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "membro", label: "Membros" },
  { value: "visitante", label: "Visitantes" },
  { value: "pastor", label: "Pastores" },
  { value: "musica", label: "Música Especial" }
];

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

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sortByBestNameMatch(results: SearchResult[], term: string) {
  const normalizedTerm = normalizeSearchValue(term);

  return [...results].sort((a, b) => {
    const aName = normalizeSearchValue(a.full_name);
    const bName = normalizeSearchValue(b.full_name);
    const aStarts = aName.startsWith(normalizedTerm);
    const bStarts = bName.startsWith(normalizedTerm);

    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    if (a.kind !== b.kind) return personTypeOrder[a.kind] - personTypeOrder[b.kind];

    return a.full_name.localeCompare(b.full_name, "pt-BR");
  });
}

function personBadgeTone(kind: PersonType): "neutral" | "success" | "warning" | "danger" {
  if (kind === "membro") return "success";
  if (kind === "visitante") return "warning";
  if (kind === "musica") return "danger";
  return "neutral";
}

function isDateInputValue(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isServiceType(value: string | null): value is ServiceType {
  return value === "quarta" || value === "sabado" || value === "especial";
}

export default function AttendancePage() {
  return (
    <AuthGate allowedRoles={["recepcao", "lideranca"]}>
      <Suspense fallback={null}>
        <AttendanceContent />
      </Suspense>
    </AuthGate>
  );
}

function AttendanceContent() {
  const { profile, session } = useAuth();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("data");
  const typeParam = searchParams.get("tipo");
  const initialServiceDate = isDateInputValue(dateParam) ? dateParam : todayInputValue();
  const [serviceDate, setServiceDate] = useState(initialServiceDate);
  const [serviceType, setServiceType] = useState<ServiceType>(() =>
    isServiceType(typeParam) ? typeParam : inferServiceType(initialServiceDate)
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("todos");
  const [markedKeys, setMarkedKeys] = useState<Set<string>>(new Set());
  const [currentAttendances, setCurrentAttendances] = useState<CurrentAttendance[]>([]);
  const [attendanceListFilter, setAttendanceListFilter] =
    useState<AttendanceListFilter>("todos");
  const [message, setMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [removingAttendanceId, setRemovingAttendanceId] = useState<string | null>(null);
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [quickVisitor, setQuickVisitor] = useState(emptyQuickVisitor);
  const [historyStartDate, setHistoryStartDate] = useState(dateInputDaysAgo(30));
  const [historyEndDate, setHistoryEndDate] = useState(todayInputValue());
  const [historyServiceType, setHistoryServiceType] = useState<ServiceTypeFilter>("todos");
  const [historyRows, setHistoryRows] = useState<AttendanceHistoryRow[]>([]);
  const [historyMessage, setHistoryMessage] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const currentServiceText = useMemo(
    () => `${SERVICE_LABELS[serviceType]} em ${formatDateBR(serviceDate)}`,
    [serviceDate, serviceType]
  );

  useEffect(() => {
    if (!isDateInputValue(dateParam)) return;

    setServiceDate(dateParam);
    setServiceType(isServiceType(typeParam) ? typeParam : inferServiceType(dateParam));
    setMessage("");
  }, [dateParam, typeParam]);

  const filteredResults = useMemo(() => {
    return results.filter((person) => {
      if (resultFilter === "todos") return true;
      if (resultFilter === "marcados") return person.alreadyPresent;
      if (resultFilter === "nao_marcados") return !person.alreadyPresent;
      return person.kind === resultFilter;
    });
  }, [resultFilter, results]);

  const filteredCurrentAttendances = useMemo(() => {
    return currentAttendances.filter((attendance) => {
      if (attendanceListFilter === "todos") return true;
      return attendance.personType === attendanceListFilter;
    });
  }, [attendanceListFilter, currentAttendances]);

  const resultKey = useCallback((kind: PersonType, id: string) => `${kind}:${id}`, []);

  const loadMarked = useCallback(async () => {
    const { data: service } = await supabase
      .from("services")
      .select("id")
      .eq("service_date", serviceDate)
      .eq("service_type", serviceType)
      .maybeSingle();

    if (!service) {
      setMarkedKeys(new Set<string>());
      setCurrentAttendances([]);
      return;
    }

    const { data } = await supabase
      .from("attendances")
      .select("id, person_id, person_type, created_at")
      .eq("service_id", service.id)
      .order("created_at", { ascending: false });

    const attendanceRows = (data ?? []) as Pick<
      Attendance,
      "id" | "person_id" | "person_type" | "created_at"
    >[];

    const next = new Set<string>();
    attendanceRows.forEach((attendance) => {
      next.add(resultKey(attendance.person_type, attendance.person_id));
    });
    setMarkedKeys(next);

    const memberIds = attendanceRows
      .filter((attendance) => attendance.person_type === "membro")
      .map((attendance) => attendance.person_id);
    const visitorIds = attendanceRows
      .filter((attendance) => attendance.person_type === "visitante")
      .map((attendance) => attendance.person_id);
    const pastorIds = attendanceRows
      .filter((attendance) => attendance.person_type === "pastor")
      .map((attendance) => attendance.person_id);
    const musicIds = attendanceRows
      .filter((attendance) => attendance.person_type === "musica")
      .map((attendance) => attendance.person_id);

    const [membersResponse, visitorsResponse, pastorsResponse, musicResponse] = await Promise.all([
      memberIds.length > 0
        ? supabase
            .from("members")
            .select("id, full_name, phone, neighborhood, ministry")
            .in("id", memberIds)
        : Promise.resolve({ data: [] }),
      visitorIds.length > 0
        ? supabase
            .from("visitors")
            .select("id, full_name, phone, location")
            .in("id", visitorIds)
        : Promise.resolve({ data: [] }),
      pastorIds.length > 0
        ? supabase
            .from("pastors")
            .select("id, full_name, phone, district")
            .in("id", pastorIds)
        : Promise.resolve({ data: [] }),
      musicIds.length > 0
        ? supabase
            .from("special_music")
            .select("id, performer_name, contact, church, visit_date")
            .in("id", musicIds)
        : Promise.resolve({ data: [] })
    ]);

    const memberById = new Map(
      ((membersResponse.data ?? []) as Pick<
        Member,
        "id" | "full_name" | "phone" | "neighborhood" | "ministry"
      >[]).map((member) => [member.id, member])
    );
    const visitorById = new Map(
      ((visitorsResponse.data ?? []) as Pick<
        Visitor,
        "id" | "full_name" | "phone" | "location"
      >[]).map((visitor) => [visitor.id, visitor])
    );
    const pastorById = new Map(
      ((pastorsResponse.data ?? []) as Pick<
        Pastor,
        "id" | "full_name" | "phone" | "district"
      >[]).map((pastor) => [pastor.id, pastor])
    );
    const musicById = new Map(
      ((musicResponse.data ?? []) as Pick<
        SpecialMusic,
        "id" | "performer_name" | "contact" | "church" | "visit_date"
      >[]).map((music) => [music.id, music])
    );

    setCurrentAttendances(
      attendanceRows.map((attendance) => {
        if (attendance.person_type === "membro") {
          const member = memberById.get(attendance.person_id);

          return {
            attendanceId: attendance.id,
            personId: attendance.person_id,
            personType: attendance.person_type,
            fullName: member?.full_name ?? "Membro removido",
            detail: member?.phone || member?.ministry || member?.neighborhood || null,
            createdAt: attendance.created_at
          };
        }

        if (attendance.person_type === "visitante") {
          const visitor = visitorById.get(attendance.person_id);

          return {
            attendanceId: attendance.id,
            personId: attendance.person_id,
            personType: attendance.person_type,
            fullName: visitor?.full_name ?? "Visitante removido",
            detail: visitor?.phone || visitor?.location || null,
            createdAt: attendance.created_at
          };
        }

        if (attendance.person_type === "pastor") {
          const pastor = pastorById.get(attendance.person_id);

          return {
            attendanceId: attendance.id,
            personId: attendance.person_id,
            personType: attendance.person_type,
            fullName: pastor?.full_name ?? "Pastor removido",
            detail: pastor?.phone || pastor?.district || null,
            createdAt: attendance.created_at
          };
        }

        const music = musicById.get(attendance.person_id);

        return {
          attendanceId: attendance.id,
          personId: attendance.person_id,
          personType: attendance.person_type,
          fullName: music?.performer_name ?? "Música Especial removida",
          detail: music?.contact || music?.church || null,
          createdAt: attendance.created_at
        };
      })
    );
  }, [resultKey, serviceDate, serviceType]);

  const searchPeople = useCallback(async () => {
    const term = query.trim();
    if (term.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      return;
    }

    setIsSearching(true);

    const [membersResponse, visitorsResponse, pastorsResponse, musicResponse] = await Promise.all([
      supabase
        .from("members")
        .select("id, full_name, phone, neighborhood, ministry, status")
        .ilike("full_name", `%${term}%`)
        .eq("status", "ativo")
        .order("full_name", { ascending: true }),
      supabase
        .from("visitors")
        .select("id, full_name, phone, location")
        .ilike("full_name", `%${term}%`)
        .order("full_name", { ascending: true }),
      supabase
        .from("pastors")
        .select("id, full_name, phone, district")
        .ilike("full_name", `%${term}%`)
        .order("full_name", { ascending: true }),
      supabase
        .from("special_music")
        .select("id, performer_name, contact, church, visit_date")
        .ilike("performer_name", `%${term}%`)
        .order("performer_name", { ascending: true })
    ]);

    const memberRows = ((membersResponse.data ?? []) as Pick<
      Member,
      "id" | "full_name" | "phone" | "neighborhood" | "ministry" | "status"
    >[]).map((member) => ({
        id: member.id,
        full_name: member.full_name,
        phone: member.phone,
        detail: member.ministry || member.neighborhood,
        kind: "membro" as PersonType,
        alreadyPresent: markedKeys.has(resultKey("membro", member.id))
      }));

    const visitorRows = ((visitorsResponse.data ?? []) as Pick<
      Visitor,
      "id" | "full_name" | "phone" | "location"
    >[]).map((visitor) => ({
      id: visitor.id,
      full_name: visitor.full_name,
      phone: visitor.phone,
      detail: visitor.location,
      kind: "visitante" as PersonType,
      alreadyPresent: markedKeys.has(resultKey("visitante", visitor.id))
    }));

    const pastorRows = ((pastorsResponse.data ?? []) as Pick<
      Pastor,
      "id" | "full_name" | "phone" | "district"
    >[]).map((pastor) => ({
      id: pastor.id,
      full_name: pastor.full_name,
      phone: pastor.phone,
      detail: pastor.district,
      kind: "pastor" as PersonType,
      alreadyPresent: markedKeys.has(resultKey("pastor", pastor.id))
    }));

    const musicRows = ((musicResponse.data ?? []) as Pick<
      SpecialMusic,
      "id" | "performer_name" | "contact" | "church" | "visit_date"
    >[]).map((music) => ({
      id: music.id,
      full_name: music.performer_name,
      phone: music.contact,
      detail: music.church
        ? `${music.church} - ${formatDateBR(music.visit_date)}`
        : formatDateBR(music.visit_date),
      kind: "musica" as PersonType,
      alreadyPresent: markedKeys.has(resultKey("musica", music.id))
    }));

    setResults(
      sortByBestNameMatch([...memberRows, ...visitorRows, ...pastorRows, ...musicRows], term)
    );
    setIsSearching(false);
  }, [markedKeys, query, resultKey]);

  const loadAttendanceHistory = useCallback(async () => {
    if (!historyStartDate || !historyEndDate) {
      setHistoryRows([]);
      setHistoryMessage("Informe a data inicial e final para buscar.");
      return;
    }

    if (historyStartDate > historyEndDate) {
      setHistoryRows([]);
      setHistoryMessage("A data inicial não pode ser maior que a data final.");
      return;
    }

    setIsLoadingHistory(true);
    setHistoryMessage("");

    let attendanceQuery = supabase
      .from("attendances")
      .select("id, person_id, person_type, service_date, service_type, created_at")
      .gte("service_date", historyStartDate)
      .lte("service_date", historyEndDate)
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (historyServiceType !== "todos") {
      attendanceQuery = attendanceQuery.eq("service_type", historyServiceType);
    }

    const { data, error } = await attendanceQuery;

    if (error) {
      setHistoryRows([]);
      setHistoryMessage("Não foi possível carregar o histórico de presença.");
      setIsLoadingHistory(false);
      return;
    }

    const attendanceRows = (data ?? []) as Pick<
      Attendance,
      "id" | "person_id" | "person_type" | "service_date" | "service_type" | "created_at"
    >[];

    const memberIds = attendanceRows
      .filter((attendance) => attendance.person_type === "membro")
      .map((attendance) => attendance.person_id);
    const visitorIds = attendanceRows
      .filter((attendance) => attendance.person_type === "visitante")
      .map((attendance) => attendance.person_id);
    const pastorIds = attendanceRows
      .filter((attendance) => attendance.person_type === "pastor")
      .map((attendance) => attendance.person_id);
    const musicIds = attendanceRows
      .filter((attendance) => attendance.person_type === "musica")
      .map((attendance) => attendance.person_id);

    const [membersResponse, visitorsResponse, pastorsResponse, musicResponse] = await Promise.all([
      memberIds.length > 0
        ? supabase
            .from("members")
            .select("id, full_name, phone, neighborhood, ministry")
            .in("id", memberIds)
        : Promise.resolve({ data: [] }),
      visitorIds.length > 0
        ? supabase
            .from("visitors")
            .select("id, full_name, phone, location")
            .in("id", visitorIds)
        : Promise.resolve({ data: [] }),
      pastorIds.length > 0
        ? supabase
            .from("pastors")
            .select("id, full_name, phone, district")
            .in("id", pastorIds)
        : Promise.resolve({ data: [] }),
      musicIds.length > 0
        ? supabase
            .from("special_music")
            .select("id, performer_name, contact, church, visit_date")
            .in("id", musicIds)
        : Promise.resolve({ data: [] })
    ]);

    const memberById = new Map(
      ((membersResponse.data ?? []) as Pick<
        Member,
        "id" | "full_name" | "phone" | "neighborhood" | "ministry"
      >[]).map((member) => [member.id, member])
    );
    const visitorById = new Map(
      ((visitorsResponse.data ?? []) as Pick<
        Visitor,
        "id" | "full_name" | "phone" | "location"
      >[]).map((visitor) => [visitor.id, visitor])
    );
    const pastorById = new Map(
      ((pastorsResponse.data ?? []) as Pick<
        Pastor,
        "id" | "full_name" | "phone" | "district"
      >[]).map((pastor) => [pastor.id, pastor])
    );
    const musicById = new Map(
      ((musicResponse.data ?? []) as Pick<
        SpecialMusic,
        "id" | "performer_name" | "contact" | "church" | "visit_date"
      >[]).map((music) => [music.id, music])
    );

    setHistoryRows(
      attendanceRows.map((attendance) => {
        if (attendance.person_type === "membro") {
          const member = memberById.get(attendance.person_id);

          return {
            attendanceId: attendance.id,
            personId: attendance.person_id,
            personType: attendance.person_type,
            fullName: member?.full_name ?? "Membro removido",
            detail: member?.phone || member?.ministry || member?.neighborhood || null,
            serviceDate: attendance.service_date,
            serviceType: attendance.service_type,
            createdAt: attendance.created_at
          };
        }

        if (attendance.person_type === "visitante") {
          const visitor = visitorById.get(attendance.person_id);

          return {
            attendanceId: attendance.id,
            personId: attendance.person_id,
            personType: attendance.person_type,
            fullName: visitor?.full_name ?? "Visitante removido",
            detail: visitor?.phone || visitor?.location || null,
            serviceDate: attendance.service_date,
            serviceType: attendance.service_type,
            createdAt: attendance.created_at
          };
        }

        if (attendance.person_type === "pastor") {
          const pastor = pastorById.get(attendance.person_id);

          return {
            attendanceId: attendance.id,
            personId: attendance.person_id,
            personType: attendance.person_type,
            fullName: pastor?.full_name ?? "Pastor removido",
            detail: pastor?.phone || pastor?.district || null,
            serviceDate: attendance.service_date,
            serviceType: attendance.service_type,
            createdAt: attendance.created_at
          };
        }

        const music = musicById.get(attendance.person_id);

        return {
          attendanceId: attendance.id,
          personId: attendance.person_id,
          personType: attendance.person_type,
          fullName: music?.performer_name ?? "Música Especial removida",
          detail: music?.contact || music?.church || null,
          serviceDate: attendance.service_date,
          serviceType: attendance.service_type,
          createdAt: attendance.created_at
        };
      })
    );

    setHistoryMessage(
      attendanceRows.length >= 500
        ? "Mostrando os 500 registros mais recentes deste período."
        : ""
    );
    setIsLoadingHistory(false);
  }, [historyEndDate, historyServiceType, historyStartDate]);

  useEffect(() => {
    loadMarked();
  }, [loadMarked]);

  useEffect(() => {
    loadAttendanceHistory();
  }, [loadAttendanceHistory]);

  useEffect(() => {
    const timeout = window.setTimeout(searchPeople, 220);
    return () => window.clearTimeout(timeout);
  }, [searchPeople]);

  async function ensureService() {
    const { data: existing } = await supabase
      .from("services")
      .select("id, service_date, service_type, title, created_by, created_at")
      .eq("service_date", serviceDate)
      .eq("service_type", serviceType)
      .maybeSingle();

    if (existing) return existing as Service;

    const { data, error } = await supabase
      .from("services")
      .insert({
        service_date: serviceDate,
        service_type: serviceType,
        title: serviceTitle(serviceDate, serviceType),
        created_by: session?.user.id ?? null
      })
      .select("id, service_date, service_type, title, created_by, created_at")
      .single();

    if (!error && data) return data as Service;

    const { data: repeated } = await supabase
      .from("services")
      .select("id, service_date, service_type, title, created_by, created_at")
      .eq("service_date", serviceDate)
      .eq("service_type", serviceType)
      .single();

    if (!repeated) {
      throw new Error("Não foi possível abrir o culto.");
    }

    return repeated as Service;
  }

  async function insertAttendance(person: Pick<SearchResult, "id" | "kind" | "full_name">) {
    const service = await ensureService();

    const { error } = await supabase.from("attendances").insert({
      person_id: person.id,
      person_type: person.kind,
      service_id: service.id,
      service_date: serviceDate,
      service_type: serviceType,
      registered_by: session?.user.id ?? null
    });

    if (error) {
      if (error.code === "23505") {
        setMessage(`${person.full_name} já estava marcado neste culto.`);
        return;
      }

      setMessage("Não foi possível marcar presença.");
      return;
    }

    if (person.kind === "musica") {
      await supabase
        .from("special_music")
        .update({ visit_date: serviceDate })
        .eq("id", person.id);
    }

    setMessage(`${person.full_name} marcado com presença.`);
    await loadMarked();
    setResults((current) =>
      current.map((result) =>
        result.id === person.id && result.kind === person.kind
          ? { ...result, alreadyPresent: true }
          : result
      )
    );
  }

  async function handleMark(person: SearchResult) {
    if (person.alreadyPresent || isMarking) return;
    setIsMarking(true);
    await insertAttendance(person);
    setIsMarking(false);
  }

  async function handleRemoveAttendance(attendance: CurrentAttendance) {
    const confirmed = window.confirm(
      `Remover a presença de ${attendance.fullName} neste culto?`
    );

    if (!confirmed) return;

    setRemovingAttendanceId(attendance.attendanceId);
    setMessage("");

    const { error } = await supabase
      .from("attendances")
      .delete()
      .eq("id", attendance.attendanceId);

    setRemovingAttendanceId(null);

    if (error) {
      setMessage("Não foi possível remover a presença. Rode o SQL 08 no Supabase e tente novamente.");
      return;
    }

    setMessage(`Presença de ${attendance.fullName} removida.`);
    await loadMarked();
    setResults((current) =>
      current.map((result) =>
        result.id === attendance.personId && result.kind === attendance.personType
          ? { ...result, alreadyPresent: false }
          : result
      )
    );
  }

  function openQuickVisitor() {
    setQuickVisitor({
      ...emptyQuickVisitor,
      full_name: query.trim()
    });
    setShowQuickForm(true);
    setMessage("");
  }

  async function handleQuickVisitorSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsMarking(true);
    setMessage("");

    const payload = {
      full_name: quickVisitor.full_name.trim(),
      phone: normalizeBrazilPhone(quickVisitor.phone) || null,
      location: quickVisitor.location.trim() || null,
      denomination:
        quickVisitor.denomination_choice === "nao_informado"
          ? null
          : quickVisitor.denomination_choice === "adventista"
            ? "Adventista"
            : quickVisitor.denomination_other.trim() || null,
      how_heard: quickVisitor.how_heard.trim() || null
    };

    const { data: existingVisitors } = await supabase
      .from("visitors")
      .select("id, full_name, phone, location")
      .limit(1000);

    const duplicate = findPotentialDuplicate(
      (existingVisitors ?? []) as Pick<Visitor, "id" | "full_name" | "phone" | "location">[],
      {
        full_name: payload.full_name,
        phone: payload.phone,
        location: payload.location
      }
    );

    if (duplicate) {
      await insertAttendance({
        id: duplicate.id,
        full_name: duplicate.full_name,
        kind: "visitante"
      });

      setQuickVisitor(emptyQuickVisitor);
      setShowQuickForm(false);
      setQuery("");
      setResults([]);
      setIsMarking(false);
      return;
    }

    const { data, error } = await supabase
      .from("visitors")
      .insert({
        ...payload,
        created_by: session?.user.id ?? null
      })
      .select("id, full_name")
      .single();

    if (error || !data) {
      setMessage("Não foi possível cadastrar o visitante. Rode o SQL 19 no Supabase.");
      setIsMarking(false);
      return;
    }

    if (profile?.role === "lideranca") {
      const { error: sensitiveError } = await supabase.from("visitor_sensitive_data").upsert({
        visitor_id: data.id,
        prayer_request: quickVisitor.prayer_request.trim() || null,
        notes: quickVisitor.notes.trim() || null,
        created_by: session?.user.id ?? null,
        updated_by: session?.user.id ?? null
      });
      if (sensitiveError) {
        setMessage("Visitante salvo, mas os dados pastorais não foram gravados. Rode o SQL 19 no Supabase.");
      }
    }

    await insertAttendance({
      id: data.id,
      full_name: data.full_name,
      kind: "visitante"
    });

    setQuickVisitor(emptyQuickVisitor);
    setShowQuickForm(false);
    setQuery("");
    setResults([]);
    setIsMarking(false);
  }

  return (
    <div>
      <PageHeader eyebrow="Check-in" title="Registrar presença" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4">
          <div className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data do culto">
                <input
                  className="field-input"
                  onChange={(event) => {
                    setServiceDate(event.target.value);
                    setServiceType(inferServiceType(event.target.value));
                    setMessage("");
                  }}
                  type="date"
                  value={serviceDate}
                />
              </Field>

              <Field label="Tipo de culto">
                <select
                  className="field-input"
                  onChange={(event) => {
                    setServiceType(event.target.value as ServiceType);
                    setMessage("");
                  }}
                  value={serviceType}
                >
                  <option value="quarta">Quarta</option>
                  <option value="sabado">Sábado</option>
                  <option value="especial">Especial</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
            <label>
              <span className="field-label">Buscar por nome</span>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                  size={19}
                />
                <input
                  autoFocus
                  className="field-input pl-10"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setMessage("");
                  }}
                  placeholder="Digite 2 letras, toque no nome"
                  value={query}
                />
              </div>
            </label>
          </div>

          {message ? (
            <Notice
              title={message}
              tone={
                message.includes("marcado") ||
                message.includes("já estava") ||
                message.includes("removida")
                  ? "success"
                  : "warning"
              }
            />
          ) : null}

          <div className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Resultados</h2>
              {isSearching ? (
                <span className="text-sm text-muted">Buscando...</span>
              ) : query.trim().length >= MIN_SEARCH_LENGTH ? (
                <span className="text-sm text-muted">
                  {filteredResults.length} de {results.length}
                </span>
              ) : null}
            </div>

            {results.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {resultFilterOptions.map((filter) => (
                  <button
                    className={
                      filter.value === resultFilter
                        ? "primary-button min-h-9 px-3 py-2 text-sm"
                        : "secondary-button min-h-9 px-3 py-2 text-sm"
                    }
                    key={filter.value}
                    onClick={() => setResultFilter(filter.value)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            ) : null}

            {query.trim().length < MIN_SEARCH_LENGTH ? (
              <p className="text-sm text-muted">Digite 2 letras para localizar membros, visitantes, pastores ou músicas especiais.</p>
            ) : results.length === 0 && !isSearching ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Nenhuma pessoa encontrada.</p>
                <button className="primary-button w-full sm:w-auto" onClick={openQuickVisitor} type="button">
                  <UserPlus aria-hidden="true" size={18} />
                  Cadastrar visitante rapidamente
                </button>
              </div>
            ) : filteredResults.length === 0 && !isSearching ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Nenhum resultado neste filtro.</p>
                <button className="secondary-button w-full sm:w-auto" onClick={openQuickVisitor} type="button">
                  <UserPlus aria-hidden="true" size={18} />
                  Cadastrar visitante rapidamente
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredResults.map((person) => (
                  <button
                    className="w-full rounded-card border border-line bg-paper p-3 text-left transition hover:border-forest hover:bg-forest/5 disabled:cursor-not-allowed disabled:opacity-75"
                    disabled={person.alreadyPresent || isMarking}
                    key={`${person.kind}-${person.id}`}
                    onClick={() => handleMark(person)}
                    type="button"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink">{person.full_name}</p>
                          <StatusBadge tone={personBadgeTone(person.kind)}>
                            {personTypeLabels[person.kind]}
                          </StatusBadge>
                          {person.alreadyPresent ? (
                            <StatusBadge tone="success">presente</StatusBadge>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted">
                          {person.phone || person.detail || "Sem contato"}
                        </p>
                      </div>

                      <span
                        className={
                          person.alreadyPresent
                            ? "secondary-button pointer-events-none"
                            : "primary-button pointer-events-none"
                        }
                      >
                        {person.alreadyPresent ? (
                          <CheckCircle2 aria-hidden="true" size={18} />
                        ) : (
                          <PlusCircle aria-hidden="true" size={18} />
                        )}
                        {person.alreadyPresent ? "Marcado" : "Marcar presença"}
                      </span>
                    </div>
                  </button>
                ))}
                <button className="secondary-button w-full sm:w-auto" onClick={openQuickVisitor} type="button">
                  <UserPlus aria-hidden="true" size={18} />
                  Cadastrar visitante rapidamente
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-card bg-forest/10 text-forest">
              <CalendarCheck aria-hidden="true" size={22} />
            </div>
            <h2 className="text-base font-semibold text-ink">{currentServiceText}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Pessoas já marcadas neste culto ficam bloqueadas para evitar duplicidade.
            </p>
          </section>

          <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">Presentes neste culto</h2>
              <StatusBadge tone={currentAttendances.length > 0 ? "success" : "neutral"}>
                {filteredCurrentAttendances.length}
              </StatusBadge>
            </div>

            {currentAttendances.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {attendanceFilterOptions.map((filter) => (
                  <button
                    className={
                      filter.value === attendanceListFilter
                        ? "primary-button min-h-9 px-3 py-2 text-sm"
                        : "secondary-button min-h-9 px-3 py-2 text-sm"
                    }
                    key={filter.value}
                    onClick={() => setAttendanceListFilter(filter.value)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            ) : null}

            {currentAttendances.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma presença marcada para este culto.</p>
            ) : filteredCurrentAttendances.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma presença neste filtro.</p>
            ) : (
              <div className="space-y-3">
                {filteredCurrentAttendances.map((attendance) => (
                  <div
                    className="border-b border-line pb-3 last:border-0 last:pb-0"
                    key={attendance.attendanceId}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <p className="font-medium text-ink">{attendance.fullName}</p>
                          <StatusBadge tone={personBadgeTone(attendance.personType)}>
                            {personTypeLabels[attendance.personType]}
                          </StatusBadge>
                        </div>
                        <p className="text-sm text-muted">
                          {attendance.detail || "Sem contato"}
                        </p>
                      </div>
                      <button
                        className="danger-button min-h-9 shrink-0 px-3 py-2"
                        disabled={removingAttendanceId === attendance.attendanceId}
                        onClick={() => handleRemoveAttendance(attendance)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                        {removingAttendanceId === attendance.attendanceId ? "Removendo..." : "Remover"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {showQuickForm ? (
            <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <UserPlus aria-hidden="true" size={19} />
                <h2 className="text-base font-semibold text-ink">Visitante rápido</h2>
              </div>

              <form className="space-y-3" onSubmit={handleQuickVisitorSubmit}>
                <Field label="Nome completo">
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setQuickVisitor({ ...quickVisitor, full_name: event.target.value })
                    }
                    required
                    value={quickVisitor.full_name}
                  />
                </Field>
                <Field label="Telefone/WhatsApp">
                  <input
                    className="field-input"
                    inputMode="tel"
                    onChange={(event) =>
                      setQuickVisitor({ ...quickVisitor, phone: event.target.value })
                    }
                    value={quickVisitor.phone}
                  />
                </Field>
                <Field label="Cidade/bairro">
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setQuickVisitor({ ...quickVisitor, location: event.target.value })
                    }
                    value={quickVisitor.location}
                  />
                </Field>
                <Field label="Denominação">
                  <select
                    className="field-input"
                    onChange={(event) =>
                      setQuickVisitor({
                        ...quickVisitor,
                        denomination_choice: event.target.value as
                          | "nao_informado"
                          | "adventista"
                          | "outra",
                        denomination_other:
                          event.target.value === "outra" ? quickVisitor.denomination_other : ""
                      })
                    }
                    value={quickVisitor.denomination_choice}
                  >
                    <option value="nao_informado">Não informado</option>
                    <option value="adventista">Adventista</option>
                    <option value="outra">Outra</option>
                  </select>
                </Field>
                {quickVisitor.denomination_choice === "outra" ? (
                  <Field label="Qual denominação?">
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setQuickVisitor({ ...quickVisitor, denomination_other: event.target.value })
                      }
                      placeholder="Digite o nome da denominação"
                      required
                      value={quickVisitor.denomination_other}
                    />
                  </Field>
                ) : null}
                <Field label="Como conheceu">
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setQuickVisitor({ ...quickVisitor, how_heard: event.target.value })
                    }
                    value={quickVisitor.how_heard}
                  />
                </Field>
                {profile?.role === "lideranca" ? (
                  <div className="grid gap-3 rounded-card border border-forest/20 bg-forest/5 p-4">
                    <p className="text-sm font-semibold text-ink">Área pastoral — somente liderança</p>
                    <Field label="Pedido de oração">
                      <textarea
                        className="field-input min-h-20 resize-y"
                        onChange={(event) =>
                          setQuickVisitor({ ...quickVisitor, prayer_request: event.target.value })
                        }
                        value={quickVisitor.prayer_request}
                      />
                    </Field>
                    <Field label="Observações pastorais">
                      <textarea
                        className="field-input min-h-20 resize-y"
                        onChange={(event) =>
                          setQuickVisitor({ ...quickVisitor, notes: event.target.value })
                        }
                        value={quickVisitor.notes}
                      />
                    </Field>
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button className="primary-button" disabled={isMarking} type="submit">
                    <CheckCircle2 aria-hidden="true" size={18} />
                    Salvar e marcar
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setShowQuickForm(false)}
                    type="button"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-card bg-gold/20 text-ink">
                <UsersRound aria-hidden="true" size={22} />
              </div>
              <h2 className="text-base font-semibold text-ink">Busca unificada</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                A busca mostra membros ativos, visitantes, pastores e músicas especiais no mesmo lugar.
              </p>
            </section>
          )}
        </aside>
      </div>

      <section className="mt-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Consulta</p>
            <h2 className="text-lg font-semibold text-ink">Histórico de presença por período</h2>
          </div>
          <StatusBadge tone={historyRows.length > 0 ? "success" : "neutral"}>
            {historyRows.length} registros
          </StatusBadge>
        </div>

        <form
          className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            loadAttendanceHistory();
          }}
        >
          <Field label="Data inicial">
            <input
              className="field-input"
              onChange={(event) => setHistoryStartDate(event.target.value)}
              type="date"
              value={historyStartDate}
            />
          </Field>
          <Field label="Data final">
            <input
              className="field-input"
              onChange={(event) => setHistoryEndDate(event.target.value)}
              type="date"
              value={historyEndDate}
            />
          </Field>
          <Field label="Tipo de culto">
            <select
              className="field-input"
              onChange={(event) =>
                setHistoryServiceType(event.target.value as ServiceTypeFilter)
              }
              value={historyServiceType}
            >
              {serviceTypeFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="primary-button self-end"
            disabled={isLoadingHistory}
            type="submit"
          >
            <Search aria-hidden="true" size={18} />
            {isLoadingHistory ? "Buscando..." : "Buscar"}
          </button>
        </form>

        {historyMessage ? (
          <p className="mb-4 rounded-card border border-gold/40 bg-gold/10 p-3 text-sm text-ink">
            {historyMessage}
          </p>
        ) : null}

        {isLoadingHistory ? (
          <p className="text-sm text-muted">Carregando histórico...</p>
        ) : historyRows.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma presença encontrada neste período.</p>
        ) : (
          <div className="max-h-[460px] overflow-y-auto rounded-card border border-line">
            {historyRows.map((attendance) => (
              <div
                className="border-b border-line p-3 last:border-0 sm:p-4"
                key={attendance.attendanceId}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{attendance.fullName}</p>
                      <StatusBadge tone={personBadgeTone(attendance.personType)}>
                        {personTypeLabels[attendance.personType]}
                      </StatusBadge>
                    </div>
                    <p className="text-sm text-muted">
                      {attendance.detail || "Sem contato"}
                    </p>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="font-medium text-ink">
                      {SERVICE_LABELS[attendance.serviceType]}
                    </p>
                    <p className="text-sm text-muted">{formatDateBR(attendance.serviceDate)}</p>
                    <p className="text-xs text-muted">
                      Registrado às{" "}
                      {new Date(attendance.createdAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
