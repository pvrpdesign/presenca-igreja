import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AccessLogoutReason } from "@/lib/types";

function sessionIdentifier(session: Session) {
  try {
    const payloadPart = session.access_token.split(".")[1];
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(padded)) as { session_id?: string };
    if (payload.session_id && payload.session_id.length >= 8) return payload.session_id;
  } catch {
    // A fallback below identifies the session without storing the access token.
  }

  return `${session.user.id}:${session.expires_at ?? "sessao"}`;
}

export async function registerAccessLogin(session: Session) {
  await supabase.rpc("register_access_login", {
    p_session_id: sessionIdentifier(session)
  });
}

export async function registerAccessLogout(session: Session, reason: AccessLogoutReason) {
  await supabase.rpc("register_access_logout", {
    p_reason: reason,
    p_session_id: sessionIdentifier(session)
  });
}
