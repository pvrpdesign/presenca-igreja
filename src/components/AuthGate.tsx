"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminMfaGate } from "@/components/AdminMfaGate";
import { SessionTimeout } from "@/components/SessionTimeout";
import { TermsAcceptanceGate } from "@/components/TermsAcceptanceGate";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";

export function AuthGate({
  allowedRoles,
  requireAdmin = false,
  children
}: {
  allowedRoles?: UserRole[];
  requireAdmin?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { authError, isLoading, session, profile, signOut } = useAuth();

  useEffect(() => {
    if (!isLoading && !session && !authError && isSupabaseConfigured) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [authError, isLoading, pathname, router, session]);

  if (!isSupabaseConfigured) {
    return (
      <SetupPanel
        title="Supabase não configurado"
        text="Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local para entrar no sistema."
      />
    );
  }

  if (authError) {
    return (
      <SetupPanel
        action={
          <button className="primary-button mt-5 w-full" onClick={() => window.location.reload()} type="button">
            Tentar abrir novamente
          </button>
        }
        title="Conexão lenta"
        text={authError}
      />
    );
  }

  if (isLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-card border border-line bg-white p-5 text-center shadow-soft">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-forest border-t-transparent" />
          <p className="text-sm font-medium text-muted">Abrindo sistema...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <SetupPanel
        title="Perfil não encontrado"
        text="Crie um registro em public.profiles para este usuário ou execute novamente o schema SQL."
      />
    );
  }

  if (profile.approval_status !== "aprovado") {
    const wasRejected = profile.approval_status === "rejeitado";
    return (
      <SetupPanel
        action={
          <button
            className="secondary-button mt-5 w-full"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
            type="button"
          >
            Sair
          </button>
        }
        title={wasRejected ? "Solicitação não aprovada" : "Aguardando aprovação"}
        text={
          wasRejected
            ? "Seu pedido de acesso não foi aprovado. Entre em contato com o administrador do sistema para mais informações."
            : "Seu cadastro foi recebido e ainda precisa ser aprovado pelo administrador. Você poderá acessar o sistema depois da aprovação."
        }
      />
    );
  }

  if (requireAdmin && !profile.is_admin) {
    return (
      <AppShell>
        <div className="rounded-card border border-line bg-white p-5 shadow-soft">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-card bg-wine/10 text-wine">
            <ShieldAlert aria-hidden="true" size={22} />
          </div>
          <h1 className="text-xl font-semibold text-ink">Acesso do administrador</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Somente o administrador pode aprovar ou rejeitar cadastros de usuários.
          </p>
        </div>
      </AppShell>
    );
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return (
      <AppShell>
        <div className="rounded-card border border-line bg-white p-5 shadow-soft">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-card bg-wine/10 text-wine">
            <ShieldAlert aria-hidden="true" size={22} />
          </div>
          <h1 className="text-xl font-semibold text-ink">Acesso reservado</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Esta área está liberada apenas para o perfil correto.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <SessionTimeout />
      <AdminMfaGate required={Boolean(profile.is_admin)}>
        <TermsAcceptanceGate>{children}</TermsAcceptanceGate>
      </AdminMfaGate>
    </AppShell>
  );
}

function SetupPanel({
  action,
  title,
  text
}: {
  action?: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-card bg-gold/20 text-ink">
          <AlertTriangle aria-hidden="true" size={23} />
        </div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
        {action}
      </div>
    </div>
  );
}
