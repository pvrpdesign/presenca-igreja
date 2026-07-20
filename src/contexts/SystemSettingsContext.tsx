"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { SystemSettings } from "@/lib/types";

export const defaultSystemSettings: SystemSettings = {
  id: true,
  church_name: "IASD Calçada",
  privacy_contact_email: "lideranca@iasdcalcada.com.br",
  member_absence_threshold: 2,
  visitor_absence_threshold: 4,
  session_timeout_minutes: 30,
  thank_you_message: "Olá, {nome}! Agradecemos por sua presença na {igreja}. Foi uma alegria receber você! Que Deus abençoe sua vida.",
  invitation_message: "Olá, {nome}! Foi uma alegria receber você na {igreja}. Gostaríamos de conversar sobre uma nova participação em nossa igreja.",
  updated_by: null,
  updated_at: ""
};

type SystemSettingsContextValue = {
  settings: SystemSettings;
  refreshSettings: () => Promise<void>;
};

const SystemSettingsContext = createContext<SystemSettingsContextValue | null>(null);

export function SystemSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(defaultSystemSettings);

  const refreshSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from("system_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (!error && data) setSettings(data as SystemSettings);
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const value = useMemo(() => ({ settings, refreshSettings }), [refreshSettings, settings]);
  return <SystemSettingsContext.Provider value={value}>{children}</SystemSettingsContext.Provider>;
}

export function useSystemSettings() {
  const context = useContext(SystemSettingsContext);
  if (!context) throw new Error("useSystemSettings must be used within SystemSettingsProvider");
  return context;
}
