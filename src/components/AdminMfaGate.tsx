"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, LogOut, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { Notice } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type GateMode = "loading" | "setup" | "enroll" | "challenge" | "verified";
type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

function qrCodeSource(value: string) {
  if (value.startsWith("data:")) return value;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
}

export function AdminMfaGate({ children, required }: { children: React.ReactNode; required: boolean }) {
  const { signOut } = useAuth();
  const [mode, setMode] = useState<GateMode>(required ? "loading" : "verified");
  const [factorId, setFactorId] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkMfa = useCallback(async () => {
    if (!required) {
      setMode("verified");
      return;
    }

    setMode("loading");
    setMessage("");

    const [assuranceResponse, factorsResponse] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors()
    ]);

    if (assuranceResponse.error || factorsResponse.error) {
      setMessage("Não foi possível verificar a proteção da conta. Atualize a página e tente novamente.");
      setMode("setup");
      return;
    }

    if (assuranceResponse.data.currentLevel === "aal2") {
      setMode("verified");
      return;
    }

    const verifiedFactor = factorsResponse.data.totp[0];
    if (verifiedFactor) {
      setFactorId(verifiedFactor.id);
      setMode("challenge");
    } else {
      setMode("setup");
    }
  }, [required]);

  useEffect(() => {
    void checkMfa();
  }, [checkMfa]);

  async function startEnrollment() {
    setIsSubmitting(true);
    setMessage("");

    const factorsResponse = await supabase.auth.mfa.listFactors();
    if (!factorsResponse.error) {
      await Promise.all(
        factorsResponse.data.all
          .filter((factor) => factor.factor_type === "totp" && factor.status === "unverified")
          .map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id }))
      );
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Administrador IASD Calçada"
    });

    if (error || !data) {
      setMessage("Não foi possível criar a verificação. Aguarde alguns segundos e tente novamente.");
      setIsSubmitting(false);
      return;
    }

    setFactorId(data.id);
    setEnrollment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret
    });
    setMode("enroll");
    setIsSubmitting(false);
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanCode = code.replace(/\D/g, "");
    if (cleanCode.length !== 6 || !factorId) {
      setMessage("Digite o código de 6 números exibido no aplicativo autenticador.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: cleanCode
    });

    if (error) {
      setMessage("Código inválido ou vencido. Aguarde o próximo código e tente novamente.");
      setCode("");
      setIsSubmitting(false);
      return;
    }

    setMode("verified");
    setIsSubmitting(false);
  }

  if (!required || mode === "verified") return children;
  if (mode === "loading") return <Notice title="Verificando a segurança da conta..." />;

  return (
    <section className="mx-auto max-w-2xl rounded-card border border-line bg-white p-5 shadow-soft sm:p-7">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-wine text-white">
        <ShieldCheck aria-hidden="true" size={25} />
      </span>
      <p className="text-xs font-semibold uppercase tracking-wide text-wine">Proteção do administrador</p>

      {mode === "setup" ? (
        <>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Ative a verificação em duas etapas</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Além da senha, a conta de administrador passará a exigir um código temporário. Instale no celular o Google Authenticator, Microsoft Authenticator ou outro aplicativo compatível.
          </p>
          <div className="mt-5 rounded-card border border-forest/20 bg-forest/5 p-4 text-sm leading-6 text-muted">
            <div className="flex items-start gap-3">
              <Smartphone aria-hidden="true" className="mt-0.5 shrink-0 text-forest" size={20} />
              <p>O aplicativo autenticador ocupa pouco espaço e funciona mesmo quando o celular estiver sem internet.</p>
            </div>
          </div>
          {message ? <div className="mt-4"><Notice title={message} tone="warning" /></div> : null}
          <button className="primary-button mt-5 w-full" disabled={isSubmitting} onClick={() => void startEnrollment()} type="button">
            <QrCode aria-hidden="true" size={18} /> {isSubmitting ? "Preparando..." : "Ativar e mostrar QR Code"}
          </button>
        </>
      ) : null}

      {mode === "enroll" && enrollment ? (
        <>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Leia o QR Code</h1>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-muted">
            <li>Abra o aplicativo autenticador no celular.</li>
            <li>Escolha adicionar uma conta e leia este QR Code.</li>
            <li>Digite abaixo o código de 6 números gerado pelo aplicativo.</li>
          </ol>
          <div className="mx-auto mt-5 w-fit rounded-card border border-line bg-white p-3">
            <Image alt="QR Code da verificação em duas etapas" height={220} src={qrCodeSource(enrollment.qrCode)} unoptimized width={220} />
          </div>
          <details className="mt-4 rounded-card border border-line bg-paper p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-ink">Não conseguiu ler o QR Code?</summary>
            <p className="mt-2 text-muted">Digite esta chave manualmente no aplicativo. Não compartilhe esta chave.</p>
            <code className="mt-2 block break-all rounded bg-white p-2 text-ink">{enrollment.secret}</code>
          </details>
          <CodeForm code={code} isSubmitting={isSubmitting} message={message} onChange={setCode} onSubmit={verifyCode} submitLabel="Confirmar e ativar" />
        </>
      ) : null}

      {mode === "challenge" ? (
        <>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Confirme seu código de segurança</h1>
          <p className="mt-3 text-sm leading-6 text-muted">Abra o aplicativo autenticador e informe o código atual de 6 números.</p>
          <CodeForm code={code} isSubmitting={isSubmitting} message={message} onChange={setCode} onSubmit={verifyCode} submitLabel="Confirmar acesso" />
        </>
      ) : null}

      <button
        className="secondary-button mt-3 w-full"
        onClick={async () => {
          await signOut();
          window.location.assign("/login");
        }}
        type="button"
      >
        <LogOut aria-hidden="true" size={17} /> Sair desta conta
      </button>
    </section>
  );
}

function CodeForm({
  code,
  isSubmitting,
  message,
  onChange,
  onSubmit,
  submitLabel
}: {
  code: string;
  isSubmitting: boolean;
  message: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
}) {
  return (
    <form className="mt-5" onSubmit={onSubmit}>
      <label className="block">
        <span className="field-label">Código de 6 números</span>
        <input
          autoComplete="one-time-code"
          autoFocus
          className="field-input text-center text-2xl tracking-[0.35em]"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
          pattern="[0-9]{6}"
          placeholder="000000"
          required
          value={code}
        />
      </label>
      {message ? <div className="mt-4"><Notice title={message} tone="warning" /></div> : null}
      <button className="primary-button mt-4 w-full" disabled={isSubmitting} type="submit">
        <KeyRound aria-hidden="true" size={18} /> {isSubmitting ? "Confirmando..." : submitLabel}
      </button>
    </form>
  );
}
