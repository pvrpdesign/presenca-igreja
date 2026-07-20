"use client";

import { Mail } from "lucide-react";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";

export function PrivacyContactEmail({ className = "secondary-button justify-start" }: { className?: string }) {
  const { settings } = useSystemSettings();
  if (!settings.privacy_contact_email) return null;

  return (
    <a className={className} href={`mailto:${settings.privacy_contact_email}`}>
      <Mail aria-hidden="true" size={17} /> {settings.privacy_contact_email}
    </a>
  );
}
