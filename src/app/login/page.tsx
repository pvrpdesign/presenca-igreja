"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarCheck,
  HeartHandshake,
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck,
  UserPlus
} from "lucide-react";
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

  const pageTitle =
    mode === "login"
      ? "Olá, seja bem-vindo(a)"
      : mode === "signup"
        ? "Solicite seu acesso"
        : "Recupere sua senha";
  const pageDescription =
    mode === "login"
      ? "Entre para acessar o controle de presença e acompanhamento."
      : mode === "signup"
        ? "Preencha seus dados. O administrador analisará a solicitação antes de liberar o acesso."
        : "Informe seu e-mail cadastrado para receber o link de recuperação.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f5ecef] via-paper to-[#eee4e8] px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      <section className="grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_70px_rgba(87,0,36,0.15)] lg:min-h-[720px] lg:grid-cols-[1.03fr_0.97fr]">
        <aside className="relative flex flex-col overflow-hidden bg-gradient-to-br from-forestDark via-forest to-wine p-6 text-white sm:p-8 lg:p-10 xl:p-12">
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-gold/20 blur-3xl"
          />

          <div className="relative w-full max-w-md">
            <Image
              alt={settings.church_name}
              className="h-auto w-full object-contain object-left"
              height={751}
              priority
              src="/iasd-calcada-logo-branca.png"
              unoptimized
              width={2094}
            />
          </div>

          <div className="relative my-auto py-7 sm:py-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-white/70">
              Controle de presença
            </p>
            <h1 className="max-w-lg text-2xl font-semibold leading-tight sm:text-3xl xl:text-4xl">
              Cada presença é uma oportunidade de acolher, cuidar e caminhar juntos com Cristo.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-white/75 sm:text-base sm:leading-7">
              Um ambiente organizado para a recepção e a liderança acompanharem cada pessoa com atenção.
            </p>

            <div className="mt-6 space-y-3 sm:mt-8">
              <LoginBenefit
                icon={CalendarCheck}
                text="Presenças organizadas em um só lugar"
              />
              <LoginBenefit
                icon={HeartHandshake}
                text="Acompanhamento cuidadoso de membros e visitantes"
              />
              <LoginBenefit
                icon={ShieldCheck}
                text="Acesso protegido para recepção e liderança"
              />
            </div>
          </div>

          <p className="relative text-xs text-white/65 sm:text-sm">
            {settings.church_name} • Ministério de Recepção
          </p>
        </aside>

        <div className="flex items-center px-5 py-7 sm:px-10 sm:py-10 lg:px-12 xl:px-16">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-7">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-forest">
                Acesso seguro
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {pageTitle}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">{pageDescription}</p>
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
                    message.startsWith("Solicitação enviada") ||
                    message.startsWith("Se este e-mail") ||
                    message.startsWith("Senha alterada")
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

            <div className="mt-6 border-t border-line pt-5">
              <div className="flex items-center justify-center gap-2 text-xs text-muted">
                <ShieldCheck aria-hidden="true" className="text-forest" size={15} />
                <span>Acesso protegido e dados tratados com transparência.</span>
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-muted">
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
              <SoftwareCopyright className="mt-3" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoginBenefit({
  icon: Icon,
  text
}: {
  icon: typeof CalendarCheck;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
        <Icon aria-hidden="true" size={20} />
      </span>
      <p className="text-sm font-medium text-white/90">{text}</p>
      <span
        aria-hidden="true"
        className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/50 text-[11px]"
      >
        ✓
      </span>
    </div>
  );
}
