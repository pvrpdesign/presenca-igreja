"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Church, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Notice } from "@/components/ui";

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

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

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
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-card bg-forest text-white">
            <Church aria-hidden="true" size={24} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Controle de Presença</h1>
            <p className="text-sm text-muted">Acesso da recepção e liderança</p>
          </div>
        </div>

        {!isSupabaseConfigured ? (
          <Notice
            tone="warning"
            title="Configure o Supabase"
            text="Preencha as variáveis no arquivo .env.local antes de entrar."
          />
        ) : null}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
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

          <label className="block">
            <span className="field-label">Senha</span>
            <input
              autoComplete="current-password"
              className="field-input"
              disabled={!isSupabaseConfigured || isSubmitting}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {message ? <Notice title={message} tone="warning" /> : null}

          <button
            className="primary-button w-full"
            disabled={!isSupabaseConfigured || isSubmitting}
            type="submit"
          >
            <LogIn aria-hidden="true" size={18} />
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
