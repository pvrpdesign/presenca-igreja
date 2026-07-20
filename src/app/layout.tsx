import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { SystemSettingsProvider } from "@/contexts/SystemSettingsContext";
import { PwaRegistration } from "@/components/PwaRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle de Presença | IASD Calçada",
  description: "Registro de presença da Igreja Adventista do Sétimo Dia - Calçada.",
  applicationName: "IASD Calçada",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IASD Calçada"
  },
  icons: {
    icon: "/app-icon-192.png",
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#8f0037",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaRegistration />
        <SystemSettingsProvider>
          <AuthProvider>{children}</AuthProvider>
        </SystemSettingsProvider>
      </body>
    </html>
  );
}
