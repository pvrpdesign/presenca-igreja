"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, MessageCircle, Search, UserRoundSearch } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Notice, PageHeader, StatusBadge } from "@/components/ui";
import { formatDateBR, SERVICE_LABELS } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { Attendance, Member, Pastor, PersonType, SpecialMusic, Visitor } from "@/lib/types";

type SearchPerson = {
  id: string;
  kind: PersonType;
  name: string;
  phone: string | null;
  detail: string;
  searchableText: string;
};

type LastAttendance = Pick<Attendance, "person_id" | "person_type" | "service_date" | "service_type">;

const kindLabels: Record<PersonType, string> = {
  membro: "Membro",
  visitante: "Visitante",
  pastor: "Pastor/Pregador",
  musica: "Música especial"
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function personKey(kind: PersonType, id: string) {
  return `${kind}:${id}`;
}

function whatsappUrl(phone: string | null) {
  const digits = onlyDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

export default function GlobalSearchPage() {
  return (
    <AuthGate allowedRoles={["lideranca"]}>
      <GlobalSearchContent />
    </AuthGate>
  );
}

function GlobalSearchContent() {
  const [people, setPeople] = useState<SearchPerson[]>([]);
  const [results, setResults] = useState<SearchPerson[]>([]);
  const [lastAttendanceByPerson, setLastAttendanceByPerson] = useState<Record<string, LastAttendance>>({});
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const loadPeople = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const [membersResponse, visitorsResponse, pastorsResponse, musicResponse] = await Promise.all([
      supabase.from("members").select("id, full_name, phone, neighborhood, ministry, status").is("archived_at", null).limit(5000),
      supabase.from("visitors").select("id, full_name, phone, location, denomination").is("archived_at", null).limit(5000),
      supabase.from("pastors").select("id, full_name, phone, district, speaker_role").is("archived_at", null).limit(5000),
      supabase.from("special_music").select("id, performer_name, contact, church").is("archived_at", null).limit(5000)
    ]);

    if (membersResponse.error || visitorsResponse.error || pastorsResponse.error || musicResponse.error) {
      setPeople([]);
      setMessage("Não foi possível carregar os cadastros para a busca.");
      setIsLoading(false);
      return;
    }

    const members = (membersResponse.data ?? []) as Pick<Member, "id" | "full_name" | "phone" | "neighborhood" | "ministry" | "status">[];
    const visitors = (visitorsResponse.data ?? []) as Pick<Visitor, "id" | "full_name" | "phone" | "location" | "denomination">[];
    const pastors = (pastorsResponse.data ?? []) as Pick<Pastor, "id" | "full_name" | "phone" | "district" | "speaker_role">[];
    const music = (musicResponse.data ?? []) as Pick<SpecialMusic, "id" | "performer_name" | "contact" | "church">[];

    const rows: SearchPerson[] = [
      ...members.map((person) => ({
        id: person.id,
        kind: "membro" as const,
        name: person.full_name,
        phone: person.phone,
        detail: [person.status === "ativo" ? "Ativo" : person.status, person.ministry, person.neighborhood].filter(Boolean).join(" • "),
        searchableText: normalizeText([person.full_name, person.phone, person.ministry, person.neighborhood].filter(Boolean).join(" "))
      })),
      ...visitors.map((person) => ({
        id: person.id,
        kind: "visitante" as const,
        name: person.full_name,
        phone: person.phone,
        detail: [person.location, person.denomination].filter(Boolean).join(" • ") || "Sem local informado",
        searchableText: normalizeText([person.full_name, person.phone, person.location, person.denomination].filter(Boolean).join(" "))
      })),
      ...pastors.map((person) => ({
        id: person.id,
        kind: "pastor" as const,
        name: person.full_name,
        phone: person.phone,
        detail: [person.speaker_role === "pregador" ? "Pregador" : "Pastor", person.district].filter(Boolean).join(" • "),
        searchableText: normalizeText([person.full_name, person.phone, person.district].filter(Boolean).join(" "))
      })),
      ...music.map((person) => ({
        id: person.id,
        kind: "musica" as const,
        name: person.performer_name,
        phone: person.contact,
        detail: person.church || "Igreja não informada",
        searchableText: normalizeText([person.performer_name, person.contact, person.church].filter(Boolean).join(" "))
      }))
    ];

    setPeople(rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  async function performSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasSearched(true);
    const normalizedSearch = normalizeText(search);
    const phoneSearch = onlyDigits(search);

    if (normalizedSearch.length < 2 && phoneSearch.length < 4) {
      setResults([]);
      setLastAttendanceByPerson({});
      setMessage("Digite pelo menos 2 letras do nome ou 4 números do telefone.");
      return;
    }

    setIsSearching(true);
    setMessage("");
    const matches = people
      .filter((person) =>
        person.searchableText.includes(normalizedSearch)
        || (phoneSearch.length >= 4 && onlyDigits(person.phone).includes(phoneSearch))
      )
      .slice(0, 60);
    setResults(matches);

    if (matches.length === 0) {
      setLastAttendanceByPerson({});
      setIsSearching(false);
      return;
    }

    const { data, error } = await supabase
      .from("attendances")
      .select("person_id, person_type, service_date, service_type")
      .in("person_id", [...new Set(matches.map((person) => person.id))])
      .order("service_date", { ascending: false })
      .limit(5000);

    if (error) {
      setLastAttendanceByPerson({});
      setMessage("As pessoas foram encontradas, mas não foi possível carregar a última presença.");
    } else {
      const latest: Record<string, LastAttendance> = {};
      ((data ?? []) as LastAttendance[]).forEach((attendance) => {
        const key = personKey(attendance.person_type, attendance.person_id);
        if (!latest[key]) latest[key] = attendance;
      });
      setLastAttendanceByPerson(latest);
    }
    setIsSearching(false);
  }

  const resultCounts = useMemo(() => ({
    membro: results.filter((person) => person.kind === "membro").length,
    visitante: results.filter((person) => person.kind === "visitante").length,
    pastor: results.filter((person) => person.kind === "pastor").length,
    musica: results.filter((person) => person.kind === "musica").length
  }), [results]);

  return (
    <div>
      <PageHeader eyebrow="Liderança" title="Busca geral de pessoas" />

      <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={performSearch}>
          <label className="relative block flex-1">
            <span className="sr-only">Nome ou telefone</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={19} />
            <input
              autoFocus
              className="field-input pl-10"
              onChange={(event) => {
                setSearch(event.target.value);
                setHasSearched(false);
                setResults([]);
                setLastAttendanceByPerson({});
                setMessage("");
              }}
              placeholder="Nome ou telefone..."
              value={search}
            />
          </label>
          <button className="primary-button sm:min-w-36" disabled={isLoading || isSearching} type="submit">
            <Search aria-hidden="true" size={18} /> {isSearching ? "Buscando..." : "Buscar"}
          </button>
        </form>
        <p className="mt-3 text-xs text-muted">A busca considera membros, visitantes, pastores, pregadores e música especial.</p>
      </section>

      {message ? <div className="mt-5"><Notice title={message} tone="warning" /></div> : null}
      {isLoading ? <div className="mt-5"><Notice title="Preparando a busca..." /></div> : null}

      {!isLoading && results.length > 0 ? (
        <>
          <div className="my-5 flex flex-wrap gap-2">
            {(Object.keys(kindLabels) as PersonType[]).map((kind) => (
              resultCounts[kind] > 0 ? <StatusBadge key={kind}>{kindLabels[kind]}: {resultCounts[kind]}</StatusBadge> : null
            ))}
          </div>
          <section className="grid gap-4 lg:grid-cols-2">
            {results.map((person) => {
              const attendance = lastAttendanceByPerson[personKey(person.kind, person.id)];
              const messageUrl = whatsappUrl(person.phone);
              return (
                <article className="rounded-card border border-line bg-white p-4 shadow-soft" key={personKey(person.kind, person.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <StatusBadge>{kindLabels[person.kind]}</StatusBadge>
                      <h2 className="mt-2 truncate text-lg font-semibold text-ink">{person.name}</h2>
                      <p className="mt-1 text-sm text-muted">{person.detail}</p>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-wine/10 text-wine">
                      <UserRoundSearch aria-hidden="true" size={20} />
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-ink">Telefone/WhatsApp</dt>
                      <dd className="mt-1 text-muted">{person.phone || "Não informado"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink">Última presença</dt>
                      <dd className="mt-1 text-muted">
                        {attendance
                          ? `${SERVICE_LABELS[attendance.service_type]} em ${formatDateBR(attendance.service_date)}`
                          : "Nenhuma presença encontrada"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    <Link className="primary-button" href={`/pessoas/${person.kind}/${person.id}`}>
                      <CalendarDays aria-hidden="true" size={17} /> Abrir ficha
                    </Link>
                    {messageUrl ? (
                      <a className="secondary-button" href={messageUrl} rel="noreferrer" target="_blank">
                        <MessageCircle aria-hidden="true" size={17} /> WhatsApp
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        </>
      ) : null}

      {!isLoading && hasSearched && !message && results.length === 0 ? (
        <div className="mt-5"><Notice title="Nenhuma pessoa encontrada" text="Confira o nome ou telefone e tente novamente." /></div>
      ) : null}
    </div>
  );
}
