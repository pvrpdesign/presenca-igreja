"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  History as HistoryIcon,
  MessageCircle,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { MetricCard, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { formatDateBR, SERVICE_LABELS, todayInputValue } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type {
  Attendance,
  FollowUpActionType,
  FollowUpHistory,
  Member,
  Pastor,
  PersonType,
  Service,
  SpecialMusic,
  Visitor,
  VisitorSensitiveData
} from "@/lib/types";

type PersonRecord = Member | Visitor | Pastor | SpecialMusic;
type AttendanceRow = Pick<Attendance, "id" | "service_id" | "service_date" | "service_type">;
type SaturdayService = Pick<Service, "id" | "service_date">;

const actionLabels: Record<FollowUpActionType, string> = {
  mensagem: "Mensagem",
  ligacao: "Ligação",
  visita: "Visita",
  oracao: "Oração",
  agradecimento: "Agradecimento",
  outro: "Contato anterior"
};

function formatActionDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bahia"
  });
}

function whatsappUrl(phone: string | null, message?: string) {
  const digits = phone?.replace(/\D/g, "");
  if (!digits) return null;
  const baseUrl = `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
  return message ? `${baseUrl}?text=${encodeURIComponent(message)}` : baseUrl;
}

export default function PersonProfilePage() {
  return (
    <AuthGate allowedRoles={["lideranca"]}>
      <PersonProfileContent />
    </AuthGate>
  );
}

function PersonProfileContent() {
  const params = useParams<{ tipo: string; id: string }>();
  const kind: PersonType | null = ["membro", "visitante", "pastor", "musica"].includes(params.tipo)
    ? params.tipo as PersonType
    : null;
  const [person, setPerson] = useState<PersonRecord | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRow[]>([]);
  const [history, setHistory] = useState<FollowUpHistory[]>([]);
  const [saturdayServices, setSaturdayServices] = useState<SaturdayService[]>([]);
  const [sensitiveData, setSensitiveData] = useState<Pick<VisitorSensitiveData, "prayer_request" | "notes"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadProfile = useCallback(async () => {
    if (!kind || !params.id) {
      setErrorMessage("Endereço da ficha inválido.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    const personRequest = kind === "membro"
      ? supabase.from("members").select("*").eq("id", params.id).maybeSingle()
      : kind === "visitante"
        ? supabase.from("visitors").select("*").eq("id", params.id).maybeSingle()
        : kind === "pastor"
          ? supabase.from("pastors").select("*").eq("id", params.id).maybeSingle()
          : supabase.from("special_music").select("*").eq("id", params.id).maybeSingle();

    const [personResponse, attendanceResponse, historyResponse, servicesResponse, sensitiveResponse] = await Promise.all([
      personRequest,
      supabase
        .from("attendances")
        .select("id, service_id, service_date, service_type")
        .eq("person_type", kind)
        .eq("person_id", params.id)
        .order("service_date", { ascending: false })
        .limit(500),
      supabase
        .from("followup_history")
        .select("id, person_id, person_type, attendance_id, service_id, action_type, outcome, notes, performed_by, performed_by_name, performed_at")
        .eq("person_type", kind)
        .eq("person_id", params.id)
        .order("performed_at", { ascending: false })
        .limit(200),
      supabase
        .from("services")
        .select("id, service_date")
        .eq("service_type", "sabado")
        .lte("service_date", todayInputValue())
        .order("service_date", { ascending: false })
        .limit(12),
      kind === "visitante"
        ? supabase
            .from("visitor_sensitive_data")
            .select("prayer_request, notes")
            .eq("visitor_id", params.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);

    if (personResponse.error || !personResponse.data) {
      setPerson(null);
      setErrorMessage("Cadastro não encontrado ou sem permissão para visualizar.");
      setIsLoading(false);
      return;
    }

    if (attendanceResponse.error || historyResponse.error || servicesResponse.error) {
      setErrorMessage("Não foi possível carregar todos os dados desta ficha.");
    }

    setPerson(personResponse.data as PersonRecord);
    setAttendances((attendanceResponse.data ?? []) as AttendanceRow[]);
    setHistory((historyResponse.data ?? []) as FollowUpHistory[]);
    setSaturdayServices((servicesResponse.data ?? []) as SaturdayService[]);
    setSensitiveData((sensitiveResponse.data ?? null) as Pick<VisitorSensitiveData, "prayer_request" | "notes"> | null);
    setIsLoading(false);
  }, [kind, params.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const stats = useMemo(() => {
    const presentServiceIds = new Set(attendances.map((attendance) => attendance.service_id));
    let absenceStreak = 0;
    for (const service of saturdayServices) {
      if (presentServiceIds.has(service.id)) break;
      absenceStreak += 1;
    }

    return {
      total: attendances.length,
      saturdays: attendances.filter((attendance) => attendance.service_type === "sabado").length,
      contacts: history.length,
      absenceStreak
    };
  }, [attendances, history.length, saturdayServices]);

  if (isLoading) return <Notice title="Carregando ficha..." />;
  if (!person || !kind) return <Notice title={errorMessage || "Ficha não encontrada."} tone="warning" />;

  const isMember = kind === "membro";
  const member = isMember ? person as Member : null;
  const visitor = kind === "visitante" ? person as Visitor : null;
  const pastor = kind === "pastor" ? person as Pastor : null;
  const music = kind === "musica" ? person as SpecialMusic : null;
  const isGuest = Boolean(pastor || music);
  const displayName = music?.performer_name ?? (person as Member | Visitor | Pastor).full_name;
  const phone = music?.contact ?? (person as Member | Visitor | Pastor).phone;
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  const messageUrl = whatsappUrl(
    phone,
    isGuest
      ? `Olá, ${firstName}! Foi uma alegria receber você na IASD Calçada. Gostaríamos de conversar sobre uma nova participação em nossa igreja.`
      : undefined
  );
  const kindLabel = member
    ? "Membro"
    : visitor
      ? "Visitante"
      : pastor?.speaker_role === "pregador"
        ? "Pregador"
        : pastor
          ? "Pastor"
          : "Música Especial";
  const lastAttendance = attendances[0] ?? null;

  return (
    <div>
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            {messageUrl ? (
              <a className="primary-button" href={messageUrl} rel="noreferrer" target="_blank">
                <MessageCircle aria-hidden="true" size={17} /> {isGuest ? "Convidar pelo WhatsApp" : "WhatsApp"}
              </a>
            ) : null}
            <Link className="secondary-button" href="/cadastros">
              <ArrowLeft aria-hidden="true" size={17} /> Voltar aos cadastros
            </Link>
          </div>
        }
        eyebrow={`Ficha de ${kindLabel.toLowerCase()}`}
        title={displayName}
      />

      {errorMessage ? <div className="mb-5"><Notice title={errorMessage} tone="warning" /></div> : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={CalendarDays} label="Total de presenças" value={stats.total} />
        <MetricCard icon={ShieldCheck} label="Sábados presentes" value={stats.saturdays} />
        <MetricCard icon={HistoryIcon} label={isGuest ? "Agradecimentos/contatos" : "Contatos registrados"} tone="wine" value={stats.contacts} />
        <MetricCard
          icon={UserRound}
          label={isGuest ? "Última participação" : "Sábados sem aparecer"}
          tone="gold"
          value={isGuest ? (lastAttendance ? formatDateBR(lastAttendance.service_date) : "Nenhuma") : stats.absenceStreak}
        />
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <h2 className="text-lg font-semibold text-ink">Dados cadastrais</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-ink">Telefone/WhatsApp</dt><dd className="mt-1 text-muted">{phone || "Não informado"}</dd></div>
            <div><dt className="font-semibold text-ink">Tipo</dt><dd className="mt-1 text-muted">{kindLabel}</dd></div>
            {member ? <><div><dt className="font-semibold text-ink">Bairro</dt><dd className="mt-1 text-muted">{member.neighborhood || "Não informado"}</dd></div><div><dt className="font-semibold text-ink">Ministério</dt><dd className="mt-1 text-muted">{member.ministry || "Não informado"}</dd></div><div><dt className="font-semibold text-ink">Situação</dt><dd className="mt-1"><StatusBadge tone={member.status === "ativo" ? "success" : "warning"}>{member.status}</StatusBadge></dd></div></> : null}
            {visitor ? <><div><dt className="font-semibold text-ink">Cidade/Bairro</dt><dd className="mt-1 text-muted">{visitor.location || "Não informado"}</dd></div><div><dt className="font-semibold text-ink">Denominação</dt><dd className="mt-1 text-muted">{visitor.denomination || "Não informada"}</dd></div><div><dt className="font-semibold text-ink">Como conheceu</dt><dd className="mt-1 text-muted">{visitor.how_heard || "Não informado"}</dd></div></> : null}
            {pastor ? <><div><dt className="font-semibold text-ink">Distrito/Região</dt><dd className="mt-1 text-muted">{pastor.district || "Não informado"}</dd></div><div><dt className="font-semibold text-ink">Participação</dt><dd className="mt-1 text-muted">{pastor.speaker_role === "pregador" ? "Pregador" : "Pastor"}</dd></div></> : null}
            {music ? <><div><dt className="font-semibold text-ink">Igreja/Grupo</dt><dd className="mt-1 text-muted">{music.church || "Não informado"}</dd></div><div><dt className="font-semibold text-ink">Data informada no cadastro</dt><dd className="mt-1 text-muted">{formatDateBR(music.visit_date)}</dd></div></> : null}
          </dl>
          {member?.notes ? <div className="mt-4 rounded-xl border border-line bg-paper p-3 text-sm"><p className="font-semibold text-ink">Observações</p><p className="mt-1 whitespace-pre-wrap text-muted">{member.notes}</p></div> : null}
        </section>

        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <h2 className="text-lg font-semibold text-ink">{isGuest ? "Informações para um novo convite" : "Dados pastorais restritos"}</h2>
          {visitor ? (
            <div className="mt-4 space-y-4 text-sm">
              <div><p className="font-semibold text-ink">Pedido de oração</p><p className="mt-1 whitespace-pre-wrap text-muted">{sensitiveData?.prayer_request || "Nenhum pedido registrado."}</p></div>
              <div><p className="font-semibold text-ink">Observações da liderança</p><p className="mt-1 whitespace-pre-wrap text-muted">{sensitiveData?.notes || "Nenhuma observação registrada."}</p></div>
            </div>
          ) : isGuest ? (
            <div className="mt-4 space-y-4 text-sm">
              <div><p className="font-semibold text-ink">Última participação</p><p className="mt-1 text-muted">{lastAttendance ? `${SERVICE_LABELS[lastAttendance.service_type]} em ${formatDateBR(lastAttendance.service_date)}` : "Nenhuma participação registrada."}</p></div>
              <div><p className="font-semibold text-ink">Contato</p><p className="mt-1 text-muted">{phone || "Não informado"}</p></div>
              <p className="rounded-xl border border-line bg-paper p-3 text-muted">Consulte abaixo todas as participações e agradecimentos antes de fazer um novo convite.</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">As observações do membro aparecem nos dados cadastrais.</p>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-ink">Histórico de presenças</h2><StatusBadge>{attendances.length}</StatusBadge></div>
          {attendances.length === 0 ? <p className="text-sm text-muted">Nenhuma presença registrada.</p> : (
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {attendances.map((attendance) => (
                <div className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0" key={attendance.id}>
                  <div><p className="font-medium text-ink">{SERVICE_LABELS[attendance.service_type]}</p><p className="text-sm text-muted">{formatDateBR(attendance.service_date)}</p></div>
                  <StatusBadge tone="success">{isGuest ? "Participou" : "Presente"}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-ink">{isGuest ? "Histórico de agradecimentos e contatos" : "Histórico de acompanhamentos"}</h2><StatusBadge>{history.length}</StatusBadge></div>
          {history.length === 0 ? <p className="text-sm text-muted">Nenhum contato registrado.</p> : (
            <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
              {history.map((entry) => (
                <article className="border-b border-line pb-4 last:border-0" key={entry.id}>
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={entry.outcome === "realizado" ? "success" : "warning"}>{entry.outcome === "realizado" ? "Realizado" : "Sem retorno"}</StatusBadge><span className="font-semibold text-ink">{actionLabels[entry.action_type]}</span></div>
                  <p className="mt-1 text-xs text-muted">{entry.performed_by_name} em {formatActionDate(entry.performed_at)}</p>
                  {entry.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{entry.notes}</p> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
