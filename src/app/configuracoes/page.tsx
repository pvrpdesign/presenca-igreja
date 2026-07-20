"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GitMerge, RefreshCw, Save, Settings } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Notice, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";
import { supabase } from "@/lib/supabase";
import type { SystemSettings } from "@/lib/types";

export default function SettingsPage() {
  return (
    <AuthGate requireAdmin>
      <SettingsContent />
    </AuthGate>
  );
}

function SettingsContent() {
  const { session } = useAuth();
  const { settings, refreshSettings } = useSystemSettings();
  const [form, setForm] = useState(settings);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  function update<K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.user.id) return;
    setIsSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("system_settings")
      .update({
        church_name: form.church_name.trim(),
        privacy_contact_email: form.privacy_contact_email.trim().toLowerCase(),
        member_absence_threshold: form.member_absence_threshold,
        visitor_absence_threshold: form.visitor_absence_threshold,
        session_timeout_minutes: form.session_timeout_minutes,
        member_absence_message: form.member_absence_message.trim(),
        visitor_absence_message: form.visitor_absence_message.trim(),
        visitor_thank_you_message: form.visitor_thank_you_message.trim(),
        pastor_thank_you_message: form.pastor_thank_you_message.trim(),
        music_thank_you_message: form.music_thank_you_message.trim(),
        invitation_message: form.invitation_message.trim(),
        updated_by: session.user.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", true);

    if (error) {
      setMessage("Não foi possível salvar. Execute os SQLs 30 e 31 no Supabase e tente novamente.");
    } else {
      await refreshSettings();
      setMessage("Configurações salvas com sucesso.");
    }
    setIsSaving(false);
  }

  return (
    <div>
      <PageHeader
        action={
          <button className="secondary-button" onClick={() => void refreshSettings()} type="button">
            <RefreshCw aria-hidden="true" size={17} /> Atualizar
          </button>
        }
        eyebrow="Administração"
        title="Configurações do sistema"
      />

      {message ? (
        <div className="mb-5">
          <Notice title={message} tone={message.startsWith("Configurações") ? "success" : "warning"} />
        </div>
      ) : null}

      <section className="mb-5 flex flex-col gap-4 rounded-card border border-line bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <GitMerge aria-hidden="true" className="text-wine" size={20} />
            <h2 className="text-lg font-semibold text-ink">Cadastros duplicados</h2>
          </div>
          <p className="mt-1 text-sm text-muted">Localize e unifique cadastros repetidos sem perder presenças ou acompanhamentos.</p>
        </div>
        <Link className="secondary-button shrink-0" href="/duplicados">
          Abrir unificação
        </Link>
      </section>

      <form className="space-y-5" onSubmit={saveSettings}>
        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Settings aria-hidden="true" className="text-wine" size={20} />
            <h2 className="text-lg font-semibold text-ink">Identificação e segurança</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Nome exibido da igreja</span>
              <input className="field-input" maxLength={100} onChange={(event) => update("church_name", event.target.value)} required value={form.church_name} />
            </label>
            <label className="block">
              <span className="field-label">E-mail de privacidade e atendimento</span>
              <input className="field-input" onChange={(event) => update("privacy_contact_email", event.target.value)} required type="email" value={form.privacy_contact_email} />
            </label>
            <label className="block">
              <span className="field-label">Alertar membro após quantos sábados ausente</span>
              <input className="field-input" max={12} min={1} onChange={(event) => update("member_absence_threshold", Number(event.target.value))} required type="number" value={form.member_absence_threshold} />
            </label>
            <label className="block">
              <span className="field-label">Alertar visitante após quantos sábados ausente</span>
              <input className="field-input" max={12} min={1} onChange={(event) => update("visitor_absence_threshold", Number(event.target.value))} required type="number" value={form.visitor_absence_threshold} />
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">Encerrar sessão após quantos minutos sem atividade</span>
              <input className="field-input" max={240} min={10} onChange={(event) => update("session_timeout_minutes", Number(event.target.value))} required type="number" value={form.session_timeout_minutes} />
              <span className="mt-1 block text-xs text-muted">Permitido: de 10 minutos a 4 horas.</span>
            </label>
          </div>
        </section>

        <section className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
          <h2 className="text-lg font-semibold text-ink">Mensagens do WhatsApp</h2>
          <p className="mt-1 text-sm text-muted">Use <strong>{"{nome}"}</strong> para o primeiro nome e <strong>{"{igreja}"}</strong> para o nome da igreja.</p>
          <div className="mt-4 grid gap-4">
            <MessageField label="Falta de membro" onChange={(value) => update("member_absence_message", value)} value={form.member_absence_message} />
            <MessageField label="Falta de visitante" onChange={(value) => update("visitor_absence_message", value)} value={form.visitor_absence_message} />
            <MessageField label="Agradecimento ao visitante" onChange={(value) => update("visitor_thank_you_message", value)} value={form.visitor_thank_you_message} />
            <MessageField label="Agradecimento ao pastor/pregador" onChange={(value) => update("pastor_thank_you_message", value)} value={form.pastor_thank_you_message} />
            <MessageField label="Agradecimento à música especial" onChange={(value) => update("music_thank_you_message", value)} value={form.music_thank_you_message} />
            <label className="block">
              <span className="field-label">Convite para pastor/pregador ou música especial</span>
              <textarea className="field-input min-h-28" maxLength={1000} onChange={(event) => update("invitation_message", event.target.value)} required value={form.invitation_message} />
            </label>
          </div>
        </section>

        <button className="primary-button w-full" disabled={isSaving} type="submit">
          <Save aria-hidden="true" size={17} /> {isSaving ? "Salvando..." : "Salvar configurações"}
        </button>
      </form>
    </div>
  );
}

function MessageField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea className="field-input min-h-28" maxLength={1000} onChange={(event) => onChange(event.target.value)} required value={value} />
    </label>
  );
}
