"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Edit3,
  FileDown,
  FileSpreadsheet,
  MessageCircle,
  Save,
  Search,
  Trash2,
  Upload,
  UserPlus,
  X
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { findPotentialDuplicate, normalizeBrazilPhone } from "@/lib/duplicates";
import { formatDateBR, todayInputValue } from "@/lib/date";
import { datedFileName, downloadExcelWorkbook } from "@/lib/exports";
import {
  prepareMemberImportRows,
  readMemberImportFile,
  type MemberImportRow
} from "@/lib/memberImport";
import { supabase } from "@/lib/supabase";
import type { Member, MemberStatus, Pastor, SpecialMusic, Visitor } from "@/lib/types";
import { getThankYouWhatsAppUrl } from "@/lib/whatsapp";

type RegistryKind = "membro" | "visitante" | "pastor" | "musica";

type RegistryItem = {
  id: string;
  kind: RegistryKind;
  title: string;
  contact: string;
  detail: string;
  created_at: string;
  raw: Member | Visitor | Pastor | SpecialMusic;
};

const kindOptions: { value: RegistryKind; label: string }[] = [
  { value: "membro", label: "Membro" },
  { value: "visitante", label: "Visitante" },
  { value: "pastor", label: "Pastor" },
  { value: "musica", label: "Música Especial" }
];

const initialForm = {
  kind: "membro" as RegistryKind,
  full_name: "",
  phone: "",
  neighborhood: "",
  ministry: "",
  status: "ativo" as MemberStatus,
  location: "",
  how_heard: "",
  prayer_request: "",
  notes: "",
  district: "",
  performer_name: "",
  contact: "",
  church: "",
  visit_date: todayInputValue()
};

function normalizeFilter(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function registryLabel(kind: RegistryKind) {
  return kindOptions.find((option) => option.value === kind)?.label ?? kind;
}

function registryTone(kind: RegistryKind): "neutral" | "success" | "warning" | "danger" {
  if (kind === "membro") return "success";
  if (kind === "visitante") return "neutral";
  if (kind === "pastor") return "warning";
  return "danger";
}

function registryItemKey(item: Pick<RegistryItem, "kind" | "id">) {
  return `${item.kind}:${item.id}`;
}

export default function UnifiedRegistryPage() {
  return (
    <AuthGate allowedRoles={["recepcao", "lideranca"]}>
      <UnifiedRegistryContent />
    </AuthGate>
  );
}

function UnifiedRegistryContent() {
  const { profile, session } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState<{ id: string; kind: RegistryKind } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [pastors, setPastors] = useState<Pastor[]>([]);
  const [specialMusic, setSpecialMusic] = useState<SpecialMusic[]>([]);
  const [kindFilter, setKindFilter] = useState<RegistryKind | "todos">("todos");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [importRows, setImportRows] = useState<MemberImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [isReadingImport, setIsReadingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const canDelete = profile?.role === "lideranca";

  const loadRegistries = useCallback(async () => {
    const [membersResponse, visitorsResponse, pastorsResponse, specialMusicResponse] =
      await Promise.all([
        supabase.from("members").select("*").order("full_name", { ascending: true }).limit(500),
        supabase.from("visitors").select("*").order("full_name", { ascending: true }).limit(500),
        supabase.from("pastors").select("*").order("full_name", { ascending: true }).limit(500),
        supabase
          .from("special_music")
          .select("*")
          .order("visit_date", { ascending: false })
          .order("performer_name", { ascending: true })
          .limit(500)
      ]);

    setMembers((membersResponse.data ?? []) as Member[]);
    setVisitors((visitorsResponse.data ?? []) as Visitor[]);
    setPastors((pastorsResponse.data ?? []) as Pastor[]);
    setSpecialMusic((specialMusicResponse.data ?? []) as SpecialMusic[]);

    if (pastorsResponse.error || specialMusicResponse.error) {
      setMessage("Rode o SQL 13 no Supabase para ativar Pastor e Música Especial.");
    }
  }, []);

  useEffect(() => {
    loadRegistries();
  }, [loadRegistries]);

  const registryItems = useMemo<RegistryItem[]>(() => {
    const memberItems: RegistryItem[] = members.map((member) => ({
      id: member.id,
      kind: "membro",
      title: member.full_name,
      contact: member.phone ?? "Sem telefone",
      detail: `${member.neighborhood || "Sem bairro"} - ${member.ministry || "Sem ministério"}`,
      created_at: member.created_at,
      raw: member
    }));
    const visitorItems: RegistryItem[] = visitors.map((visitor) => ({
      id: visitor.id,
      kind: "visitante",
      title: visitor.full_name,
      contact: visitor.phone ?? "Sem telefone",
      detail: visitor.location || visitor.how_heard || "Sem cidade/bairro",
      created_at: visitor.created_at,
      raw: visitor
    }));
    const pastorItems: RegistryItem[] = pastors.map((pastor) => ({
      id: pastor.id,
      kind: "pastor",
      title: pastor.full_name,
      contact: pastor.phone ?? "Sem telefone",
      detail: pastor.district || "Sem distrito",
      created_at: pastor.created_at,
      raw: pastor
    }));
    const musicItems: RegistryItem[] = specialMusic.map((music) => ({
      id: music.id,
      kind: "musica",
      title: music.performer_name,
      contact: music.contact ?? "Sem contato",
      detail: `${music.church || "Sem igreja"} - ${formatDateBR(music.visit_date)}`,
      created_at: music.created_at,
      raw: music
    }));

    return [...memberItems, ...visitorItems, ...pastorItems, ...musicItems].sort(
      (a, b) => a.title.localeCompare(b.title, "pt-BR")
    );
  }, [members, pastors, specialMusic, visitors]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalizeFilter(search);

    return registryItems.filter((item) => {
      const matchesKind = kindFilter === "todos" || item.kind === kindFilter;
      const matchesSearch =
        !normalizedSearch ||
        [item.title, item.contact, item.detail, registryLabel(item.kind)]
          .some((value) => normalizeFilter(value).includes(normalizedSearch));

      return matchesKind && matchesSearch;
    });
  }, [kindFilter, registryItems, search]);

  const validImportRows = useMemo(
    () => importRows.filter((row) => row.errors.length === 0 && !row.isDuplicate),
    [importRows]
  );

  const importProblemCount = importRows.length - validImportRows.length;
  const selectedItems = useMemo(
    () => registryItems.filter((item) => selectedKeys.has(registryItemKey(item))),
    [registryItems, selectedKeys]
  );
  const selectedFilteredKeys = useMemo(
    () => filteredItems.map((item) => registryItemKey(item)),
    [filteredItems]
  );
  const allFilteredSelected =
    selectedFilteredKeys.length > 0 &&
    selectedFilteredKeys.every((key) => selectedKeys.has(key));

  function resetForm(kind = form.kind) {
    setForm({ ...initialForm, kind });
    setEditing(null);
  }

  function startEdit(item: RegistryItem) {
    setEditing({ id: item.id, kind: item.kind });

    if (item.kind === "membro") {
      const member = item.raw as Member;
      setForm({
        ...initialForm,
        kind: "membro",
        full_name: member.full_name,
        phone: member.phone ?? "",
        neighborhood: member.neighborhood ?? "",
        ministry: member.ministry ?? "",
        status: member.status,
        notes: member.notes ?? ""
      });
    }

    if (item.kind === "visitante") {
      const visitor = item.raw as Visitor;
      setForm({
        ...initialForm,
        kind: "visitante",
        full_name: visitor.full_name,
        phone: visitor.phone ?? "",
        location: visitor.location ?? "",
        how_heard: visitor.how_heard ?? "",
        prayer_request: visitor.prayer_request ?? "",
        notes: visitor.notes ?? ""
      });
    }

    if (item.kind === "pastor") {
      const pastor = item.raw as Pastor;
      setForm({
        ...initialForm,
        kind: "pastor",
        full_name: pastor.full_name,
        phone: pastor.phone ?? "",
        district: pastor.district ?? ""
      });
    }

    if (item.kind === "musica") {
      const music = item.raw as SpecialMusic;
      setForm({
        ...initialForm,
        kind: "musica",
        performer_name: music.performer_name,
        contact: music.contact ?? "",
        church: music.church ?? "",
        visit_date: music.visit_date
      });
    }

    setMessage("Editando cadastro selecionado.");
    document.getElementById("unified-registry-form")?.scrollIntoView({ behavior: "smooth" });
  }

  function toggleSelection(item: RegistryItem) {
    const key = registryItemKey(item);

    setSelectedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function toggleFilteredSelection() {
    setSelectedKeys((current) => {
      const next = new Set(current);

      if (allFilteredSelected) {
        selectedFilteredKeys.forEach((key) => next.delete(key));
      } else {
        selectedFilteredKeys.forEach((key) => next.add(key));
      }

      return next;
    });
  }

  function hasDuplicatePastor(payload: { full_name: string; phone: string | null }) {
    const name = normalizeFilter(payload.full_name);
    const phone = normalizeBrazilPhone(payload.phone ?? "");

    return pastors.some((pastor) => {
      if (editing?.kind === "pastor" && editing.id === pastor.id) return false;
      return normalizeFilter(pastor.full_name) === name || Boolean(phone && pastor.phone === phone);
    });
  }

  function hasDuplicateMusic(payload: { performer_name: string; contact: string | null; visit_date: string }) {
    const name = normalizeFilter(payload.performer_name);
    const contact = normalizeFilter(payload.contact);

    return specialMusic.some((music) => {
      if (editing?.kind === "musica" && editing.id === music.id) return false;
      return (
        normalizeFilter(music.performer_name) === name &&
        normalizeFilter(music.contact) === contact &&
        music.visit_date === payload.visit_date
      );
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    let errorMessage = "";

    if (form.kind === "membro") {
      const payload = {
        full_name: form.full_name.trim(),
        phone: normalizeBrazilPhone(form.phone) || null,
        neighborhood: form.neighborhood.trim() || null,
        ministry: form.ministry.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null
      };
      const duplicate = findPotentialDuplicate(members, payload, editing?.kind === "membro" ? editing.id : null);

      if (duplicate) {
        errorMessage = `${duplicate.full_name} já está cadastrado como membro.`;
      } else if (editing?.kind === "membro") {
        const { error } = await supabase.from("members").update(payload).eq("id", editing.id);
        if (error) errorMessage = "Não foi possível atualizar o membro.";
      } else {
        const { error } = await supabase.from("members").insert({
          ...payload,
          created_by: session?.user.id ?? null
        });
        if (error) errorMessage = "Não foi possível cadastrar o membro.";
      }
    }

    if (form.kind === "visitante") {
      const payload = {
        full_name: form.full_name.trim(),
        phone: normalizeBrazilPhone(form.phone) || null,
        location: form.location.trim() || null,
        how_heard: form.how_heard.trim() || null,
        prayer_request: form.prayer_request.trim() || null,
        notes: form.notes.trim() || null
      };
      const duplicate = findPotentialDuplicate(visitors, payload, editing?.kind === "visitante" ? editing.id : null);

      if (duplicate) {
        errorMessage = `${duplicate.full_name} já está cadastrado como visitante.`;
      } else if (editing?.kind === "visitante") {
        const { error } = await supabase.from("visitors").update(payload).eq("id", editing.id);
        if (error) errorMessage = "Não foi possível atualizar o visitante.";
      } else {
        const { error } = await supabase.from("visitors").insert({
          ...payload,
          created_by: session?.user.id ?? null
        });
        if (error) errorMessage = "Não foi possível cadastrar o visitante.";
      }
    }

    if (form.kind === "pastor") {
      const payload = {
        full_name: form.full_name.trim(),
        phone: normalizeBrazilPhone(form.phone) || null,
        district: form.district.trim() || null
      };

      if (hasDuplicatePastor(payload)) {
        errorMessage = "Possível duplicidade: este pastor já está cadastrado.";
      } else if (editing?.kind === "pastor") {
        const { error } = await supabase.from("pastors").update(payload).eq("id", editing.id);
        if (error) errorMessage = "Não foi possível atualizar o pastor. Rode o SQL 13 no Supabase.";
      } else {
        const { error } = await supabase.from("pastors").insert({
          ...payload,
          created_by: session?.user.id ?? null
        });
        if (error) errorMessage = "Não foi possível cadastrar o pastor. Rode o SQL 13 no Supabase.";
      }
    }

    if (form.kind === "musica") {
      const payload = {
        performer_name: form.performer_name.trim(),
        contact: form.contact.trim() || null,
        church: form.church.trim() || null,
        visit_date: form.visit_date || todayInputValue()
      };

      if (hasDuplicateMusic(payload)) {
        errorMessage = "Possível duplicidade: esta música especial já está cadastrada nesta data.";
      } else if (editing?.kind === "musica") {
        const { error } = await supabase.from("special_music").update(payload).eq("id", editing.id);
        if (error) errorMessage = "Não foi possível atualizar a música especial. Rode o SQL 13 no Supabase.";
      } else {
        const { error } = await supabase.from("special_music").insert({
          ...payload,
          created_by: session?.user.id ?? null
        });
        if (error) errorMessage = "Não foi possível cadastrar a música especial. Rode o SQL 13 no Supabase.";
      }
    }

    setIsSubmitting(false);

    if (errorMessage) {
      setMessage(errorMessage);
      return;
    }

    const savedKind = form.kind;
    setMessage(editing ? "Cadastro atualizado com sucesso." : "Cadastro salvo com sucesso.");
    resetForm(savedKind);
    await loadRegistries();
  }

  async function handleDelete(item: RegistryItem) {
    if (!canDelete) return;

    const confirmed = window.confirm(`Excluir ${item.title}?`);
    if (!confirmed) return;

    setDeletingKey(`${item.kind}:${item.id}`);
    setMessage("");

    let hasError = false;

    if (item.kind === "membro") {
      const { error } = await supabase.from("members").delete().eq("id", item.id);
      hasError = Boolean(error);
    }

    if (item.kind === "visitante") {
      const { error: attendanceError } = await supabase
        .from("attendances")
        .delete()
        .eq("person_type", "visitante")
        .eq("person_id", item.id);
      const { error } = attendanceError
        ? { error: attendanceError }
        : await supabase.from("visitors").delete().eq("id", item.id);
      hasError = Boolean(error);
    }

    if (item.kind === "pastor") {
      const { error } = await supabase.from("pastors").delete().eq("id", item.id);
      hasError = Boolean(error);
    }

    if (item.kind === "musica") {
      const { error } = await supabase.from("special_music").delete().eq("id", item.id);
      hasError = Boolean(error);
    }

    setDeletingKey(null);

    if (hasError) {
      setMessage("Não foi possível excluir. Confira as permissões ou rode o SQL necessário no Supabase.");
      return;
    }

    setMessage("Cadastro excluído com sucesso.");
    await loadRegistries();
  }

  async function handleBulkDelete() {
    if (!canDelete || selectedItems.length === 0 || isBulkDeleting) return;

    const confirmed = window.confirm(
      `Excluir ${selectedItems.length} cadastros selecionados? Esta ação não pode ser desfeita.`
    );

    if (!confirmed) return;

    setIsBulkDeleting(true);
    setMessage("");

    const selectedByKind: Record<RegistryKind, string[]> = {
      membro: [],
      visitante: [],
      pastor: [],
      musica: []
    };

    selectedItems.forEach((item) => {
      selectedByKind[item.kind].push(item.id);
    });

    let hasError = false;

    if (selectedByKind.membro.length > 0) {
      const { error } = await supabase.from("members").delete().in("id", selectedByKind.membro);
      hasError = Boolean(error);
    }

    if (!hasError && selectedByKind.visitante.length > 0) {
      const { error: attendanceError } = await supabase
        .from("attendances")
        .delete()
        .eq("person_type", "visitante")
        .in("person_id", selectedByKind.visitante);

      if (attendanceError) {
        hasError = true;
      } else {
        const { error } = await supabase.from("visitors").delete().in("id", selectedByKind.visitante);
        hasError = Boolean(error);
      }
    }

    if (!hasError && selectedByKind.pastor.length > 0) {
      const { error } = await supabase.from("pastors").delete().in("id", selectedByKind.pastor);
      hasError = Boolean(error);
    }

    if (!hasError && selectedByKind.musica.length > 0) {
      const { error } = await supabase.from("special_music").delete().in("id", selectedByKind.musica);
      hasError = Boolean(error);
    }

    setIsBulkDeleting(false);

    if (hasError) {
      setMessage("Não foi possível excluir todos os selecionados. Confira as permissões no Supabase.");
      await loadRegistries();
      return;
    }

    if (editing && selectedKeys.has(`${editing.kind}:${editing.id}`)) {
      resetForm();
    }

    setSelectedKeys(new Set());
    setMessage(`${selectedItems.length} cadastros excluídos com sucesso.`);
    await loadRegistries();
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
      phone: normalizeBrazilPhone(row.phone) || null,
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
    setKindFilter("membro");
    setIsImporting(false);
    await loadRegistries();
  }

  async function handleDownloadExcel() {
    await downloadExcelWorkbook(datedFileName("cadastros", "xlsx"), [
      {
        name: "Cadastros",
        rows: filteredItems.map((item) => ({
          Tipo: registryLabel(item.kind),
          Nome: item.title,
          Contato: item.contact,
          Detalhe: item.detail,
          "Criado em": new Date(item.created_at).toLocaleDateString("pt-BR")
        }))
      }
    ]);
  }

  return (
    <div>
      <PageHeader
        action={
          <button
            className="secondary-button"
            disabled={filteredItems.length === 0}
            onClick={handleDownloadExcel}
            type="button"
          >
            <FileDown aria-hidden="true" size={17} />
            Baixar Excel
          </button>
        }
        eyebrow="Cadastro"
        title="Cadastros"
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <form className="grid gap-4" id="unified-registry-form" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">
                  {editing ? "Editar cadastro" : "Novo cadastro"}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Escolha o tipo e preencha somente os campos necessários.
                </p>
              </div>
              {editing ? (
                <button
                  className="secondary-button min-h-10 px-3 py-2"
                  onClick={() => resetForm()}
                  type="button"
                >
                  <X aria-hidden="true" size={17} />
                  Cancelar
                </button>
              ) : null}
            </div>

            <Field label="Tipo de cadastro">
              <select
                className="field-input"
                disabled={Boolean(editing)}
                onChange={(event) => resetForm(event.target.value as RegistryKind)}
                value={form.kind}
              >
                {kindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            {form.kind !== "musica" ? (
              <>
                <Field label="Nome">
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
                  {form.kind === "pastor" ? (
                    <Field label="Distrito">
                      <input
                        className="field-input"
                        onChange={(event) => setForm({ ...form, district: event.target.value })}
                        value={form.district}
                      />
                    </Field>
                  ) : null}
                </div>
              </>
            ) : null}

            {form.kind === "membro" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Bairro">
                    <input
                      className="field-input"
                      onChange={(event) => setForm({ ...form, neighborhood: event.target.value })}
                      value={form.neighborhood}
                    />
                  </Field>
                  <Field label="Ministério">
                    <input
                      className="field-input"
                      onChange={(event) => setForm({ ...form, ministry: event.target.value })}
                      value={form.ministry}
                    />
                  </Field>
                </div>
                <Field label="Status">
                  <select
                    className="field-input"
                    onChange={(event) => setForm({ ...form, status: event.target.value as MemberStatus })}
                    value={form.status}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="afastado">Afastado</option>
                    <option value="transferido">Transferido</option>
                  </select>
                </Field>
                <Field label="Observações">
                  <textarea
                    className="field-input min-h-24 resize-y"
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    value={form.notes}
                  />
                </Field>
              </>
            ) : null}

            {form.kind === "visitante" ? (
              <>
                <Field label="Cidade/bairro">
                  <input
                    className="field-input"
                    onChange={(event) => setForm({ ...form, location: event.target.value })}
                    value={form.location}
                  />
                </Field>
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
              </>
            ) : null}

            {form.kind === "musica" ? (
              <>
                <Field label="Cantor(a) / Grupo">
                  <input
                    className="field-input"
                    onChange={(event) => setForm({ ...form, performer_name: event.target.value })}
                    required
                    value={form.performer_name}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Contato">
                    <input
                      className="field-input"
                      onChange={(event) => setForm({ ...form, contact: event.target.value })}
                      value={form.contact}
                    />
                  </Field>
                  <Field label="Igreja">
                    <input
                      className="field-input"
                      onChange={(event) => setForm({ ...form, church: event.target.value })}
                      value={form.church}
                    />
                  </Field>
                </div>
                <Field label="Data que esteve na igreja">
                  <input
                    className="field-input"
                    onChange={(event) => setForm({ ...form, visit_date: event.target.value })}
                    required
                    type="date"
                    value={form.visit_date}
                  />
                </Field>
              </>
            ) : null}

            {message ? (
              <Notice title={message} tone={message.includes("sucesso") ? "success" : "warning"} />
            ) : null}

            <button className="primary-button w-full sm:w-auto" disabled={isSubmitting} type="submit">
              <Save aria-hidden="true" size={18} />
              {isSubmitting ? "Salvando..." : editing ? "Salvar alterações" : "Salvar cadastro"}
            </button>
          </form>

          {form.kind === "membro" ? (
            <div className="mt-5 border-t border-line pt-5">
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
            </div>
          ) : null}
        </section>

        <aside className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserPlus aria-hidden="true" size={19} />
              <h2 className="text-base font-semibold text-ink">Lista de cadastros</h2>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canDelete && selectedItems.length > 0 ? (
                <StatusBadge tone="warning">{selectedItems.length} selecionados</StatusBadge>
              ) : null}
              <StatusBadge tone="neutral">{filteredItems.length}</StatusBadge>
            </div>
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
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, contato, igreja..."
                value={search}
              />
            </label>

            <Field label="Tipo">
              <select
                className="field-input"
                onChange={(event) => setKindFilter(event.target.value as RegistryKind | "todos")}
                value={kindFilter}
              >
                <option value="todos">Todos</option>
                {kindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <button
              className="secondary-button min-h-10 px-3 py-2"
              onClick={() => {
                setKindFilter("todos");
                setSearch("");
              }}
              type="button"
            >
              Limpar filtros
            </button>
          </div>

          {canDelete ? (
            <div className="mb-4 rounded-card border border-line bg-paper p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  className="secondary-button min-h-10 px-3 py-2"
                  disabled={filteredItems.length === 0 || isBulkDeleting}
                  onClick={toggleFilteredSelection}
                  type="button"
                >
                  {allFilteredSelected ? "Desmarcar filtro" : "Selecionar filtro"}
                </button>
                <button
                  className="danger-button min-h-10 px-3 py-2"
                  disabled={selectedItems.length === 0 || isBulkDeleting}
                  onClick={handleBulkDelete}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                  {isBulkDeleting ? "Excluindo..." : "Excluir selecionados"}
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                A seleção usa a lista filtrada. Filtre por tipo ou nome antes de selecionar.
              </p>
            </div>
          ) : null}

          <div className="space-y-3">
            {filteredItems.length === 0 ? (
              <p className="text-sm text-muted">Nenhum cadastro encontrado.</p>
            ) : (
              filteredItems.map((item) => {
                const whatsappUrl =
                  item.kind === "visitante" || item.kind === "musica"
                    ? getThankYouWhatsAppUrl(
                        item.contact,
                        item.title,
                        item.kind
                      )
                    : null;

                return (
                <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={registryItemKey(item)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      {canDelete ? (
                        <input
                          aria-label={`Selecionar ${item.title}`}
                          checked={selectedKeys.has(registryItemKey(item))}
                          className="mt-1 h-5 w-5 shrink-0 accent-forest"
                          disabled={isBulkDeleting}
                          onChange={() => toggleSelection(item)}
                          type="checkbox"
                        />
                      ) : null}
                      <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink">{item.title}</p>
                        <StatusBadge tone={registryTone(item.kind)}>
                          {registryLabel(item.kind)}
                        </StatusBadge>
                      </div>
                      <p className="text-sm text-muted">{item.contact}</p>
                      <p className="text-xs text-muted">{item.detail}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
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
                        onClick={() => startEdit(item)}
                        type="button"
                      >
                        <Edit3 aria-hidden="true" size={15} />
                        Editar
                      </button>
                      {canDelete ? (
                        <button
                          className="danger-button min-h-9 px-3 py-2"
                          disabled={deletingKey === `${item.kind}:${item.id}`}
                          onClick={() => handleDelete(item)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={15} />
                          {deletingKey === `${item.kind}:${item.id}` ? "Excluindo..." : "Excluir"}
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
