"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, GitMerge, RefreshCw, ShieldCheck } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Notice, PageHeader, StatusBadge } from "@/components/ui";
import {
  areLikelyDuplicatePeople,
  normalizePersonName,
  normalizePhoneDigits
} from "@/lib/duplicates";
import { supabase } from "@/lib/supabase";
import type {
  Member,
  Pastor,
  PersonMergeLog,
  PersonType,
  SpecialMusic,
  Visitor
} from "@/lib/types";

type MergePerson = {
  id: string;
  kind: PersonType;
  name: string;
  phone: string | null;
  place: string | null;
  detail: string;
};

type DuplicatePair = {
  first: MergePerson;
  second: MergePerson;
};

const kindLabels: Record<PersonType, string> = {
  membro: "Membro",
  visitante: "Visitante",
  pastor: "Pastor/Pregador",
  musica: "Música especial"
};

function areLikelyDuplicates(first: MergePerson, second: MergePerson) {
  if (first.kind !== second.kind) return false;

  if (first.kind === "membro" || first.kind === "visitante") {
    return areLikelyDuplicatePeople(
      { full_name: first.name, phone: first.phone, location: first.place },
      { full_name: second.name, phone: second.phone, location: second.place }
    );
  }

  const firstPhone = normalizePhoneDigits(first.phone);
  const secondPhone = normalizePhoneDigits(second.phone);
  const samePhone = firstPhone.length >= 8 && firstPhone === secondPhone;
  const sameName = normalizePersonName(first.name) === normalizePersonName(second.name);
  return samePhone || sameName;
}

function formatMergeDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bahia"
  }).format(new Date(value));
}

export default function DuplicatesPage() {
  return (
    <AuthGate requireAdmin>
      <DuplicatesContent />
    </AuthGate>
  );
}

function DuplicatesContent() {
  const [people, setPeople] = useState<MergePerson[]>([]);
  const [history, setHistory] = useState<PersonMergeLog[]>([]);
  const [selectedKind, setSelectedKind] = useState<PersonType>("membro");
  const [primaryId, setPrimaryId] = useState("");
  const [duplicateId, setDuplicateId] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMerging, setIsMerging] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const [membersResponse, visitorsResponse, pastorsResponse, musicResponse, historyResponse] = await Promise.all([
      supabase.from("members").select("id, full_name, phone, neighborhood, ministry, status").is("archived_at", null).limit(5000),
      supabase.from("visitors").select("id, full_name, phone, location, denomination").is("archived_at", null).limit(5000),
      supabase.from("pastors").select("id, full_name, phone, district, speaker_role").is("archived_at", null).limit(5000),
      supabase.from("special_music").select("id, performer_name, contact, church, visit_date").is("archived_at", null).limit(5000),
      supabase.from("person_merge_logs").select("*").order("merged_at", { ascending: false }).limit(20)
    ]);

    if (membersResponse.error || visitorsResponse.error || pastorsResponse.error || musicResponse.error) {
      setPeople([]);
      setMessage("Não foi possível carregar os cadastros.");
      setIsLoading(false);
      return;
    }

    const members = (membersResponse.data ?? []) as Pick<Member, "id" | "full_name" | "phone" | "neighborhood" | "ministry" | "status">[];
    const visitors = (visitorsResponse.data ?? []) as Pick<Visitor, "id" | "full_name" | "phone" | "location" | "denomination">[];
    const pastors = (pastorsResponse.data ?? []) as Pick<Pastor, "id" | "full_name" | "phone" | "district" | "speaker_role">[];
    const music = (musicResponse.data ?? []) as Pick<SpecialMusic, "id" | "performer_name" | "contact" | "church" | "visit_date">[];

    const loadedPeople: MergePerson[] = [
      ...members.map((person) => ({
        id: person.id,
        kind: "membro" as const,
        name: person.full_name,
        phone: person.phone,
        place: person.neighborhood,
        detail: [person.phone, person.neighborhood, person.ministry, person.status].filter(Boolean).join(" • ") || "Sem detalhes"
      })),
      ...visitors.map((person) => ({
        id: person.id,
        kind: "visitante" as const,
        name: person.full_name,
        phone: person.phone,
        place: person.location,
        detail: [person.phone, person.location, person.denomination].filter(Boolean).join(" • ") || "Sem detalhes"
      })),
      ...pastors.map((person) => ({
        id: person.id,
        kind: "pastor" as const,
        name: person.full_name,
        phone: person.phone,
        place: person.district,
        detail: [person.phone, person.district, person.speaker_role === "pregador" ? "Pregador" : "Pastor"].filter(Boolean).join(" • ")
      })),
      ...music.map((person) => ({
        id: person.id,
        kind: "musica" as const,
        name: person.performer_name,
        phone: person.contact,
        place: person.church,
        detail: [person.contact, person.church, new Date(`${person.visit_date}T12:00:00`).toLocaleDateString("pt-BR")].filter(Boolean).join(" • ")
      }))
    ];

    setPeople(loadedPeople.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    setHistory(historyResponse.error ? [] : (historyResponse.data ?? []) as PersonMergeLog[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const suggestedPairs = useMemo(() => {
    const pairs: DuplicatePair[] = [];
    (Object.keys(kindLabels) as PersonType[]).forEach((kind) => {
      const rows = people.filter((person) => person.kind === kind);
      for (let firstIndex = 0; firstIndex < rows.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < rows.length; secondIndex += 1) {
          if (areLikelyDuplicates(rows[firstIndex], rows[secondIndex])) {
            pairs.push({ first: rows[firstIndex], second: rows[secondIndex] });
          }
        }
      }
    });

    return pairs.slice(0, 100);
  }, [people]);

  const manualPeople = useMemo(
    () => people.filter((person) => person.kind === selectedKind),
    [people, selectedKind]
  );

  async function merge(primary: MergePerson, duplicate: MergePerson) {
    if (primary.kind !== duplicate.kind || primary.id === duplicate.id) {
      setMessage("Escolha dois cadastros diferentes da mesma categoria.");
      return;
    }

    const confirmed = window.confirm(
      `Manter “${primary.name}” e unificar “${duplicate.name}”?\n\nAs presenças e os acompanhamentos serão transferidos. Esta operação não poderá ser desfeita pela tela.`
    );
    if (!confirmed) return;

    setIsMerging(true);
    setMessage("");
    const { error } = await supabase.rpc("merge_duplicate_person", {
      p_person_type: primary.kind,
      p_primary_id: primary.id,
      p_duplicate_id: duplicate.id
    });

    if (error) {
      const needsSql = error.message.includes("merge_duplicate_person") || error.code === "PGRST202";
      setMessage(needsSql
        ? "A função ainda não está ativa. Execute o arquivo SQL 33 no Supabase e tente novamente."
        : `Não foi possível unificar: ${error.message}`);
    } else {
      setMessage(`Cadastros unificados. “${primary.name}” foi mantido com os históricos reunidos.`);
      setPrimaryId("");
      setDuplicateId("");
      await loadData();
      setMessage(`Cadastros unificados. “${primary.name}” foi mantido com os históricos reunidos.`);
    }
    setIsMerging(false);
  }

  const selectedPrimary = manualPeople.find((person) => person.id === primaryId);
  const selectedDuplicate = manualPeople.find((person) => person.id === duplicateId);

  return (
    <div>
      <PageHeader
        action={
          <button className="secondary-button" disabled={isLoading || isMerging} onClick={() => void loadData()} type="button">
            <RefreshCw aria-hidden="true" size={17} /> Atualizar
          </button>
        }
        eyebrow="Administração"
        title="Cadastros duplicados"
      />

      <div className="mb-5">
        <Notice
          text="O cadastro escolhido como principal será mantido. Presenças, acompanhamentos e históricos serão transferidos antes da remoção do cadastro repetido. A operação fica registrada com o nome do administrador."
          title="Unificação segura e somente entre cadastros da mesma categoria"
          tone="warning"
        />
      </div>

      {message ? (
        <div className="mb-5">
          <Notice title={message} tone={message.startsWith("Cadastros unificados") ? "success" : "warning"} />
        </div>
      ) : null}

      <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex items-center gap-2">
          <GitMerge aria-hidden="true" className="text-wine" size={20} />
          <h2 className="text-lg font-semibold text-ink">Sugestões encontradas</h2>
          <StatusBadge tone={suggestedPairs.length ? "warning" : "success"}>{suggestedPairs.length}</StatusBadge>
        </div>
        <p className="mt-1 text-sm text-muted">Confira os dados antes de decidir qual cadastro deve permanecer.</p>

        {isLoading ? <p className="mt-5 text-sm text-muted">Analisando cadastros...</p> : null}
        {!isLoading && suggestedPairs.length === 0 ? (
          <div className="mt-5">
            <Notice title="Nenhum duplicado evidente foi encontrado." text="Se houver um caso com nomes diferentes, use a unificação manual abaixo." tone="success" />
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          {suggestedPairs.map((pair) => (
            <div className="grid gap-3 rounded-card border border-line bg-paper/50 p-3 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch" key={`${pair.first.kind}:${pair.first.id}:${pair.second.id}`}>
              <PersonChoice disabled={isMerging} onKeep={() => void merge(pair.first, pair.second)} person={pair.first} />
              <div className="flex items-center justify-center text-muted">
                <ArrowRight aria-hidden="true" className="rotate-90 lg:rotate-0" size={20} />
              </div>
              <PersonChoice disabled={isMerging} onKeep={() => void merge(pair.second, pair.first)} person={pair.second} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <h2 className="text-lg font-semibold text-ink">Unificação manual</h2>
        <p className="mt-1 text-sm text-muted">Use somente quando tiver certeza de que os dois cadastros representam a mesma pessoa ou grupo.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="field-label">Categoria</span>
            <select
              className="field-input"
              onChange={(event) => {
                setSelectedKind(event.target.value as PersonType);
                setPrimaryId("");
                setDuplicateId("");
              }}
              value={selectedKind}
            >
              {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Cadastro que será mantido</span>
            <select className="field-input" onChange={(event) => setPrimaryId(event.target.value)} value={primaryId}>
              <option value="">Selecione...</option>
              {manualPeople.map((person) => <option disabled={person.id === duplicateId} key={person.id} value={person.id}>{person.name} — {person.detail}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Cadastro repetido</span>
            <select className="field-input" onChange={(event) => setDuplicateId(event.target.value)} value={duplicateId}>
              <option value="">Selecione...</option>
              {manualPeople.map((person) => <option disabled={person.id === primaryId} key={person.id} value={person.id}>{person.name} — {person.detail}</option>)}
            </select>
          </label>
        </div>
        <button
          className="primary-button mt-4"
          disabled={!selectedPrimary || !selectedDuplicate || isMerging}
          onClick={() => selectedPrimary && selectedDuplicate && void merge(selectedPrimary, selectedDuplicate)}
          type="button"
        >
          <GitMerge aria-hidden="true" size={18} /> {isMerging ? "Unificando..." : "Unificar cadastros"}
        </button>
      </section>

      <section className="mt-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="text-forest" size={20} />
          <h2 className="text-lg font-semibold text-ink">Histórico de unificações</h2>
        </div>
        {history.length === 0 ? <p className="mt-4 text-sm text-muted">Nenhuma unificação registrada.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Categoria</th><th className="px-3 py-2">Mantido</th><th className="px-3 py-2">Unificado</th><th className="px-3 py-2">Responsável</th></tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr className="border-t border-line" key={entry.id}>
                    <td className="whitespace-nowrap px-3 py-3">{formatMergeDate(entry.merged_at)}</td>
                    <td className="px-3 py-3">{kindLabels[entry.person_type]}</td>
                    <td className="px-3 py-3 font-medium text-ink">{entry.primary_name}</td>
                    <td className="px-3 py-3">{entry.duplicate_name}</td>
                    <td className="px-3 py-3">{entry.merged_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PersonChoice({ disabled, onKeep, person }: { disabled: boolean; onKeep: () => void; person: MergePerson }) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-white p-4">
      <StatusBadge>{kindLabels[person.kind]}</StatusBadge>
      <p className="mt-3 font-semibold text-ink">{person.name}</p>
      <p className="mt-1 flex-1 text-sm leading-6 text-muted">{person.detail}</p>
      <button className="secondary-button mt-4 w-full" disabled={disabled} onClick={onKeep} type="button">
        Manter este cadastro
      </button>
    </div>
  );
}
