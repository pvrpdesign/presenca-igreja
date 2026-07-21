"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  CalendarCheck,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Lock,
  LockOpen,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatDateBR,
  inferServiceType,
  serviceTitle,
  SERVICE_LABELS,
  todayInputValue
} from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Attendance, Service, ServiceType } from "@/lib/types";

type ServiceTypeFilter = "todos" | ServiceType;

type ServiceRow = Pick<
  Service,
  | "id"
  | "service_date"
  | "service_type"
  | "title"
  | "checkin_token"
  | "checkin_enabled"
  | "closed_at"
  | "closed_by"
  | "created_by"
  | "created_at"
>;

type ServiceStats = {
  total: number;
  members: number;
  visitors: number;
  pastors: number;
  music: number;
};

type ServiceForm = {
  service_date: string;
  service_type: ServiceType;
  title: string;
};

const emptyStats: ServiceStats = {
  total: 0,
  members: 0,
  visitors: 0,
  pastors: 0,
  music: 0
};

const serviceTypeOptions: { value: ServiceType; label: string }[] = [
  { value: "quarta", label: "Quarta" },
  { value: "sabado", label: "Sábado" },
  { value: "especial", label: "Especial" }
];

const serviceTypeFilterOptions: { value: ServiceTypeFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  ...serviceTypeOptions
];

function dateInputDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function initialForm(): ServiceForm {
  const serviceDate = todayInputValue();

  return {
    service_date: serviceDate,
    service_type: inferServiceType(serviceDate),
    title: ""
  };
}

function serviceDisplayTitle(service: Pick<Service, "service_date" | "service_type" | "title">) {
  return service.title || serviceTitle(service.service_date, service.service_type);
}

function weekdayLabel(dateValue: string) {
  if (!dateValue) return "";

  const [year, month, day] = dateValue.split("-").map(Number);
  const label = new Date(year, month - 1, day, 12).toLocaleDateString("pt-BR", {
    weekday: "long"
  });

  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function ServicesPage() {
  return (
    <AuthGate allowedRoles={["recepcao", "lideranca"]}>
      <ServicesContent />
    </AuthGate>
  );
}

function ServicesContent() {
  const { profile, session } = useAuth();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [statsByService, setStatsByService] = useState<Record<string, ServiceStats>>({});
  const [form, setForm] = useState<ServiceForm>(() => initialForm());
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(dateInputDaysAgo(60));
  const [endDate, setEndDate] = useState(todayInputValue());
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>("todos");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [changingClosureServiceId, setChangingClosureServiceId] = useState<string | null>(null);
  const [closedByNames, setClosedByNames] = useState<Record<string, string>>({});
  const [qrDialog, setQrDialog] = useState<{
    service: ServiceRow;
    url: string;
    imageUrl: string;
  } | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);

  const totalAttendances = useMemo(
    () => Object.values(statsByService).reduce((total, stats) => total + stats.total, 0),
    [statsByService]
  );

  const canDeleteServices = profile?.is_admin === true;

  const loadServices = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    if (!startDate || !endDate) {
      setServices([]);
      setStatsByService({});
      setMessage("Informe a data inicial e final para filtrar os cultos.");
      setIsLoading(false);
      return;
    }

    if (startDate > endDate) {
      setServices([]);
      setStatsByService({});
      setMessage("A data inicial não pode ser maior que a data final.");
      setIsLoading(false);
      return;
    }

    let query = supabase
      .from("services")
      .select(
        "id, service_date, service_type, title, checkin_token, checkin_enabled, closed_at, closed_by, created_by, created_at"
      )
      .gte("service_date", startDate)
      .lte("service_date", endDate);

    if (serviceTypeFilter !== "todos") {
      query = query.eq("service_type", serviceTypeFilter);
    }

    const { data, error } = await query
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setServices([]);
      setStatsByService({});
      setMessage("Não foi possível carregar os cultos. Confira se o SQL 34 foi executado no Supabase.");
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as ServiceRow[];
    setServices(rows);

    const closedByIds = [...new Set(rows.map((service) => service.closed_by).filter((id): id is string => Boolean(id)))];
    if (closedByIds.length > 0) {
      const { data: actorData } = await supabase.rpc("get_followup_actor_names", { p_user_ids: closedByIds });
      setClosedByNames(Object.fromEntries((actorData ?? []).map((actor) => [actor.user_id, actor.display_name])));
    } else {
      setClosedByNames({});
    }

    const serviceIds = rows.map((service) => service.id);

    if (serviceIds.length === 0) {
      setStatsByService({});
      setIsLoading(false);
      return;
    }

    const { data: attendancesData } = await supabase
      .from("attendances")
      .select("service_id, person_type")
      .in("service_id", serviceIds)
      .limit(10000);

    const nextStats: Record<string, ServiceStats> = Object.fromEntries(
      serviceIds.map((id) => [id, { ...emptyStats }])
    );

    ((attendancesData ?? []) as Pick<Attendance, "service_id" | "person_type">[]).forEach(
      (attendance) => {
        const current = nextStats[attendance.service_id] ?? { ...emptyStats };
        current.total += 1;

        if (attendance.person_type === "membro") {
          current.members += 1;
        } else if (attendance.person_type === "visitante") {
          current.visitors += 1;
        } else if (attendance.person_type === "pastor") {
          current.pastors += 1;
        } else if (attendance.person_type === "musica") {
          current.music += 1;
        }

        nextStats[attendance.service_id] = current;
      }
    );

    setStatsByService(nextStats);
    setIsLoading(false);
  }, [endDate, serviceTypeFilter, startDate]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  function resetForm() {
    setForm(initialForm());
    setEditingServiceId(null);
  }

  function startEdit(service: ServiceRow) {
    setEditingServiceId(service.id);
    setForm({
      service_date: service.service_date,
      service_type: service.service_type,
      title: service.title ?? ""
    });
    setMessage("Editando culto selecionado.");
    document.getElementById("service-form")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (profile?.role === "recepcao" && form.service_date !== todayInputValue()) {
      setMessage("A Recepção pode criar ou editar somente o culto de hoje.");
      return;
    }

    setIsSaving(true);

    const payload = {
      service_date: form.service_date,
      service_type: form.service_type,
      title: form.title.trim() || serviceTitle(form.service_date, form.service_type)
    };

    const { error } = editingServiceId
      ? await supabase.from("services").update(payload).eq("id", editingServiceId)
      : await supabase.from("services").insert({
          ...payload,
          created_by: session?.user.id ?? null
        });

    setIsSaving(false);

    if (error) {
      setMessage(
        error.code === "23505"
          ? "Já existe um culto com essa data e esse tipo."
          : "Não foi possível salvar o culto."
      );
      return;
    }

    setMessage(editingServiceId ? "Culto atualizado com sucesso." : "Culto criado com sucesso.");
    resetForm();
    await loadServices();
  }

  async function handleDelete(service: ServiceRow) {
    if (!canDeleteServices) return;

    const stats = statsByService[service.id] ?? emptyStats;
    const confirmed = window.confirm(
      `Excluir ${serviceDisplayTitle(service)}? As ${stats.total} presenças vinculadas também serão removidas.`
    );

    if (!confirmed) return;

    setDeletingServiceId(service.id);
    setMessage("");

    const { error } = await supabase.from("services").delete().eq("id", service.id);

    setDeletingServiceId(null);

    if (error) {
      setMessage("Não foi possível excluir o culto. Rode o SQL 10 no Supabase e tente novamente.");
      return;
    }

    setMessage("Culto excluído com sucesso.");
    await loadServices();
  }

  async function handleClose(service: ServiceRow) {
    const confirmed = window.confirm(
      `Encerrar ${serviceDisplayTitle(service)}? Depois disso, nenhuma presença poderá ser adicionada ou removida.`
    );
    if (!confirmed) return;

    setChangingClosureServiceId(service.id);
    setMessage("");
    const { error } = await supabase.rpc("close_service", { p_service_id: service.id });
    setChangingClosureServiceId(null);

    if (error) {
      const needsSql = error.message.includes("close_service") || error.code === "PGRST202";
      setMessage(needsSql ? "Execute o SQL 34 no Supabase para liberar o encerramento de cultos." : `Não foi possível encerrar: ${error.message}`);
      return;
    }

    setMessage("Culto encerrado com sucesso.");
    await loadServices();
  }

  async function handleReopen(service: ServiceRow) {
    const confirmed = window.confirm(
      `Reabrir ${serviceDisplayTitle(service)}? As presenças poderão ser alteradas novamente.`
    );
    if (!confirmed) return;

    setChangingClosureServiceId(service.id);
    setMessage("");
    const { error } = await supabase.rpc("reopen_service", { p_service_id: service.id });
    setChangingClosureServiceId(null);

    if (error) {
      const needsSql = error.message.includes("reopen_service") || error.code === "PGRST202";
      setMessage(needsSql ? "Execute o SQL 34 no Supabase para liberar a reabertura de cultos." : `Não foi possível reabrir: ${error.message}`);
      return;
    }

    setMessage("Culto reaberto com sucesso.");
    await loadServices();
  }

  function clearFilters() {
    setStartDate(dateInputDaysAgo(60));
    setEndDate(todayInputValue());
    setServiceTypeFilter("todos");
  }

  async function openQrCode(service: ServiceRow) {
    setIsGeneratingQr(true);
    setMessage("");

    try {
      const url = `${window.location.origin}/check-in/${service.checkin_token}`;
      const imageUrl = await QRCode.toDataURL(url, {
        width: 720,
        margin: 2,
        color: { dark: "#173f35", light: "#ffffff" },
        errorCorrectionLevel: "H"
      });

      setQrDialog({ service, url, imageUrl });
    } catch {
      setMessage("Não foi possível gerar o QR Code deste culto.");
    } finally {
      setIsGeneratingQr(false);
    }
  }

  async function copyCheckinLink() {
    if (!qrDialog) return;

    try {
      await navigator.clipboard.writeText(qrDialog.url);
      setMessage("Link do check-in copiado.");
    } catch {
      setMessage("Não foi possível copiar o link. Use o botão Abrir check-in.");
    }
  }

  return (
    <div>
      <PageHeader
        action={
          <button className="secondary-button" onClick={loadServices} type="button">
            <RefreshCw aria-hidden="true" size={17} />
            Atualizar
          </button>
        }
        description="Organize a agenda, abra o check-in e consulte o histórico de cada culto."
        eyebrow="Agenda"
        title="Cultos"
      />

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
            <form className="grid gap-4" id="service-form" onSubmit={handleSubmit}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">
                    {editingServiceId ? "Editar culto" : "Novo culto"}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Crie cultos manualmente ou ajuste um culto já existente.
                  </p>
                </div>
                {editingServiceId ? (
                  <button
                    className="secondary-button min-h-10 px-3 py-2"
                    onClick={resetForm}
                    type="button"
                  >
                    <X aria-hidden="true" size={17} />
                    Cancelar
                  </button>
                ) : null}
              </div>

              <Field label="Data do culto">
                <input
                  className="field-input"
                  disabled={profile?.role === "recepcao"}
                  onChange={(event) => {
                    const serviceDate = event.target.value;
                    setForm({
                      ...form,
                      service_date: serviceDate,
                      service_type: serviceDate
                        ? inferServiceType(serviceDate)
                        : form.service_type
                    });
                  }}
                  required
                  type="date"
                  value={form.service_date}
                />
                {form.service_date ? (
                  <span className="mt-1 block text-xs text-muted">
                    Dia identificado: {weekdayLabel(form.service_date)}
                  </span>
                ) : null}
              </Field>

              <Field label="Tipo de culto">
                <select
                  className="field-input"
                  onChange={(event) =>
                    setForm({ ...form, service_type: event.target.value as ServiceType })
                  }
                  value={form.service_type}
                >
                  {serviceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Título">
                <input
                  className="field-input"
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Opcional"
                  value={form.title}
                />
              </Field>

              <button className="primary-button w-full" disabled={isSaving} type="submit">
                <Save aria-hidden="true" size={18} />
                {isSaving
                  ? "Salvando..."
                  : editingServiceId
                    ? "Salvar alterações"
                    : "Criar culto"}
              </button>
            </form>
          </section>

          <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Search aria-hidden="true" size={18} />
              <h2 className="text-base font-semibold text-ink">Filtro</h2>
            </div>

            <div className="grid gap-3">
              <Field label="Data inicial">
                <input
                  className="field-input"
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
              </Field>
              <Field label="Data final">
                <input
                  className="field-input"
                  onChange={(event) => setEndDate(event.target.value)}
                  type="date"
                  value={endDate}
                />
              </Field>
              <Field label="Tipo de culto">
                <select
                  className="field-input"
                  onChange={(event) =>
                    setServiceTypeFilter(event.target.value as ServiceTypeFilter)
                  }
                  value={serviceTypeFilter}
                >
                  {serviceTypeFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <button className="primary-button" onClick={loadServices} type="button">
                  <Search aria-hidden="true" size={17} />
                  Aplicar filtro
                </button>
                <button className="secondary-button" onClick={clearFilters} type="button">
                  Limpar filtro
                </button>
              </div>
            </div>
          </section>
        </aside>

        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink">Cultos criados</h2>
              <p className="mt-1 text-sm text-muted">
                {services.length} cultos no filtro, {totalAttendances} presenças registradas.
              </p>
            </div>
            <StatusBadge tone={services.length > 0 ? "success" : "neutral"}>
              {services.length}
            </StatusBadge>
          </div>

          {message ? (
            <div className="mb-4">
              <Notice title={message} tone={message.includes("sucesso") ? "success" : "warning"} />
            </div>
          ) : null}

          {isLoading ? (
            <Notice title="Carregando cultos..." />
          ) : services.length === 0 ? (
            <Notice
              title="Nenhum culto encontrado"
              text="Crie um culto novo ou ajuste os filtros de período e tipo."
            />
          ) : (
            <div className="space-y-3">
              {services.map((service) => {
                const stats = statsByService[service.id] ?? emptyStats;
                const presenceHref = `/presenca?data=${service.service_date}&tipo=${service.service_type}`;
                const canEditService =
                  service.closed_at === null
                  && (profile?.role === "lideranca" || service.service_date === todayInputValue());
                const canCloseService = profile?.role === "lideranca"
                  && service.closed_at === null
                  && service.service_date <= todayInputValue();

                return (
                  <article
                    className="overflow-hidden rounded-card border border-line bg-paper shadow-sm"
                    key={service.id}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-forest/10 text-forest">
                            <CalendarCheck aria-hidden="true" size={20} />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-base font-semibold text-ink sm:text-lg">{serviceDisplayTitle(service)}</h3>
                            <p className="mt-1 text-sm text-muted">{formatDateBR(service.service_date)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <StatusBadge tone="neutral">{SERVICE_LABELS[service.service_type]}</StatusBadge>
                          <StatusBadge tone={service.closed_at ? "warning" : "success"}>
                            {service.closed_at ? "Encerrado" : "Aberto"}
                          </StatusBadge>
                        </div>
                      </div>

                      {service.closed_at ? (
                        <p className="mt-3 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs leading-5 text-muted">
                          Encerrado por {service.closed_by ? closedByNames[service.closed_by] ?? "Liderança" : "Liderança"} em {new Date(service.closed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" })}.
                        </p>
                      ) : null}

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <ServiceStat label="Presenças" value={stats.total} />
                        <ServiceStat label="Membros" value={stats.members} />
                        <ServiceStat label="Visitantes" value={stats.visitors} />
                        <ServiceStat label="Pastores" value={stats.pastors} />
                        <ServiceStat label="Músicas" value={stats.music} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-t border-line bg-white p-3 sm:grid-cols-3 sm:p-4 2xl:grid-cols-5">
                        <Link className="primary-button min-h-10 px-3 py-2" href={presenceHref}>
                          {service.closed_at ? "Consultar" : "Presença"}
                        </Link>
                        {!service.closed_at ? (
                          <button
                            className="secondary-button min-h-10 px-3 py-2"
                            disabled={isGeneratingQr}
                            onClick={() => openQrCode(service)}
                            type="button"
                          >
                            <QrCode aria-hidden="true" size={16} />
                            QR Code
                          </button>
                        ) : null}
                        {canEditService ? (
                          <button
                            className="secondary-button min-h-10 px-3 py-2"
                            onClick={() => startEdit(service)}
                            type="button"
                          >
                            <Edit3 aria-hidden="true" size={16} />
                            Editar
                          </button>
                        ) : null}
                        {canCloseService ? (
                          <button
                            className="secondary-button min-h-10 px-3 py-2"
                            disabled={changingClosureServiceId === service.id}
                            onClick={() => handleClose(service)}
                            type="button"
                          >
                            <Lock aria-hidden="true" size={16} />
                            {changingClosureServiceId === service.id ? "Encerrando..." : "Encerrar"}
                          </button>
                        ) : null}
                        {profile?.is_admin && service.closed_at ? (
                          <button
                            className="secondary-button min-h-10 px-3 py-2"
                            disabled={changingClosureServiceId === service.id}
                            onClick={() => handleReopen(service)}
                            type="button"
                          >
                            <LockOpen aria-hidden="true" size={16} />
                            {changingClosureServiceId === service.id ? "Reabrindo..." : "Reabrir"}
                          </button>
                        ) : null}
                        {canDeleteServices && !service.closed_at ? (
                          <button
                            className="danger-button min-h-10 px-3 py-2"
                            disabled={deletingServiceId === service.id}
                            onClick={() => handleDelete(service)}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                            {deletingServiceId === service.id ? "Excluindo..." : "Excluir"}
                          </button>
                        ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {qrDialog ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
          role="dialog"
        >
          <section className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-card bg-white p-5 shadow-soft sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-forest">Check-in de membros</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">
                  {serviceDisplayTitle(qrDialog.service)}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {formatDateBR(qrDialog.service.service_date)} • válido somente no dia do culto
                </p>
              </div>
              <button
                aria-label="Fechar QR Code"
                className="secondary-button min-h-10 px-3 py-2"
                onClick={() => setQrDialog(null)}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <div className="mx-auto max-w-sm rounded-card border border-line bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`QR Code para ${serviceDisplayTitle(qrDialog.service)}`}
                className="h-auto w-full"
                src={qrDialog.imageUrl}
              />
            </div>

            <p className="mt-4 break-all rounded-card bg-paper p-3 text-xs leading-5 text-muted">
              {qrDialog.url}
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <a
                className="primary-button min-h-10 px-3 py-2"
                download={`qr-checkin-${qrDialog.service.service_date}.png`}
                href={qrDialog.imageUrl}
              >
                <Download aria-hidden="true" size={16} />
                Baixar
              </a>
              <button
                className="secondary-button min-h-10 px-3 py-2"
                onClick={copyCheckinLink}
                type="button"
              >
                <Copy aria-hidden="true" size={16} />
                Copiar link
              </button>
              <a
                className="secondary-button min-h-10 px-3 py-2"
                href={qrDialog.url}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink aria-hidden="true" size={16} />
                Abrir
              </a>
            </div>

            <div className="mt-4">
              <Notice
                text="O membro informa o WhatsApp usado no cadastro. Se for encontrado e estiver ativo, a presença é marcada automaticamente."
                title="Como funciona"
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ServiceStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2.5 text-center">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}
