"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Notice } from "@/components/ui";
import type { UserRole } from "@/lib/types";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [requestedRole, setRequestedRole] = useState<UserRole>("recepcao");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const redirectTo = searchParams.get("redirect") || "/";

  useEffect(() => {
    if (!isLoading && session) {
      router.replace(redirectTo);
    }
  }, [isLoading, redirectTo, router, session]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            full_name: fullName.trim(),
            requested_role: requestedRole
          }
        }
      });

      if (data.session) await supabase.auth.signOut();
      setIsSubmitting(false);

      if (error) {
        setMessage(
          error.message.toLowerCase().includes("already")
            ? "Este e-mail já possui cadastro. Use a opção Entrar."
            : "Não foi possível criar a solicitação. Verifique os dados e tente novamente."
        );
        return;
      }

      setMode("login");
      setPassword("");
      setFullName("");
      setMessage(
        "Solicitação enviada. Confirme seu e-mail, se receber uma mensagem, e aguarde a aprovação do administrador."
      );
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    setIsSubmitting(false);

    if (error) {
      setMessage("E-mail ou senha inválidos.");
      return;
    }

    router.replace(redirectTo);
  }

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
          <h1 className="text-xl font-semibold text-ink">
            {mode === "login" ? "Controle de Presença" : "Solicitar acesso"}
          </h1>
          <p className="text-sm text-muted">
            {mode === "login"
              ? "Acesso da recepção e liderança"
              : "O administrador analisará seu cadastro antes de liberar o sistema"}
          </p>
        </div>

        {!isSupabaseConfigured ? (
          <Notice
            tone="warning"
            title="Configure o Supabase"
            text="Preencha as variáveis no arquivo .env.local antes de entrar."
          />
        ) : null}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <label className="block">
              <span className="field-label">Nome completo</span>
              <input
                autoComplete="name"
                className="field-input"
                disabled={!isSupabaseConfigured || isSubmitting}
                minLength={3}
                onChange={(event) => setFullName(event.target.value)}
                required
                value={fullName}
              />
            </label>
          ) : null}
          <label className="block">
            <span className="field-label">E-mail</span>
            <input
              autoComplete="email"
              className="field-input"
              disabled={!isSupabaseConfigured || isSubmitting}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          {mode === "signup" ? (
            <label className="block">
              <span className="field-label">Perfil solicitado</span>
              <select
                className="field-input"
                disabled={!isSupabaseConfigured || isSubmitting}
                onChange={(event) => setRequestedRole(event.target.value as UserRole)}
                value={requestedRole}
              >
                <option value="recepcao">Recepção</option>
                <option value="lideranca">Liderança</option>
              </select>
              <span className="mt-1 block text-xs text-muted">
                A escolha é uma solicitação; o administrador decidirá o acesso liberado.
              </span>
            </label>
          ) : null}

          <label className="block">
            <span className="field-label">Senha</span>
            <input
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="field-input"
              disabled={!isSupabaseConfigured || isSubmitting}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={mode === "signup" ? 8 : undefined}
              type="password"
              value={password}
            />
          </label>

          {message ? (
            <Notice
              title={message}
              tone={message.startsWith("Solicitação enviada") ? "success" : "warning"}
            />
          ) : null}

          <button
            className="primary-button w-full"
            disabled={!isSupabaseConfigured || isSubmitting}
            type="submit"
          >
            {mode === "login" ? <LogIn aria-hidden="true" size={18} /> : <UserPlus aria-hidden="true" size={18} />}
            {isSubmitting
              ? mode === "login" ? "Entrando..." : "Enviando..."
              : mode === "login" ? "Entrar" : "Enviar solicitação"}
          </button>
        </form>
        <button
          className="secondary-button mt-3 w-full"
          disabled={isSubmitting}
          onClick={() => {
            setMode((current) => (current === "login" ? "signup" : "login"));
            setMessage("");
            setPassword("");
          }}
          type="button"
        >
          {mode === "login" ? "Criar meu cadastro" : "Já tenho cadastro"}
        </button>
        <p className="mt-5 text-center text-xs leading-5 text-muted">
          Ao utilizar este sistema, consulte nosso{" "}
          <Link className="font-semibold text-forest underline" href="/privacidade">
            Aviso de Privacidade
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
