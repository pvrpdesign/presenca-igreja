"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, CheckCircle2, ShieldCheck } from "lucide-react";
import { Notice } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { CURRENT_TERMS_DATE_LABEL, CURRENT_TERMS_VERSION } from "@/lib/terms";

export function TermsAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [hasAccepted, setHasAccepted] = useState(false);
  const [hasConfirmedReading, setHasConfirmedReading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const checkAcceptance = useCallback(async () => {
    if (!session?.user.id) return;
    setIsLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("terms_acceptances")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("terms_version", CURRENT_TERMS_VERSION)
      .maybeSingle();

    if (error) {
      setHasAccepted(false);
      setMessage("Execute o SQL 29 no Supabase para ativar o aceite dos Termos de Uso.");
    } else {
      setHasAccepted(Boolean(data));
    }
    setIsLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    void checkAcceptance();
  }, [checkAcceptance]);

  async function acceptTerms() {
    if (!hasConfirmedReading || !session?.user.id) return;
    setIsSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("accept_current_terms", {
      p_terms_version: CURRENT_TERMS_VERSION
    });

    if (error) {
      setMessage("Não foi possível registrar o aceite. Confira se o SQL 29 foi executado e tente novamente.");
      setIsSaving(false);
      return;
    }

    setHasAccepted(true);
    setIsSaving(false);
  }

  if (isLoading) return <Notice title="Verificando aceite dos Termos de Uso..." />;
  if (hasAccepted) return children;

  return (
    <section className="mx-auto max-w-2xl rounded-card border border-line bg-white p-5 shadow-soft sm:p-7">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-wine text-white">
        <BookOpenCheck aria-hidden="true" size={25} />
      </span>
      <p className="text-xs font-semibold uppercase tracking-wide text-wine">Aceite obrigatório</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink">Termos de Uso do sistema</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Antes de continuar, confirme que leu a versão de {CURRENT_TERMS_DATE_LABEL}. Ela contém as
        regras de confidencialidade, segurança, uso de dados e responsabilidade de cada usuário.
      </p>

      <div className="mt-5 rounded-card border border-forest/20 bg-forest/5 p-4 text-sm leading-6 text-muted">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-forest" size={20} />
          <p>
            Seu aceite será registrado com sua identificação, versão dos Termos, data e horário.
            Sempre que houver uma nova versão, o sistema solicitará outro aceite.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link className="secondary-button" href="/termos" target="_blank">Ler Termos de Uso</Link>
        <Link className="secondary-button" href="/privacidade" target="_blank">Ler Aviso de Privacidade</Link>
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-card border border-line bg-paper p-4 text-sm text-ink">
        <input
          checked={hasConfirmedReading}
          className="mt-1 h-4 w-4 accent-wine"
          onChange={(event) => setHasConfirmedReading(event.target.checked)}
          type="checkbox"
        />
        <span>Li e concordo com os Termos de Uso e declaro ciência do Aviso de Privacidade.</span>
      </label>

      {message ? <div className="mt-4"><Notice title={message} tone="warning" /></div> : null}

      <button className="primary-button mt-5 w-full" disabled={!hasConfirmedReading || isSaving} onClick={acceptTerms} type="button">
        <CheckCircle2 aria-hidden="true" size={18} /> {isSaving ? "Registrando aceite..." : "Aceitar e continuar"}
      </button>
    </section>
  );
}
