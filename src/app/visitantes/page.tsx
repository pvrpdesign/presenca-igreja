"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, UserPlus } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Field, Notice, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
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

export default function VisitorsPage() {
  return (
    <AuthGate allowedRoles={["recepcao"]}>
      <VisitorsContent />
    </AuthGate>
  );
}

function VisitorsContent() {
  const { session } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadVisitors = useCallback(async () => {
    const { data } = await supabase
      .from("visitors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8);

    setVisitors((data ?? []) as Visitor[]);
  }, []);

  useEffect(() => {
    loadVisitors();
  }, [loadVisitors]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const { error } = await supabase.from("visitors").insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      location: form.location.trim() || null,
      how_heard: form.how_heard.trim() || null,
      prayer_request: form.prayer_request.trim() || null,
      notes: form.notes.trim() || null,
      created_by: session?.user.id ?? null
    });

    setIsSubmitting(false);

    if (error) {
      setMessage("Não foi possível cadastrar o visitante.");
      return;
    }

    setMessage("Visitante cadastrado com sucesso.");
    setForm(initialForm);
    await loadVisitors();
  }

  return (
    <div>
      <PageHeader eyebrow="Cadastro" title="Visitantes" />

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
              {isSubmitting ? "Salvando..." : "Salvar visitante"}
            </button>
          </form>
        </section>

        <aside className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus aria-hidden="true" size={19} />
            <h2 className="text-base font-semibold text-ink">Últimos visitantes</h2>
          </div>
          <div className="space-y-3">
            {visitors.length === 0 ? (
              <p className="text-sm text-muted">Nenhum visitante cadastrado ainda.</p>
            ) : (
              visitors.map((visitor) => (
                <div className="border-b border-line pb-3 last:border-0 last:pb-0" key={visitor.id}>
                  <p className="font-medium text-ink">{visitor.full_name}</p>
                  <p className="text-sm text-muted">{visitor.phone || visitor.location || "Sem contato"}</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
