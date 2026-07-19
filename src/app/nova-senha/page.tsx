"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function NovaSenhaPage() {
  const router = useRouter();
  const { isLoading, session } = useAuth();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password !== passwordConfirmation) {
      setMessage("As duas senhas precisam ser iguais.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setIsSubmitting(false);
      setMessage("Não foi possível alterar a senha. Solicite um novo link e tente novamente.");
      return;
    }

    await supabase.auth.signOut({ scope: "global" });
    router.replace("/login?senha=alterada");
  }

  const linkUnavailable = !isLoading && !session;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-card border border-line bg-white p-5 shadow-soft sm:p-6">
        <div className="mb-6 text-center">
          <Image
            alt="Igreja Adventista do Sétimo Dia - Calçada"
            className="mx-auto mb-4 h-auto w-full max-w-72 object-contain"
            height={220}
            priority
            src="/iasd-calcada-logo.png"
            unoptimized
            width={320}
          />
          <h1 className="text-xl font-semibold text-ink">Criar nova senha</h1>
          <p className="text-sm text-muted">Digite e confirme sua nova senha de acesso</p>
        </div>

        {!isSupabaseConfigured ? (
          <Notice tone="warning" title="O sistema de acesso não está configurado." />
        ) : isLoading ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-forest border-t-transparent" />
            <p className="text-sm font-medium text-muted">Verificando o link...</p>
          </div>
        ) : linkUnavailable ? (
          <>
            <Notice
              tone="warning"
              title="Este link é inválido ou expirou. Solicite um novo link de recuperação."
            />
            <Link className="secondary-button mt-4 w-full" href="/login">
              Voltar para o login
            </Link>
          </>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="field-label">Nova senha</span>
              <input
                autoComplete="new-password"
                className="field-input"
                disabled={isSubmitting}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <span className="mt-1 block text-xs text-muted">Use pelo menos 8 caracteres.</span>
            </label>

            <label className="block">
              <span className="field-label">Confirmar nova senha</span>
              <input
                autoComplete="new-password"
                className="field-input"
                disabled={isSubmitting}
                minLength={8}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                required
                type="password"
                value={passwordConfirmation}
              />
            </label>

            {message ? <Notice tone="warning" title={message} /> : null}

            <button className="primary-button w-full" disabled={isSubmitting} type="submit">
              <KeyRound aria-hidden="true" size={18} />
              {isSubmitting ? "Alterando senha..." : "Salvar nova senha"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
