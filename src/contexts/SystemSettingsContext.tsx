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
  member_absence_message: "Olá, {nome}! Sentimos sua falta nos últimos sábados e queremos saber como você está. Podemos orar por você?",
  visitor_absence_message: "Olá, {nome}! Sentimos sua falta na {igreja} e gostaríamos de saber como você está. Esperamos receber você novamente em breve!",
  visitor_thank_you_message: "Olá, {nome}! Agradecemos por ter visitado a {igreja}. Foi uma alegria receber você! Esperamos vê-lo novamente. Que Deus abençoe sua vida.",
  pastor_thank_you_message: "Olá, {nome}! Agradecemos por sua presença na {igreja} e por compartilhar a Palavra de Deus conosco. Foi uma alegria receber você! Que Deus continue abençoando sua vida e seu ministério.",
  music_thank_you_message: "Olá, {nome}! Agradecemos por ter participado conosco com a música especial na {igreja}. Foi uma alegria receber você! Que Deus abençoe sua vida e seu ministério.",
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

    if (!error && data) setSettings({ ...defaultSystemSettings, ...data } as SystemSettings);
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
