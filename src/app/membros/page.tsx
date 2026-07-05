"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Edit3,
  FileSpreadsheet,
  Save,
  Search,
  Trash2,
  Upload,
  UsersRound,
  X
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import {
  prepareMemberImportRows,
  readMemberImportFile,
  type MemberImportRow
} from "@/lib/memberImport";
import { supabase } from "@/lib/supabase";
import type { Member, MemberStatus } from "@/lib/types";

const initialForm = {
  full_name: "",
  phone: "",
  neighborhood: "",
  ministry: "",
  status: "ativo" as MemberStatus,
  notes: ""
};

const initialFilters = {
  search: "",
  status: "todos" as MemberStatus | "todos",
  neighborhood: "",
  ministry: ""
};

function normalizeFilter(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function MembersPage() {
  return (
    <AuthGate allowedRoles={["recepcao", "lideranca"]}>
      <MembersContent />
    </AuthGate>
  );
}

function MembersContent() {
  const { profile, session } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<MemberImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [isReadingImport, setIsReadingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const loadMembers = useCallback(async () => {
    const { data } = await supabase
      .from("members")
      .select("*")
      .order("full_name", { ascending: true })
      .limit(500);

    setMembers((data ?? []) as Member[]);
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const filteredMembers = useMemo(() => {
    const search = normalizeFilter(filters.search);
    const neighborhood = normalizeFilter(filters.neighborhood);
    const ministry = normalizeFilter(filters.ministry);

    return members.filter((member) => {
      const matchesSearch =
        !search ||
        [
          member.full_name,
          member.phone,
          member.neighborhood,
          member.ministry,
          member.notes
        ].some((value) => normalizeFilter(value).includes(search));
      const matchesStatus = filters.status === "todos" || member.status === filters.status;
      const matchesNeighborhood =
        !neighborhood || normalizeFilter(member.neighborhood).includes(neighborhood);
      const matchesMinistry = !ministry || normalizeFilter(member.ministry).includes(ministry);

      return matchesSearch && matchesStatus && matchesNeighborhood && matchesMinistry;
    });
  }, [filters, members]);

  const validImportRows = useMemo(
    () => importRows.filter((row) => row.errors.length === 0 && !row.isDuplicate),
    [importRows]
  );

  const importProblemCount = importRows.length - validImportRows.length;
  const canDeleteMembers = profile?.role === "lideranca";

  function resetForm() {
    setForm(initialForm);
    setEditingMemberId(null);
  }

  function startEdit(member: Member) {
    setEditingMemberId(member.id);
    setForm({
      full_name: member.full_name,
      phone: member.phone ?? "",
      neighborhood: member.neighborhood ?? "",
      ministry: member.ministry ?? "",
      status: member.status,
      notes: member.notes ?? ""
    });
    setMessage("Editando membro selecionado.");
    document.getElementById("member-form")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      neighborhood: form.neighborhood.trim() || null,
      ministry: form.ministry.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null
    };

    const { error } = editingMemberId
      ? await supabase.from("members").update(payload).eq("id", editingMemberId)
      : await supabase.from("members").insert({
          ...payload,
          created_by: session?.user.id ?? null
        });

    setIsSubmitting(false);

    if (error) {
      setMessage(
        editingMemberId
          ? "Não foi possível atualizar o membro."
          : "Não foi possível cadastrar o membro."
      );
      return;
    }

    setMessage(editingMemberId ? "Membro atualizado com sucesso." : "Membro cadastrado com sucesso.");
    resetForm();
    await loadMembers();
  }

  async function handleDelete(member: Member) {
    const confirmed = window.confirm(
      `Excluir o cadastro de ${member.full_name}? As presenças antigas continuarão no histórico como membro removido.`
    );

    if (!confirmed) return;

    setDeletingMemberId(member.id);
    setMessage("");

    const { error } = await supabase.from("members").delete().eq("id", member.id);

    setDeletingMemberId(null);

    if (error) {
      setMessage("Não foi possível excluir o membro. Rode o SQL 11 no Supabase e tente novamente.");
      return;
    }

    if (editingMemberId === member.id) {
      resetForm();
    }

    setMessage("Membro excluído com sucesso.");
    await loadMembers();
  }

  async function handleImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setIsReadingImport(true);
    setImportMessage("");
    setImportFileName(file.name);
    setImportRows([]);

    try {
      const rawRows = await readMemberImportFile(file);
      const preparedRows = prepareMemberImportRows(rawRows, members);

      setImportRows(preparedRows);
      setImportMessage(
        preparedRows.length > 0
          ? `${preparedRows.length} linhas encontradas para revisão.`
          : "Nenhum cadastro encontrado no arquivo."
      );
    } catch (error) {
      setImportMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível ler o arquivo selecionado."
      );
    }

    setIsReadingImport(false);
  }

  async function handleBulkImport() {
    if (validImportRows.length === 0 || isImporting) return;

    setIsImporting(true);
    setImportMessage("");

    const payload = validImportRows.map((row) => ({
      full_name: row.full_name,
      phone: row.phone || null,
      neighborhood: row.neighborhood || null,
      ministry: row.ministry || null,
      status: row.status,
      notes: row.notes || null,
      created_by: session?.user.id ?? null
    }));

    const chunkSize = 100;

    for (let index = 0; index < payload.length; index += chunkSize) {
      const chunk = payload.slice(index, index + chunkSize);
      const { error } = await supabase.from("members").insert(chunk);

      if (error) {
        setImportMessage("Não foi possível importar todos os membros.");
        setIsImporting(false);
        return;
      }
    }

    setImportMessage(`${validImportRows.length} membros importados com sucesso.`);
    setImportRows([]);
    setImportFileName("");
    setIsImporting(false);
    await loadMembers();
  }

  return (
    <div>
      <PageHeader eyebrow="Cadastro" title="Membros" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <form className="grid gap-4" id="member-form" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">
                  {editingMemberId ? "Editar membro" : "Novo membro"}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {editingMemberId
                    ? "Corrija os dados e salve as alterações."
                    : "Cadastre os dados principais do membro."}
                </p>
              </div>
              {editingMemberId ? (
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
              <Field label="Bairro">
                <input
                  className="field-input"
                  onChange={(event) => setForm({ ...form, neighborhood: event.target.value })}
                  value={form.neighborhood}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ministério">
                <input
                  className="field-input"
                  onChange={(event) => setForm({ ...form, ministry: event.target.value })}
                  value={form.ministry}
                />
              </Field>
              <Field label="Status">
                <select
                  className="field-input"
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value as MemberStatus })
                  }
                  value={form.status}
                >
                  <option value="ativo">Ativo</option>
                  <option value="afastado">Afastado</option>
                  <option value="transferido">Transferido</option>
                </select>
              </Field>
            </div>

            <Field label="Observações">
              <textarea
                className="field-input min-h-28 resize-y"
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
                : editingMemberId
                  ? "Salvar alterações"
                  : "Salvar membro"}
            </button>
          </form>
          </section>

          <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <FileSpreadsheet aria-hidden="true" size={19} />
                  <h2 className="text-base font-semibold text-ink">Importar membros em massa</h2>
                </div>
                <p className="text-sm leading-6 text-muted">
                  Envie Excel, CSV ou PDF com colunas como Nome, Telefone, Bairro, Ministério,
                  Status e Observações.
                </p>
              </div>
              <label className="primary-button w-full cursor-pointer sm:w-auto">
                <Upload aria-hidden="true" size={18} />
                {isReadingImport ? "Lendo..." : "Escolher arquivo"}
                <input
                  accept=".xlsx,.xls,.csv,.txt,.pdf"
                  className="sr-only"
                  disabled={isReadingImport || isImporting}
                  onChange={handleImportFileChange}
                  type="file"
                />
              </label>
            </div>

            <div className="mb-4 rounded-card border border-line bg-paper p-3 text-sm leading-6 text-muted">
              <p className="font-medium text-ink">Modelo recomendado de colunas:</p>
              <p>Nome | Telefone | Bairro | Ministério | Status | Observações</p>
              <p>Status pode ser: ativo, afastado ou transferido.</p>
              <p>PDF precisa ter texto/tabela. PDF escaneado como imagem pode não ser lido.</p>
            </div>

            {importMessage ? (
              <Notice
                title={importMessage}
                tone={importMessage.includes("sucesso") ? "success" : "warning"}
              />
            ) : null}

            {importRows.length > 0 ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">{importFileName}</p>
                    <p className="text-sm text-muted">
                      {validImportRows.length} prontos para importar
                      {importProblemCount > 0 ? `, ${importProblemCount} ignorados` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="secondary-button min-h-10 px-3 py-2"
                      disabled={isImporting}
                      onClick={() => {
                        setImportRows([]);
                        setImportFileName("");
                        setImportMessage("");
                      }}
                      type="button"
                    >
                      <X aria-hidden="true" size={17} />
                      Limpar
                    </button>
                    <button
                      className="primary-button min-h-10 px-3 py-2"
                      disabled={validImportRows.length === 0 || isImporting}
                      onClick={handleBulkImport}
                      type="button"
                    >
                      <Upload aria-hidden="true" size={17} />
                      {isImporting ? "Importando..." : `Importar ${validImportRows.length}`}
                    </button>
                  </div>
                </div>

                <div className="max-h-[420px] overflow-y-auto rounded-card border border-line">
                  {importRows.map((row) => {
                    const hasProblem = row.errors.length > 0 || row.isDuplicate;

                    return (
                      <div className="border-b border-line p-3 last:border-0" key={row.id}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <p className="font-medium text-ink">
                                {row.full_name || "Sem nome"}
                              </p>
                              <StatusBadge tone={hasProblem ? "warning" : "success"}>
                                {hasProblem ? "Ignorado" : "Pronto"}
                              </StatusBadge>
                            </div>
                            <p className="text-sm text-muted">
                              {row.phone || "Sem telefone"} - {row.neighborhood || "Sem bairro"}
                            </p>
                            <p className="text-xs text-muted">
                              {row.ministry || "Sem ministério"} - {row.status}
                            </p>
                          </div>

                          {hasProblem ? (
                            <div className="flex shrink-0 items-start gap-2 text-sm text-muted sm:max-w-48">
                              <AlertCircle aria-hidden="true" className="mt-0.5 text-gold" size={16} />
                              <span>
                                {[...row.errors, row.isDuplicate ? "Possível duplicado" : ""]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UsersRound aria-hidden="true" size={19} />
              <h2 className="text-base font-semibold text-ink">Membros cadastrados</h2>
            </div>
            <StatusBadge tone="neutral">{filteredMembers.length}</StatusBadge>
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
                placeholder="Nome, telefone, bairro..."
                value={filters.search}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Field label="Status">
                <select
                  className="field-input"
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      status: event.target.value as MemberStatus | "todos"
                    })
                  }
                  value={filters.status}
                >
                  <option value="todos">Todos</option>
                  <option value="ativo">Ativo</option>
                  <option value="afastado">Afastado</option>
                  <option value="transferido">Transferido</option>
                </select>
              </Field>
              <Field label="Bairro">
                <input
                  className="field-input"
                  onChange={(event) =>
                    setFilters({ ...filters, neighborhood: event.target.value })
                  }
                  value={filters.neighborhood}
                />
              </Field>
            </div>

            <Field label="Ministério">
              <input
                className="field-input"
                onChange={(event) => setFilters({ ...filters, ministry: event.target.value })}
                value={filters.ministry}
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
            {filteredMembers.length === 0 ? (
              <p className="text-sm text-muted">Nenhum membro encontrado.</p>
            ) : (
              filteredMembers.map((member) => (
                <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={member.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{member.full_name}</p>
                      <p className="text-sm text-muted">{member.phone || "Sem telefone"}</p>
                      <p className="text-xs text-muted">
                        {member.neighborhood || "Sem bairro"} - {member.ministry || "Sem ministério"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusBadge tone={member.status === "ativo" ? "success" : "warning"}>
                        {member.status}
                      </StatusBadge>
                      <button
                        className="secondary-button min-h-9 px-3 py-2"
                        onClick={() => startEdit(member)}
                        type="button"
                      >
                        <Edit3 aria-hidden="true" size={15} />
                        Editar
                      </button>
                      {canDeleteMembers ? (
                        <button
                          className="danger-button min-h-9 px-3 py-2"
                          disabled={deletingMemberId === member.id}
                          onClick={() => handleDelete(member)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={15} />
                          {deletingMemberId === member.id ? "Excluindo..." : "Excluir"}
                        </button>
                      ) : null}
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
