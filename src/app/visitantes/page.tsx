"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Edit3, FileDown, FileText, MessageCircle, Save, Search, UserPlus, X } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { PhoneInput } from "@/components/PhoneInput";
import { Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";
import { findPotentialDuplicate, isValidBrazilPhone, normalizeBrazilPhone } from "@/lib/duplicates";
import { datedFileName, downloadExcelWorkbook } from "@/lib/exports";
import { authorizeDataExport } from "@/lib/exportAudit";
import { supabase } from "@/lib/supabase";
import type { Visitor, VisitorSensitiveData } from "@/lib/types";
import { getThankYouWhatsAppUrl } from "@/lib/whatsapp";

const initialForm = {
  full_name: "",
  phone: "",
  location: "",
  denomination_choice: "nao_informado" as "nao_informado" | "adventista" | "outra",
  denomination_other: "",
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
  const { profile, session } = useAuth();
  const { settings } = useSystemSettings();
  const canArchiveVisitors = profile?.role === "lideranca";
  const canExportVisitors = profile?.role === "lideranca";
  const [form, setForm] = useState(initialForm);
  const [editingVisitorId, setEditingVisitorId] = useState<string | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [sensitiveByVisitor, setSensitiveByVisitor] = useState<
    Record<string, Pick<VisitorSensitiveData, "prayer_request" | "notes">>
  >({});
  const [filters, setFilters] = useState(initialFilters);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingVisitorId, setDeletingVisitorId] = useState<string | null>(null);

  const loadVisitors = useCallback(async () => {
    const { data } = await supabase
      .from("visitors")
      .select("*")
      .is("archived_at", null)
      .order("full_name", { ascending: true })
      .limit(500);

    setVisitors((data ?? []) as Visitor[]);

    if (profile?.role === "lideranca") {
      const { data: sensitiveData } = await supabase
        .from("visitor_sensitive_data")
        .select("visitor_id, prayer_request, notes");
      setSensitiveByVisitor(
        Object.fromEntries(
          ((sensitiveData ?? []) as Pick<
            VisitorSensitiveData,
            "visitor_id" | "prayer_request" | "notes"
          >[]).map(({ visitor_id, prayer_request, notes }) => [
            visitor_id,
            { prayer_request, notes }
          ])
        )
      );
    } else {
      setSensitiveByVisitor({});
    }
  }, [profile?.role]);

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
          visitor.denomination,
          visitor.how_heard,
          sensitiveByVisitor[visitor.id]?.prayer_request,
          sensitiveByVisitor[visitor.id]?.notes
        ].some((value) => normalizeFilter(value).includes(search));
      const matchesLocation = !location || normalizeFilter(visitor.location).includes(location);
      const matchesHowHeard = !howHeard || normalizeFilter(visitor.how_heard).includes(howHeard);

      return matchesSearch && matchesLocation && matchesHowHeard;
    });
  }, [filters, sensitiveByVisitor, visitors]);

  function resetForm() {
    setForm(initialForm);
    setEditingVisitorId(null);
  }

  function startEdit(visitor: Visitor) {
    const sensitive = sensitiveByVisitor[visitor.id];
    setEditingVisitorId(visitor.id);
    setForm({
      full_name: visitor.full_name,
      phone: visitor.phone ?? "",
      location: visitor.location ?? "",
      denomination_choice:
        !visitor.denomination
          ? "nao_informado"
          : normalizeFilter(visitor.denomination) === "adventista"
            ? "adventista"
            : "outra",
      denomination_other:
        visitor.denomination && normalizeFilter(visitor.denomination) !== "adventista"
          ? visitor.denomination
          : "",
      how_heard: visitor.how_heard ?? "",
      prayer_request: sensitive?.prayer_request ?? "",
      notes: sensitive?.notes ?? ""
    });
    setMessage("Editando visitante selecionado.");
    document.getElementById("visitor-form")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    if (!isValidBrazilPhone(form.phone)) {
      setMessage("Informe um telefone válido com DDD, por exemplo: (71) 99999-9999.");
      setIsSubmitting(false);
      return;
    }

    const payload = {
      full_name: form.full_name.trim(),
      phone: normalizeBrazilPhone(form.phone) || null,
      location: form.location.trim() || null,
      denomination:
        form.denomination_choice === "nao_informado"
          ? null
          : form.denomination_choice === "adventista"
            ? "Adventista"
            : form.denomination_other.trim() || null,
      how_heard: form.how_heard.trim() || null
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

    let visitorId = editingVisitorId;
    let visitorError = null;

    if (editingVisitorId) {
      const { error } = await supabase.from("visitors").update(payload).eq("id", editingVisitorId);
      visitorError = error;
    } else {
      const { data, error } = await supabase
        .from("visitors")
        .insert({ ...payload, created_by: session?.user.id ?? null })
        .select("id")
        .single();
      visitorError = error;
      visitorId = data?.id ?? null;
    }

    if (visitorError || !visitorId) {
      setIsSubmitting(false);
      setMessage(
        editingVisitorId
          ? "Não foi possível atualizar o visitante. Verifique se o SQL 15 foi executado no Supabase."
          : "Não foi possível cadastrar o visitante. Verifique se o SQL 15 foi executado no Supabase."
      );
      return;
    }

    if (profile?.role === "lideranca") {
      const { error: sensitiveError } = await supabase.from("visitor_sensitive_data").upsert({
        visitor_id: visitorId,
        prayer_request: form.prayer_request.trim() || null,
        notes: form.notes.trim() || null,
        created_by: session?.user.id ?? null,
        updated_by: session?.user.id ?? null
      });
      if (sensitiveError) {
        setIsSubmitting(false);
        setMessage("Cadastro salvo, mas os dados pastorais não foram gravados. Rode o SQL 19 no Supabase.");
        return;
      }
    }

    setIsSubmitting(false);

    setMessage(
      editingVisitorId ? "Visitante atualizado com sucesso." : "Visitante cadastrado com sucesso."
    );
    resetForm();
    await loadVisitors();
  }

  async function handleDelete(visitor: Visitor) {
    if (!canArchiveVisitors) return;

    const confirmed = window.confirm(
      `Arquivar o cadastro de ${visitor.full_name}? As presenças e acompanhamentos serão preservados.`
    );

    if (!confirmed) return;

    setMessage("");
    setDeletingVisitorId(visitor.id);

    const { error } = await supabase.from("visitors").update({ archived_at: new Date().toISOString() }).eq("id", visitor.id);

    setDeletingVisitorId(null);

    if (error) {
      setMessage("Não foi possível arquivar o visitante. Execute o SQL 26 no Supabase.");
      return;
    }

    if (editingVisitorId === visitor.id) {
      resetForm();
    }

    setMessage("Visitante arquivado com sucesso.");
    await loadVisitors();
  }

  async function handleDownloadVisitorsExcel() {
    if (!canExportVisitors) return;

    const fileName = datedFileName("visitantes", "xlsx");
    const authorized = await authorizeDataExport({
      userId: session?.user.id,
      userRole: profile?.role,
      exportType: profile?.role === "lideranca" ? "visitantes_completo" : "visitantes_reduzido",
      fileName,
      recordCount: filteredVisitors.length,
      filters
    });
    if (!authorized) return;

    await downloadExcelWorkbook(fileName, [
      {
        name: "Visitantes",
        rows: filteredVisitors.map((visitor) => ({
          Nome: visitor.full_name,
          WhatsApp: visitor.phone ?? "",
          "Cidade/bairro": visitor.location ?? "",
          Denominação: visitor.denomination ?? "",
          "Como conheceu": visitor.how_heard ?? "",
          ...(profile?.role === "lideranca"
            ? {
                "Pedido de oração": sensitiveByVisitor[visitor.id]?.prayer_request ?? "",
                "Observações pastorais": sensitiveByVisitor[visitor.id]?.notes ?? ""
              }
            : {}),
          "Criado em": new Date(visitor.created_at).toLocaleDateString("pt-BR")
        }))
      }
    ]);
  }

  return (
    <div>
      <PageHeader
        action={
          canExportVisitors ? (
            <button
              className="secondary-button"
              disabled={filteredVisitors.length === 0}
              onClick={handleDownloadVisitorsExcel}
              type="button"
            >
              <FileDown aria-hidden="true" size={17} />
              Baixar Excel
            </button>
          ) : undefined
        }
        description="Registre novos visitantes e preserve as informações necessárias para o acolhimento."
        eyebrow="Cadastro"
        title="Visitantes"
      />

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
                <PhoneInput onChange={(phone) => setForm({ ...form, phone })} value={form.phone} />
              </Field>
              <Field label="Cidade/bairro">
                <input
                  className="field-input"
                  onChange={(event) => setForm({ ...form, location: event.target.value })}
                  value={form.location}
                />
              </Field>
            </div>

            <Field label="Denominação">
              <select
                className="field-input"
                onChange={(event) =>
                  setForm({
                    ...form,
                    denomination_choice: event.target.value as
                      | "nao_informado"
                      | "adventista"
                      | "outra",
                    denomination_other:
                      event.target.value === "outra" ? form.denomination_other : ""
                  })
                }
                value={form.denomination_choice}
              >
                <option value="nao_informado">Não informado</option>
                <option value="adventista">Adventista</option>
                <option value="outra">Outra</option>
              </select>
            </Field>

            {form.denomination_choice === "outra" ? (
              <Field label="Qual denominação?">
                <input
                  className="field-input"
                  onChange={(event) =>
                    setForm({ ...form, denomination_other: event.target.value })
                  }
                  placeholder="Digite o nome da denominação"
                  required
                  value={form.denomination_other}
                />
              </Field>
            ) : null}

            <Field label="Como conheceu a igreja">
              <input
                className="field-input"
                onChange={(event) => setForm({ ...form, how_heard: event.target.value })}
                value={form.how_heard}
              />
            </Field>

            {profile?.role === "lideranca" ? (
              <div className="grid gap-4 rounded-card border border-forest/20 bg-forest/5 p-4">
                <p className="text-sm font-semibold text-ink">Área pastoral — somente liderança</p>
                <Field label="Pedido de oração">
                  <textarea
                    className="field-input min-h-24 resize-y"
                    onChange={(event) => setForm({ ...form, prayer_request: event.target.value })}
                    value={form.prayer_request}
                  />
                </Field>
                <Field label="Observações pastorais">
                  <textarea
                    className="field-input min-h-24 resize-y"
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    value={form.notes}
                  />
                </Field>
              </div>
            ) : null}

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
              filteredVisitors.map((visitor) => {
                const whatsappUrl = getThankYouWhatsAppUrl(
                  visitor.phone,
                  visitor.full_name,
                  "visitante",
                  settings.visitor_thank_you_message,
                  settings.church_name
                );

                return (
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
                      <p className="text-xs text-muted">
                        Denominação: {visitor.denomination || "Não informada"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      {profile?.role === "lideranca" ? (
                        <Link className="secondary-button min-h-9 px-3 py-2" href={`/pessoas/visitante/${visitor.id}`}>
                          <FileText aria-hidden="true" size={15} />
                          Ver ficha
                        </Link>
                      ) : null}
                      {whatsappUrl ? (
                        <a
                          className="primary-button min-h-9 px-3 py-2"
                          href={whatsappUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <MessageCircle aria-hidden="true" size={15} />
                          Agradecer
                        </a>
                      ) : null}
                      <button
                        className="secondary-button min-h-9 px-3 py-2"
                        onClick={() => startEdit(visitor)}
                        type="button"
                      >
                        <Edit3 aria-hidden="true" size={15} />
                        Editar
                      </button>
                      {canArchiveVisitors ? (
                        <button
                          className="secondary-button min-h-9 px-3 py-2"
                          disabled={deletingVisitorId === visitor.id}
                          onClick={() => handleDelete(visitor)}
                          type="button"
                        >
                          <Archive aria-hidden="true" size={15} />
                          {deletingVisitorId === visitor.id ? "Arquivando..." : "Arquivar"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
