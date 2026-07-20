import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { SystemSettingsProvider } from "@/contexts/SystemSettingsContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle de Presença | IASD Calçada",
  description: "Registro de presença da Igreja Adventista do Sétimo Dia - Calçada."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <SystemSettingsProvider>
          <AuthProvider>{children}</AuthProvider>
        </SystemSettingsProvider>
      </body>
    </html>
  );
}
