"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Church, LoaderCircle, Phone, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { Field, Notice } from "@/components/ui";
import { SoftwareCopyright } from "@/components/SoftwareCopyright";
import { supabase } from "@/lib/supabase";

type CheckinResult = {
  status: string;
  first_name?: string;
};

function checkinMessage(result: CheckinResult) {
  if (result.status === "registered") {
    return {
      title: `Presença confirmada${result.first_name ? `, ${result.first_name}` : ""}!`,
      text: "Que alegria ter você conosco. Desejamos um culto abençoado!",
      tone: "success" as const
    };
  }

  if (result.status === "already_registered") {
    return {
      title: `Sua presença já estava marcada${result.first_name ? `, ${result.first_name}` : ""}.`,
      text: "Não é necessário enviar novamente. Desejamos um culto abençoado!",
      tone: "success" as const
    };
  }

  if (result.status === "not_found") {
    return {
      title: "Cadastro não encontrado",
      text: "Confira o WhatsApp informado ou procure a recepção para atualizar seu cadastro.",
      tone: "warning" as const
    };
  }

  if (result.status === "multiple_matches") {
    return {
      title: "Encontramos mais de um cadastro com este telefone",
      text: "Procure a recepção para confirmarmos sua presença com segurança.",
      tone: "warning" as const
    };
  }

  if (result.status === "invalid_phone") {
    return {
      title: "WhatsApp inválido",
      text: "Informe o DDD e o número do telefone usado no seu cadastro.",
      tone: "warning" as const
    };
  }

  if (result.status === "closed") {
    return {
      title: "Check-in fechado",
      text: "Este QR Code funciona somente no dia do culto. Procure a recepção se precisar de ajuda.",
      tone: "warning" as const
    };
  }

  if (result.status === "invalid") {
    return {
      title: "QR Code inválido",
      text: "Peça à recepção o QR Code correto deste culto.",
      tone: "warning" as const
    };
  }

  if (result.status === "error") {
    return {
      title: "A conexão demorou mais que o esperado",
      text: "Confira sua internet e toque novamente em Confirmar minha presença.",
      tone: "warning" as const
    };
  }

  return {
    title: "Check-in indisponível",
    text: "Procure a recepção para marcar sua presença.",
    tone: "warning" as const
  };
}

export default function MemberCheckinPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setIsSubmitting(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    try {
      const { data, error } = await supabase.rpc("register_member_self_checkin", {
        p_token: token,
        p_phone: phone
      }).abortSignal(controller.signal);

      setResult(error ? { status: "error" } : (data as CheckinResult));
    } catch {
      setResult({ status: "error" });
    } finally {
      window.clearTimeout(timeoutId);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-forest text-white shadow-soft">
            <Church aria-hidden="true" size={28} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">IASD Calçada</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Check-in de membros</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Informe seu WhatsApp para confirmar sua presença no culto.
          </p>
        </div>

        <section className="rounded-card border border-line bg-white p-5 shadow-soft">
          {result?.status === "registered" || result?.status === "already_registered" ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto text-forest" size={52} />
              <div className="mt-4">
                <Notice {...checkinMessage(result)} />
              </div>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <Field label="Seu WhatsApp com DDD">
                <div className="relative">
                  <Phone
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    size={18}
                  />
                  <input
                    autoComplete="tel"
                    autoFocus
                    className="field-input pl-10"
                    inputMode="tel"
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="Ex.: (71) 99999-9999"
                    required
                    value={phone}
                  />
                </div>
              </Field>

              {result ? <Notice {...checkinMessage(result)} /> : null}

              <button className="primary-button w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                {isSubmitting ? "Confirmando..." : "Confirmar minha presença"}
              </button>
            </form>
          )}
        </section>

        <div className="mt-4 text-center text-xs leading-5 text-muted">
          <p className="flex items-center justify-center gap-2">
            <ShieldCheck aria-hidden="true" className="shrink-0" size={16} />
            Seu telefone é usado apenas para localizar seu cadastro de membro.
          </p>
          <Link className="mt-2 inline-block font-semibold text-forest underline" href="/privacidade">
            Aviso de Privacidade e canal de atendimento
          </Link>
          <SoftwareCopyright className="mt-3 border-t border-line pt-3" />
        </div>
      </div>
    </main>
  );
}
