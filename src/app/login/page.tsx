"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LogIn, Mail, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Notice } from "@/components/ui";
import { SoftwareCopyright } from "@/components/SoftwareCopyright";
import { InstallAppButton } from "@/components/InstallAppButton";
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
  const { settings } = useSystemSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [requestedRole, setRequestedRole] = useState<UserRole>("recepcao");
  const [mode, setMode] = useState<"login" | "signup" | "recovery">("login");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const redirectTo = searchParams.get("redirect") || "/";

  useEffect(() => {
    if (!isLoading && session && mode !== "recovery") {
      router.replace(redirectTo);
    }
  }, [isLoading, mode, redirectTo, router, session]);

  useEffect(() => {
    if (searchParams.get("senha") === "alterada") {
      setMessage("Senha alterada com sucesso. Entre usando a nova senha.");
    } else if (searchParams.get("motivo") === "inatividade") {
      setMessage(`Sua sessão foi encerrada após ${settings.session_timeout_minutes} minutos sem atividade. Entre novamente para continuar.`);
    }
  }, [searchParams, settings.session_timeout_minutes]);

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

    if (mode === "recovery") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/nova-senha`
      });

      setIsSubmitting(false);

      if (error) {
        setMessage("Não foi possível enviar o e-mail agora. Aguarde alguns minutos e tente novamente.");
        return;
      }

      setMessage(
        "Se este e-mail estiver cadastrado, você receberá uma mensagem para criar uma nova senha. Verifique também a caixa de spam."
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
            alt={settings.church_name}
            className="mx-auto mb-4 h-auto w-full max-w-72 object-contain"
            height={220}
            priority
            src="/iasd-calcada-logo.png"
            unoptimized
            width={320}
          />
          <h1 className="text-xl font-semibold text-ink">
            {mode === "login"
              ? "Controle de Presença"
              : mode === "signup"
                ? "Solicitar acesso"
                : "Recuperar senha"}
          </h1>
          <p className="text-sm text-muted">
            {mode === "login"
              ? "Acesso da recepção e liderança"
              : mode === "signup"
                ? "O administrador analisará seu cadastro antes de liberar o sistema"
                : "Enviaremos um link para o seu e-mail cadastrado"}
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

          {mode !== "recovery" ? (
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
          ) : null}

          {mode === "login" ? (
            <button
              className="block w-full text-right text-sm font-semibold text-forest underline"
              disabled={isSubmitting}
              onClick={() => {
                setMode("recovery");
                setMessage("");
                setPassword("");
              }}
              type="button"
            >
              Esqueci minha senha
            </button>
          ) : null}

          {message ? (
            <Notice
              title={message}
              tone={
                message.startsWith("Solicitação enviada") || message.startsWith("Se este e-mail")
                  || message.startsWith("Senha alterada")
                  ? "success"
                  : "warning"
              }
            />
          ) : null}

          <button
            className="primary-button w-full"
            disabled={!isSupabaseConfigured || isSubmitting}
            type="submit"
          >
            {mode === "login" ? (
              <LogIn aria-hidden="true" size={18} />
            ) : mode === "signup" ? (
              <UserPlus aria-hidden="true" size={18} />
            ) : (
              <Mail aria-hidden="true" size={18} />
            )}
            {isSubmitting
              ? mode === "login"
                ? "Entrando..."
                : "Enviando..."
              : mode === "login"
                ? "Entrar"
                : mode === "signup"
                  ? "Enviar solicitação"
                  : "Enviar link de recuperação"}
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
          {mode === "login" ? (
            "Criar meu cadastro"
          ) : mode === "signup" ? (
            "Já tenho cadastro"
          ) : (
            <>
              <KeyRound aria-hidden="true" size={18} /> Voltar para o login
            </>
          )}
        </button>
        <InstallAppButton className="secondary-button mt-3 w-full" />
        <p className="mt-5 text-center text-xs leading-5 text-muted">
          Ao entrar, você declara ciência dos{" "}
          <Link className="font-semibold text-forest underline" href="/termos">
            Termos de Uso
          </Link>{" "}
          e do{" "}
          <Link className="font-semibold text-forest underline" href="/privacidade">
            Aviso de Privacidade
          </Link>
          .
        </p>
        <SoftwareCopyright className="mt-3 border-t border-line pt-3" />
      </section>
    </main>
  );
}
