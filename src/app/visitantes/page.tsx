"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Save, Search, Trash2, UserPlus, X } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { findPotentialDuplicate } from "@/lib/duplicates";
import { supabase } from "@/lib/supabase";
import type { Visitor } from "@/lib/types";

const initialForm = {
  full_name: "",
  phone: "",
  location: "",
  how_heard: "",
  prayer_request: "",
  notes: ""
};

const initialFilters = {
  search: "",
  location: "",
  how_heard: ""
};

function normalizeFilter(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function VisitorsPage() {
  return (
    <AuthGate allowedRoles={["recepcao", "lideranca"]}>
      <VisitorsContent />
    </AuthGate>
  );
}

function VisitorsContent() {
  const { session } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [editingVisitorId, setEditingVisitorId] = useState<string | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingVisitorId, setDeletingVisitorId] = useState<string | null>(null);

  const loadVisitors = useCallback(async () => {
    const { data } = await supabase
      .from("visitors")
      .select("*")
      .order("full_name", { ascending: true })
      .limit(500);

    setVisitors((data ?? []) as Visitor[]);
  }, []);

  useEffect(() => {
    loadVisitors();
  }, [loadVisitors]);

  const filteredVisitors = useMemo(() => {
    const search = normalizeFilter(filters.search);
    const location = normalizeFilter(filters.location);
    const howHeard = normalizeFilter(filters.how_heard);

    return visitors.filter((visitor) => {
      const matchesSearch =
        !search ||
        [
          visitor.full_name,
          visitor.phone,
          visitor.location,
          visitor.how_heard,
          visitor.prayer_request,
          visitor.notes
        ].some((value) => normalizeFilter(value).includes(search));
      const matchesLocation = !location || normalizeFilter(visitor.location).includes(location);
      const matchesHowHeard = !howHeard || normalizeFilter(visitor.how_heard).includes(howHeard);

      return matchesSearch && matchesLocation && matchesHowHeard;
    });
  }, [filters, visitors]);

  function resetForm() {
    setForm(initialForm);
    setEditingVisitorId(null);
  }

  function startEdit(visitor: Visitor) {
    setEditingVisitorId(visitor.id);
    setForm({
      full_name: visitor.full_name,
      phone: visitor.phone ?? "",
      location: visitor.location ?? "",
      how_heard: visitor.how_heard ?? "",
      prayer_request: visitor.prayer_request ?? "",
      notes: visitor.notes ?? ""
    });
    setMessage("Editando visitante selecionado.");
    document.getElementById("visitor-form")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      location: form.location.trim() || null,
      how_heard: form.how_heard.trim() || null,
      prayer_request: form.prayer_request.trim() || null,
      notes: form.notes.trim() || null
    };

    const duplicate = findPotentialDuplicate(
      visitors,
      {
        full_name: payload.full_name,
        phone: payload.phone,
        location: payload.location
      },
      editingVisitorId
    );

    if (duplicate) {
      setMessage(
        `Possível duplicidade: ${duplicate.full_name} já está cadastrado como visitante. Edite o cadastro existente.`
      );
      setIsSubmitting(false);
      return;
    }

    const { error } = editingVisitorId
      ? await supabase.from("visitors").update(payload).eq("id", editingVisitorId)
      : await supabase.from("visitors").insert({
          ...payload,
          created_by: session?.user.id ?? null
        });

    setIsSubmitting(false);

    if (error) {
      setMessage(
        editingVisitorId
          ? "Não foi possível atualizar o visitante."
          : "Não foi possível cadastrar o visitante."
      );
      return;
    }

    setMessage(
      editingVisitorId ? "Visitante atualizado com sucesso." : "Visitante cadastrado com sucesso."
    );
    resetForm();
    await loadVisitors();
  }

  async function handleDelete(visitor: Visitor) {
    const confirmed = window.confirm(
      `Excluir o cadastro de ${visitor.full_name}? As presenças deste visitante também serão removidas.`
    );

    if (!confirmed) return;

    setMessage("");
    setDeletingVisitorId(visitor.id);

    const { error: attendanceError } = await supabase
      .from("attendances")
      .delete()
      .eq("person_type", "visitante")
      .eq("person_id", visitor.id);

    if (attendanceError) {
      setMessage("Não foi possível excluir. Rode o SQL 08 no Supabase e tente novamente.");
      setDeletingVisitorId(null);
      return;
    }

    const { error } = await supabase.from("visitors").delete().eq("id", visitor.id);

    setDeletingVisitorId(null);

    if (error) {
      setMessage("Não foi possível excluir o visitante.");
      return;
    }

    if (editingVisitorId === visitor.id) {
      resetForm();
    }

    setMessage("Visitante excluído com sucesso.");
    await loadVisitors();
  }

  return (
    <div>
      <PageHeader eyebrow="Cadastro" title="Visitantes" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <form className="grid gap-4" id="visitor-form" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">
                  {editingVisitorId ? "Editar visitante" : "Novo visitante"}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {editingVisitorId
                    ? "Corrija os dados e salve as alterações."
                    : "Cadastre os dados principais do visitante."}
                </p>
              </div>
              {editingVisitorId ? (
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

            <Field label="Nome completo">
              <input
                className="field-input"
                onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                required
                value={form.full_name}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telefone/WhatsApp">
                <input
                  className="field-input"
                  inputMode="tel"
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  value={form.phone}
                />
              </Field>
              <Field label="Cidade/bairro">
                <input
                  className="field-input"
                  onChange={(event) => setForm({ ...form, location: event.target.value })}
                  value={form.location}
                />
              </Field>
            </div>

            <Field label="Como conheceu a igreja">
              <input
                className="field-input"
                onChange={(event) => setForm({ ...form, how_heard: event.target.value })}
                value={form.how_heard}
              />
            </Field>

            <Field label="Pedido de oração">
              <textarea
                className="field-input min-h-24 resize-y"
                onChange={(event) => setForm({ ...form, prayer_request: event.target.value })}
                value={form.prayer_request}
              />
            </Field>

            <Field label="Observações">
              <textarea
                className="field-input min-h-24 resize-y"
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                value={form.notes}
              />
            </Field>

            {message ? (
              <Notice
                title={message}
                tone={message.includes("sucesso") ? "success" : "warning"}
              />
            ) : null}

            <button className="primary-button w-full sm:w-auto" disabled={isSubmitting} type="submit">
              <Save aria-hidden="true" size={18} />
              {isSubmitting
                ? "Salvando..."
                : editingVisitorId
                  ? "Salvar alterações"
                  : "Salvar visitante"}
            </button>
          </form>
        </section>

        <aside className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserPlus aria-hidden="true" size={19} />
              <h2 className="text-base font-semibold text-ink">Visitantes cadastrados</h2>
            </div>
            <StatusBadge tone="neutral">{filteredVisitors.length}</StatusBadge>
          </div>

          <div className="mb-4 grid gap-3">
            <label className="relative">
              <span className="field-label">Buscar</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute bottom-3.5 left-3 text-muted"
                size={18}
              />
              <input
                className="field-input pl-10"
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                placeholder="Nome, telefone, cidade..."
                value={filters.search}
              />
            </label>

            <Field label="Cidade/bairro">
              <input
                className="field-input"
                onChange={(event) => setFilters({ ...filters, location: event.target.value })}
                value={filters.location}
              />
            </Field>

            <Field label="Como conheceu">
              <input
                className="field-input"
                onChange={(event) => setFilters({ ...filters, how_heard: event.target.value })}
                value={filters.how_heard}
              />
            </Field>

            <button
              className="secondary-button min-h-10 px-3 py-2"
              onClick={() => setFilters(initialFilters)}
              type="button"
            >
              Limpar filtros
            </button>
          </div>

          <div className="space-y-3">
            {filteredVisitors.length === 0 ? (
              <p className="text-sm text-muted">Nenhum visitante encontrado.</p>
            ) : (
              filteredVisitors.map((visitor) => (
                <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={visitor.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{visitor.full_name}</p>
                      <p className="text-sm text-muted">
                        {visitor.phone || visitor.location || "Sem contato"}
                      </p>
                      <p className="text-xs text-muted">
                        {visitor.how_heard || "Origem não informada"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        className="secondary-button min-h-9 px-3 py-2"
                        onClick={() => startEdit(visitor)}
                        type="button"
                      >
                        <Edit3 aria-hidden="true" size={15} />
                        Editar
                      </button>
                      <button
                        className="danger-button min-h-9 px-3 py-2"
                        disabled={deletingVisitorId === visitor.id}
                        onClick={() => handleDelete(visitor)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                        {deletingVisitorId === visitor.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
