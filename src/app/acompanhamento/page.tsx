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
  Service
} from "@/lib/types";

type FollowMember = Pick<Member, "id" | "full_name" | "phone" | "neighborhood" | "ministry">;
type ServiceSummary = Pick<Service, "id" | "service_date" | "service_type">;
type AttendanceSummary = Pick<
  Attendance,
  "person_id" | "person_type" | "service_id" | "service_date" | "service_type"
>;
type FollowUpRow = Pick<
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

type FollowUpItem = FollowMember & {
  absenceStreak: number;
  lastAttendance: Pick<Attendance, "service_date" | "service_type"> | null;
  lastService: ServiceSummary;
  followUp: FollowUpRow | null;
};

type FilterMode = "pendentes" | "todos" | "acompanhados" | "criticos";

const filterOptions: { label: string; value: FilterMode }[] = [
  { label: "Pendentes", value: "pendentes" },
  { label: "Todos", value: "todos" },
  { label: "Acompanhados", value: "acompanhados" },
  { label: "3+ faltas", value: "criticos" }
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
    `Olá, ${firstName}! Sentimos sua falta nos últimos cultos e queremos saber como você está. Podemos orar por você?`
  );

  return `https://wa.me/${normalizedPhone}?text=${message}`;
}

function lastAttendanceText(attendance: FollowUpItem["lastAttendance"]) {
  if (!attendance) return "Nenhuma presença anterior";
  return `${SERVICE_LABELS[attendance.service_type]} em ${formatDateBR(attendance.service_date)}`;
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
  const [notesByMember, setNotesByMember] = useState<Record<string, string>>({});
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
      setNotesByMember({});
      setIsLoading(false);
      return;
    }

    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select("id, full_name, phone, neighborhood, ministry")
      .eq("status", "ativo")
      .order("full_name", { ascending: true });

    if (membersError) {
      setItems([]);
      setMessage("Não foi possível carregar os membros.");
      setIsLoading(false);
      return;
    }

    const activeMembers = (membersData ?? []) as FollowMember[];
    const serviceIds = services.map((service) => service.id);
    const { data: attendanceData } = await supabase
      .from("attendances")
      .select("person_id, person_type, service_id, service_date, service_type")
      .eq("person_type", "membro")
      .in("service_id", serviceIds);

    const attendances = (attendanceData ?? []) as AttendanceSummary[];
    const presentByService = new Map<string, Set<string>>();
    services.forEach((service) => presentByService.set(service.id, new Set()));
    attendances.forEach((attendance) => {
      presentByService.get(attendance.service_id)?.add(attendance.person_id);
    });

    const membersWithStreak = activeMembers
      .map((member) => {
        let absenceStreak = 0;

        for (const service of services) {
          if (presentByService.get(service.id)?.has(member.id)) break;
          absenceStreak += 1;
        }

        return { ...member, absenceStreak };
      })
      .filter((member) => member.absenceStreak >= 2);

    const memberIds = membersWithStreak.map((member) => member.id);
    const lastAttendanceByMember = new Map<string, Pick<Attendance, "service_date" | "service_type">>();

    if (memberIds.length > 0) {
      const { data: lastAttendanceData } = await supabase
        .from("attendances")
        .select("person_id, service_date, service_type")
        .eq("person_type", "membro")
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

    let followUps: FollowUpRow[] = [];

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
        followUps = (followUpData ?? []) as FollowUpRow[];
      }
    }

    const followUpByMember = new Map(followUps.map((followUp) => [followUp.member_id, followUp]));
    const nextItems = membersWithStreak
      .map((member) => ({
        ...member,
        lastAttendance: lastAttendanceByMember.get(member.id) ?? null,
        lastService: services[0],
        followUp: followUpByMember.get(member.id) ?? null
      }))
      .sort(
        (a, b) =>
          b.absenceStreak - a.absenceStreak ||
          a.full_name.localeCompare(b.full_name, "pt-BR")
      );

    setItems(nextItems);
    setNotesByMember(
      Object.fromEntries(
        nextItems.map((item) => [item.id, item.followUp?.notes ?? ""])
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
      critical
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
        (filter === "criticos" && item.absenceStreak >= 3);

      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;

      return [item.full_name, item.phone, item.neighborhood, item.ministry]
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
      const saveKey = `${item.id}:${nextStatus}`;

      setSavingId(saveKey);
      setMessage("");

      const { error } = await supabase.from("member_followups").upsert(
        {
          member_id: item.id,
          last_service_id: item.lastService.id,
          last_service_date: item.lastService.service_date,
          absence_streak: item.absenceStreak,
          status: nextStatus,
          notes: notesByMember[item.id]?.trim() || null,
          contacted_by: isAccompanied ? item.followUp?.contacted_by ?? session.user.id : null,
          contacted_at: isAccompanied
            ? item.followUp?.contacted_at ?? new Date().toISOString()
            : null
        },
        { onConflict: "member_id,last_service_id" }
      );

      if (error) {
        setNeedsSqlSetup(true);
        setMessage("Não foi possível salvar. Rode o SQL 07 no Supabase e tente de novo.");
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
    [loadFollowUps, notesByMember, session?.user.id]
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
            {serviceCount} cultos analisados
          </StatusBadge>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={HeartHandshake} label="Pendentes" tone="wine" value={stats.pending} />
        <MetricCard icon={ShieldCheck} label="Acompanhados" value={stats.accompanied} />
        <MetricCard icon={AlertCircle} label="Com 3+ faltas" tone="gold" value={stats.critical} />
        <MetricCard icon={UsersRound} label="Total na lista" value={stats.total} />
      </section>

      {needsSqlSetup ? (
        <div className="mb-5">
          <Notice
            tone="warning"
            title="Atualização do Supabase pendente"
            text="Rode o arquivo supabase/07_member_followups.sql no SQL Editor para salvar observações e acompanhamentos."
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
            <span className="field-label">Buscar membro</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3.5 left-3 text-muted"
              size={18}
            />
            <input
              className="field-input pl-10"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Digite nome, bairro, ministério ou telefone"
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
          title="Ainda não há cultos suficientes"
          text="Cadastre pelo menos 2 cultos para o sistema montar a lista de acompanhamento."
        />
      ) : filteredItems.length === 0 ? (
        <Notice
          tone="success"
          title="Nenhum membro nesta lista"
          text="Altere o filtro ou a busca para ver outros registros."
        />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {filteredItems.map((item) => {
            const isAccompanied = item.followUp?.status === "acompanhado";
            const whatsappUrl = getWhatsAppUrl(item.phone, item.full_name);

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
                      {item.ministry || "Sem ministério"} • {item.neighborhood || "Sem bairro"}
                    </p>
                  </div>
                  <StatusBadge tone={isAccompanied ? "success" : item.absenceStreak >= 3 ? "danger" : "warning"}>
                    {isAccompanied ? "Acompanhado" : `${item.absenceStreak} faltas`}
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
                      setNotesByMember((current) => ({
                        ...current,
                        [item.id]: event.target.value
                      }))
                    }
                    placeholder="Ex.: liguei, pediu oração, está enfermo, mudou de bairro..."
                    value={notesByMember[item.id] ?? ""}
                  />
                </label>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
                    disabled={savingId === `${item.id}:${item.followUp?.status ?? "pendente"}`}
                    onClick={() => saveFollowUp(item)}
                    type="button"
                  >
                    <Save aria-hidden="true" size={17} />
                    Salvar
                  </button>
                  {isAccompanied ? (
                    <button
                      className="secondary-button"
                      disabled={savingId === `${item.id}:pendente`}
                      onClick={() => saveFollowUp(item, "pendente")}
                      type="button"
                    >
                      Reabrir
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      disabled={savingId === `${item.id}:acompanhado`}
                      onClick={() => saveFollowUp(item, "acompanhado")}
                      type="button"
                    >
                      <CheckCircle2 aria-hidden="true" size={17} />
                      Concluir
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
