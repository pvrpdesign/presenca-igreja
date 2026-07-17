"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, Church, LoaderCircle, Phone, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { Field, Notice } from "@/components/ui";
import { formatDateBR, SERVICE_LABELS } from "@/lib/date";
import { supabase } from "@/lib/supabase";
import type { ServiceType } from "@/lib/types";

type ServiceInfo = {
  status: string;
  title?: string;
  service_date?: string;
  service_type?: ServiceType;
  is_open?: boolean;
};

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

  return {
    title: "Check-in indisponível",
    text: "Procure a recepção para marcar sua presença.",
    tone: "warning" as const
  };
}

export default function MemberCheckinPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadService = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc("get_member_checkin_service", {
      p_token: token
    });

    setService(error ? { status: "invalid" } : (data as ServiceInfo));
    setIsLoading(false);
  }, [token]);

  useEffect(() => {
    loadService();
  }, [loadService]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setIsSubmitting(true);

    const { data, error } = await supabase.rpc("register_member_self_checkin", {
      p_token: token,
      p_phone: phone
    });

    setResult(error ? { status: "error" } : (data as CheckinResult));
    setIsSubmitting(false);
  }

  const isValidService = service?.status === "ok";

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
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
              <LoaderCircle className="animate-spin" size={20} />
              Abrindo check-in...
            </div>
          ) : !isValidService ? (
            <Notice
              title="QR Code inválido"
              text="Peça à recepção o QR Code correto deste culto."
              tone="warning"
            />
          ) : (
            <>
              <div className="mb-5 rounded-card border border-forest/20 bg-forest/5 p-4">
                <div className="flex items-start gap-3">
                  <CalendarCheck className="mt-0.5 shrink-0 text-forest" size={20} />
                  <div>
                    <h2 className="font-semibold text-ink">{service.title}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {service.service_type ? SERVICE_LABELS[service.service_type] : "Culto"}
                      {service.service_date ? ` • ${formatDateBR(service.service_date)}` : ""}
                    </p>
                  </div>
                </div>
              </div>

              {!service.is_open ? (
                <Notice
                  title="Check-in fechado"
                  text="Este QR Code funciona somente no dia do culto. Procure a recepção se precisar de ajuda."
                  tone="warning"
                />
              ) : result?.status === "registered" || result?.status === "already_registered" ? (
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
            </>
          )}
        </section>

        <div className="mt-4 flex items-center justify-center gap-2 text-center text-xs leading-5 text-muted">
          <ShieldCheck aria-hidden="true" className="shrink-0" size={16} />
          Seu telefone é usado apenas para localizar seu cadastro de membro.
        </div>
      </div>
    </main>
  );
}
