"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  HeartHandshake,
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
import { formatDateBR, SERVICE_LABELS, todayInputValue } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type {
  Attendance,
  FollowUpStatus,
  Member,
  MemberFollowUp,
  PersonType,
  Service,
  Visitor,
  VisitorFollowUp
} from "@/lib/types";

type FollowMember = Pick<Member, "id" | "full_name" | "phone" | "neighborhood" | "ministry">;
type FollowVisitor = Pick<Visitor, "id" | "full_name" | "phone" | "location">;
type ServiceSummary = Pick<Service, "id" | "service_date" | "service_type">;
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

const filterOptions: { label: string; value: FilterMode }[] = [
  { label: "Pendentes", value: "pendentes" },
  { label: "Todos", value: "todos" },
  { label: "Acompanhados", value: "acompanhados" },
  { label: "Membros", value: "membros" },
  { label: "Visitantes", value: "visitantes" },
  { label: "3+ sábados", value: "criticos" }
];

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

function itemKey(item: Pick<FollowUpItem, "id" | "kind">) {
  return `${item.kind}:${item.id}`;
}

function presentKey(personType: PersonType, serviceId: string) {
  return `${personType}:${serviceId}`;
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

  const loadFollowUps = useCallback(async () => {
    setIsLoading(true);
    setMessage("");
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

    if (services.length < 2) {
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
      .order("full_name", { ascending: true });

    const { data: visitorsData, error: visitorsError } = await supabase
      .from("visitors")
      .select("id, full_name, phone, location")
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
      .filter((member) => member.absenceStreak >= 2);

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
      .filter((visitor) => visitor.absenceStreak >= 2);

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
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  const stats = useMemo(() => {
    const accompanied = items.filter((item) => item.followUp?.status === "acompanhado").length;
    const critical = items.filter((item) => item.absenceStreak >= 3).length;

    return {
      total: items.length,
      pending: items.length - accompanied,
      accompanied,
      critical,
      members: items.filter((item) => item.kind === "membro").length,
      visitors: items.filter((item) => item.kind === "visitante").length
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return items.filter((item) => {
      const isAccompanied = item.followUp?.status === "acompanhado";
      const matchesFilter =
        filter === "todos" ||
        (filter === "pendentes" && !isAccompanied) ||
        (filter === "acompanhados" && isAccompanied) ||
        (filter === "criticos" && item.absenceStreak >= 3) ||
        (filter === "membros" && item.kind === "membro") ||
        (filter === "visitantes" && item.kind === "visitante");

      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;

      return [item.full_name, item.phone, item.neighborhood, item.ministry, item.location, item.kind]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearch));
    });
  }, [filter, items, search]);

  const currentServiceText = currentService
    ? `${SERVICE_LABELS[currentService.service_type]} em ${formatDateBR(currentService.service_date)}`
    : "Nenhum culto registrado";

  const saveFollowUp = useCallback(
    async (item: FollowUpItem, status?: FollowUpStatus) => {
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

      setMessage(
        nextStatus === "acompanhado"
          ? "Acompanhamento marcado como concluído."
          : "Acompanhamento salvo."
      );
      await loadFollowUps();
      setSavingId(null);
    },
    [loadFollowUps, notesByItem, session?.user.id]
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

  return (
    <div>
      <PageHeader
        action={
          <button className="secondary-button" onClick={loadFollowUps} type="button">
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
        <MetricCard icon={AlertCircle} label="Com 3+ sábados" tone="gold" value={stats.critical} />
      </section>

      {needsSqlSetup ? (
        <div className="mb-5">
          <Notice
            tone="warning"
            title="Atualização do Supabase pendente"
            text="Rode o arquivo supabase/12_visitor_followups.sql no SQL Editor para ativar acompanhamento de visitantes."
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
                    : item.absenceStreak >= 3
                      ? "border-wine/30"
                      : "border-line"
                }`}
                key={item.id}
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">{item.full_name}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {personLabel} • {detailText}
                    </p>
                  </div>
                  <StatusBadge tone={isAccompanied ? "success" : item.absenceStreak >= 3 ? "danger" : "warning"}>
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
                </dl>

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
                    disabled={savingId === `${currentItemKey}:${item.followUp?.status ?? "pendente"}`}
                    onClick={() => saveFollowUp(item)}
                    type="button"
                  >
                    <Save aria-hidden="true" size={17} />
                    Salvar
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
                      onClick={() => saveFollowUp(item, "acompanhado")}
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
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
