"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppButton({ className = "secondary-button" }: { className?: string }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isAppleDevice, setIsAppleDevice] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsInstalled(standalone);
    setIsAppleDevice(/iPhone|iPad|iPod/i.test(navigator.userAgent));

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => setIsInstalled(true);

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (isInstalled) return null;

  async function install() {
    if (!installPrompt) {
      setShowInstructions(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  }

  return (
    <>
      <button className={className} onClick={() => void install()} type="button">
        <Download aria-hidden="true" size={17} /> Instalar no celular
      </button>

      {showInstructions ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/45 p-4" role="presentation">
          <section aria-modal="true" className="w-full max-w-md rounded-card border border-line bg-white p-5 text-left shadow-xl" role="dialog">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Adicionar à tela inicial</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {isAppleDevice
                    ? "No Safari, toque no botão Compartilhar e depois em Adicionar à Tela de Início."
                    : "Abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial."}
                </p>
              </div>
              <button aria-label="Fechar" className="secondary-button px-2.5 py-2" onClick={() => setShowInstructions(false)} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            {isAppleDevice ? (
              <p className="mt-4 flex items-center gap-2 rounded-card border border-line bg-paper p-3 text-sm text-ink">
                <Share aria-hidden="true" size={18} /> Procure este símbolo na parte inferior do Safari.
              </p>
            ) : null}
            <button className="primary-button mt-5 w-full" onClick={() => setShowInstructions(false)} type="button">Entendi</button>
          </section>
        </div>
      ) : null}
    </>
  );
}
