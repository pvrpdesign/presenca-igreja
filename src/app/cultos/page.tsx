"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Edit3,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateBR, serviceTitle, SERVICE_LABELS, todayInputValue } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Attendance, Service, ServiceType } from "@/lib/types";

type ServiceTypeFilter = "todos" | ServiceType;

type ServiceRow = Pick<
  Service,
  "id" | "service_date" | "service_type" | "title" | "created_by" | "created_at"
>;

type ServiceStats = {
  total: number;
  members: number;
  visitors: number;
};

type ServiceForm = {
  service_date: string;
  service_type: ServiceType;
  title: string;
};

const emptyStats: ServiceStats = {
  total: 0,
  members: 0,
  visitors: 0
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
  return {
    service_date: todayInputValue(),
    service_type: "sabado",
    title: ""
  };
}

function serviceDisplayTitle(service: Pick<Service, "service_date" | "service_type" | "title">) {
  return service.title || serviceTitle(service.service_date, service.service_type);
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

  const totalAttendances = useMemo(
    () => Object.values(statsByService).reduce((total, stats) => total + stats.total, 0),
    [statsByService]
  );

  const canDeleteServices = profile?.role === "lideranca";

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
      .select("id, service_date, service_type, title, created_by, created_at")
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
      setMessage("Não foi possível carregar os cultos.");
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as ServiceRow[];
    setServices(rows);

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
        } else {
          current.visitors += 1;
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

  function clearFilters() {
    setStartDate(dateInputDaysAgo(60));
    setEndDate(todayInputValue());
    setServiceTypeFilter("todos");
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
                  onChange={(event) => setForm({ ...form, service_date: event.target.value })}
                  required
                  type="date"
                  value={form.service_date}
                />
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

                return (
                  <article
                    className="rounded-card border border-line bg-paper p-3 sm:p-4"
                    key={service.id}
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <CalendarCheck aria-hidden="true" className="text-forest" size={18} />
                          <h3 className="font-semibold text-ink">{serviceDisplayTitle(service)}</h3>
                          <StatusBadge tone="success">
                            {SERVICE_LABELS[service.service_type]}
                          </StatusBadge>
                        </div>
                        <p className="text-sm text-muted">{formatDateBR(service.service_date)}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge tone="neutral">{stats.total} presenças</StatusBadge>
                          <StatusBadge tone="neutral">{stats.members} membros</StatusBadge>
                          <StatusBadge tone="neutral">{stats.visitors} visitantes</StatusBadge>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[360px]">
                        <Link className="primary-button min-h-10 px-3 py-2" href={presenceHref}>
                          Presença
                        </Link>
                        <button
                          className="secondary-button min-h-10 px-3 py-2"
                          onClick={() => startEdit(service)}
                          type="button"
                        >
                          <Edit3 aria-hidden="true" size={16} />
                          Editar
                        </button>
                        {canDeleteServices ? (
                          <button
                            className="danger-button min-h-10 px-3 py-2"
                            disabled={deletingServiceId === service.id}
                            onClick={() => handleDelete(service)}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                            {deletingServiceId === service.id ? "Excluindo..." : "Excluir"}
                          </button>
                        ) : (
                          <button className="secondary-button min-h-10 px-3 py-2" disabled type="button">
                            Só liderança
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
