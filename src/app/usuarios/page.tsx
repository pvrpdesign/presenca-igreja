"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, UserX } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AccessAuditLog, ApprovalStatus, Profile, UserRole } from "@/lib/types";

type FilterStatus = "todos" | ApprovalStatus;

type AccessSummary = {
  total: number;
  lastLoginAt: string;
  lastLogoutAt: string | null;
  lastLogoutReason: AccessAuditLog["logout_reason"];
};

const statusLabels: Record<ApprovalStatus, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado"
};

function formatAccessDate(value: string | null) {
  if (!value) return "Não registrado";
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bahia"
  });
}

export default function UsersPage() {
  return (
    <AuthGate requireAdmin>
      <UsersContent />
    </AuthGate>
  );
}

function UsersContent() {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accessByUser, setAccessByUser] = useState<Record<string, AccessSummary>>({});
  const [roleByUser, setRoleByUser] = useState<Record<string, UserRole>>({});
  const [filter, setFilter] = useState<FilterStatus>("pendente");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setIsLoading(true);
    const [profilesResponse, accessResponse] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("is_admin", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("access_audit_logs")
        .select("id, user_id, user_name, user_email, user_role, session_id, login_at, logout_at, logout_reason")
        .order("login_at", { ascending: false })
        .limit(2000)
    ]);

    if (profilesResponse.error) {
      setMessage("Não foi possível carregar as solicitações. Rode o SQL 21 no Supabase.");
      setProfiles([]);
    } else {
      const rows = (profilesResponse.data ?? []) as Profile[];
      setProfiles(rows);
      setRoleByUser(
        Object.fromEntries(rows.map((profile) => [profile.id, profile.requested_role]))
      );
    }

    if (accessResponse.error) {
      setAccessByUser({});
      if (!profilesResponse.error) setMessage("Execute o SQL 28 no Supabase para visualizar o histórico de acessos.");
    } else {
      const summaries: Record<string, AccessSummary> = {};
      ((accessResponse.data ?? []) as AccessAuditLog[]).forEach((access) => {
        if (!access.user_id) return;
        const current = summaries[access.user_id];
        if (!current) {
          summaries[access.user_id] = {
            total: 1,
            lastLoginAt: access.login_at,
            lastLogoutAt: access.logout_at,
            lastLogoutReason: access.logout_reason
          };
          return;
        }

        current.total += 1;
        if (access.logout_at && (!current.lastLogoutAt || access.logout_at > current.lastLogoutAt)) {
          current.lastLogoutAt = access.logout_at;
          current.lastLogoutReason = access.logout_reason;
        }
      });
      setAccessByUser(summaries);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const filteredProfiles = useMemo(
    () =>
      profiles.filter((profile) => filter === "todos" || profile.approval_status === filter),
    [filter, profiles]
  );

  const pendingCount = profiles.filter((profile) => profile.approval_status === "pendente").length;

  async function updateApproval(profile: Profile, status: "aprovado" | "rejeitado") {
    if (!session?.user.id) return;
    setSavingId(profile.id);
    setMessage("");

    const role = roleByUser[profile.id] ?? profile.requested_role;
    const { error } = await supabase
      .from("profiles")
      .update({
        role,
        requested_role: role,
        approval_status: status,
        approved_by: session.user.id,
        approved_at: new Date().toISOString()
      })
      .eq("id", profile.id);

    if (error) {
      setMessage("Não foi possível atualizar a solicitação. Rode o SQL 21 no Supabase.");
    } else {
      setMessage(status === "aprovado" ? "Acesso aprovado com sucesso." : "Solicitação rejeitada.");
      await loadProfiles();
    }
    setSavingId(null);
  }

  return (
    <div>
      <PageHeader
        action={
          <button className="secondary-button" onClick={loadProfiles} type="button">
            <RefreshCw aria-hidden="true" size={17} />
            Atualizar
          </button>
        }
        eyebrow="Administração"
        title="Aprovação de usuários"
      />

      <section className="mb-5 rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted">Solicitações aguardando análise</p>
            <p className="mt-1 text-3xl font-semibold text-ink">{pendingCount}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["pendente", "aprovado", "rejeitado", "todos"] as FilterStatus[]).map((value) => (
              <button
                aria-pressed={filter === value}
                className={`secondary-button px-3 py-2 ${filter === value ? "border-forest bg-forest text-white hover:text-white" : ""}`}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {value === "todos" ? "Todos" : statusLabels[value]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {message ? (
        <div className="mb-5">
          <Notice title={message} tone={message.includes("Não") ? "warning" : "success"} />
        </div>
      ) : null}

      {isLoading ? (
        <Notice title="Carregando solicitações..." />
      ) : filteredProfiles.length === 0 ? (
        <Notice title="Nenhum usuário nesta lista" tone="success" />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {filteredProfiles.map((profile) => {
            const isPending = profile.approval_status === "pendente";
            const access = accessByUser[profile.id];
            const hasBeenInactiveFor60Days = Boolean(
              access && Date.now() - new Date(access.lastLoginAt).getTime() >= 60 * 24 * 60 * 60 * 1000
            );
            return (
              <article className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5" key={profile.id}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-ink">{profile.full_name || "Nome não informado"}</h2>
                    <p className="mt-1 text-sm text-muted">{profile.email || "E-mail não informado"}</p>
                    <p className="mt-1 text-xs text-muted">
                      Solicitado em {new Date(profile.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <StatusBadge tone={profile.approval_status === "aprovado" ? "success" : profile.approval_status === "rejeitado" ? "danger" : "warning"}>
                    {statusLabels[profile.approval_status]}
                  </StatusBadge>
                </div>

                <div className="mb-4 rounded-xl border border-line bg-paper p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">Histórico de acesso</p>
                    {hasBeenInactiveFor60Days ? <StatusBadge tone="warning">Sem acesso há 60 dias</StatusBadge> : null}
                  </div>
                  {access ? (
                    <dl className="grid gap-3 text-sm sm:grid-cols-3">
                      <div><dt className="font-medium text-ink">Último acesso</dt><dd className="mt-1 text-muted">{formatAccessDate(access.lastLoginAt)}</dd></div>
                      <div><dt className="font-medium text-ink">Acessos registrados</dt><dd className="mt-1 text-muted">{access.total}</dd></div>
                      <div>
                        <dt className="font-medium text-ink">Última saída</dt>
                        <dd className="mt-1 text-muted">
                          {formatAccessDate(access.lastLogoutAt)}
                          {access.lastLogoutReason ? ` • ${access.lastLogoutReason === "inatividade" ? "Inatividade" : "Manual"}` : ""}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-sm text-muted">Nenhum acesso registrado após a ativação deste histórico.</p>
                  )}
                </div>

                <label className="block">
                  <span className="field-label">Perfil a liberar</span>
                  <select
                    className="field-input"
                    onChange={(event) =>
                      setRoleByUser((current) => ({
                        ...current,
                        [profile.id]: event.target.value as UserRole
                      }))
                    }
                    value={roleByUser[profile.id] ?? profile.requested_role}
                  >
                    <option value="recepcao">Recepção</option>
                    <option value="lideranca">Liderança</option>
                  </select>
                </label>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    className="primary-button"
                    disabled={savingId === profile.id}
                    onClick={() => updateApproval(profile, "aprovado")}
                    type="button"
                  >
                    {isPending ? <CheckCircle2 aria-hidden="true" size={17} /> : <ShieldCheck aria-hidden="true" size={17} />}
                    {isPending ? "Aprovar acesso" : "Salvar e aprovar"}
                  </button>
                  <button
                    className="danger-button"
                    disabled={savingId === profile.id || profile.approval_status === "rejeitado"}
                    onClick={() => updateApproval(profile, "rejeitado")}
                    type="button"
                  >
                    {profile.approval_status === "pendente" ? <Clock3 aria-hidden="true" size={17} /> : <UserX aria-hidden="true" size={17} />}
                    Rejeitar
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
