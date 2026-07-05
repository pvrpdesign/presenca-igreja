"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, UsersRound } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Field, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
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

export default function MembersPage() {
  return (
    <AuthGate allowedRoles={["recepcao"]}>
      <MembersContent />
    </AuthGate>
  );
}

function MembersContent() {
  const { session } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadMembers = useCallback(async () => {
    const { data } = await supabase
      .from("members")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8);

    setMembers((data ?? []) as Member[]);
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const { error } = await supabase.from("members").insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      neighborhood: form.neighborhood.trim() || null,
      ministry: form.ministry.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      created_by: session?.user.id ?? null
    });

    setIsSubmitting(false);

    if (error) {
      setMessage("Não foi possível cadastrar o membro.");
      return;
    }

    setMessage("Membro cadastrado com sucesso.");
    setForm(initialForm);
    await loadMembers();
  }

  return (
    <div>
      <PageHeader eyebrow="Cadastro" title="Membros" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <form className="grid gap-4" onSubmit={handleSubmit}>
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
              {isSubmitting ? "Salvando..." : "Salvar membro"}
            </button>
          </form>
        </section>

        <aside className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <UsersRound aria-hidden="true" size={19} />
            <h2 className="text-base font-semibold text-ink">Últimos membros</h2>
          </div>
          <div className="space-y-3">
            {members.length === 0 ? (
              <p className="text-sm text-muted">Nenhum membro cadastrado ainda.</p>
            ) : (
              members.map((member) => (
                <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={member.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{member.full_name}</p>
                      <p className="text-sm text-muted">{member.phone || "Sem telefone"}</p>
                    </div>
                    <StatusBadge tone={member.status === "ativo" ? "success" : "warning"}>
                      {member.status}
                    </StatusBadge>
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
