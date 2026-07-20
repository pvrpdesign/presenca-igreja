"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const WARNING_TIME_MS = 5 * 60 * 1000;
const WARNING_AFTER_MS = INACTIVITY_LIMIT_MS - WARNING_TIME_MS;

export function SessionTimeout() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const lastActivityAt = useRef(Date.now());
  const warningOpenRef = useRef(false);
  const isSigningOutRef = useRef(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    warningTimerRef.current = null;
    logoutTimerRef.current = null;
  }, []);

  const logout = useCallback(async () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;
    clearTimers();
    await signOut("inatividade");
    router.replace("/login?motivo=inatividade");
  }, [clearTimers, router, signOut]);

  const openWarning = useCallback((remainingTime = WARNING_TIME_MS) => {
    clearTimers();
    warningOpenRef.current = true;
    setIsWarningOpen(true);
    logoutTimerRef.current = setTimeout(() => {
      void logout();
    }, Math.max(remainingTime, 0));
  }, [clearTimers, logout]);

  const scheduleTimeout = useCallback(() => {
    clearTimers();
    const inactiveFor = Date.now() - lastActivityAt.current;

    if (inactiveFor >= INACTIVITY_LIMIT_MS) {
      void logout();
      return;
    }

    if (inactiveFor >= WARNING_AFTER_MS) {
      openWarning(INACTIVITY_LIMIT_MS - inactiveFor);
      return;
    }

    warningTimerRef.current = setTimeout(() => {
      openWarning(WARNING_TIME_MS);
    }, WARNING_AFTER_MS - inactiveFor);
  }, [clearTimers, logout, openWarning]);

  const continueSession = useCallback(() => {
    warningOpenRef.current = false;
    setIsWarningOpen(false);
    lastActivityAt.current = Date.now();
    scheduleTimeout();
  }, [scheduleTimeout]);

  useEffect(() => {
    const registerActivity = () => {
      if (warningOpenRef.current || isSigningOutRef.current) return;
      lastActivityAt.current = Date.now();
      scheduleTimeout();
    };
    const checkElapsedTime = () => {
      if (document.visibilityState === "visible") scheduleTimeout();
    };
    const activityEvents: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, registerActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", checkElapsedTime);
    scheduleTimeout();

    return () => {
      clearTimers();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, registerActivity);
      });
      document.removeEventListener("visibilitychange", checkElapsedTime);
    };
  }, [clearTimers, scheduleTimeout]);

  if (!isWarningOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-4" role="presentation">
      <section
        aria-describedby="session-timeout-description"
        aria-labelledby="session-timeout-title"
        aria-modal="true"
        className="w-full max-w-md rounded-card border border-line bg-white p-5 shadow-xl sm:p-6"
        role="alertdialog"
      >
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-card bg-gold/20 text-ink">
          <Clock3 aria-hidden="true" size={23} />
        </span>
        <h2 className="text-xl font-semibold text-ink" id="session-timeout-title">Sua sessão está quase encerrando</h2>
        <p className="mt-2 text-sm leading-6 text-muted" id="session-timeout-description">
          O sistema ficou 25 minutos sem atividade. Por segurança, sua sessão será encerrada em até 5 minutos.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button className="primary-button" onClick={continueSession} type="button">
            Continuar conectado
          </button>
          <button className="secondary-button" onClick={() => void logout()} type="button">
            <LogOut aria-hidden="true" size={17} /> Sair agora
          </button>
        </div>
      </section>
    </div>
  );
}
