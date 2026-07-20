import { normalizeBrazilPhone } from "@/lib/duplicates";

type ThankYouMessageKind = "visitante" | "pastor" | "musica";

export function getThankYouWhatsAppUrl(
  phone: string | null | undefined,
  name: string,
  kind: ThankYouMessageKind,
  template?: string,
  churchName = "IASD Calçada"
) {
  const normalizedPhone = normalizeBrazilPhone(phone);

  if (!normalizedPhone) return null;

  const internationalPhone = normalizedPhone.startsWith("55")
    ? normalizedPhone
    : `55${normalizedPhone}`;
  const firstName = name.trim().split(/\s+/)[0] || name;
  const defaultMessage = kind === "musica"
      ? `Olá, ${firstName}! Agradecemos por ter participado conosco com a música especial. Foi uma alegria receber você em nossa igreja! Que Deus abençoe sua vida e seu ministério.`
      : kind === "pastor"
        ? `Olá, ${firstName}! Agradecemos por sua presença em nossa igreja e por compartilhar a Palavra de Deus conosco. Foi uma alegria receber você! Que Deus continue abençoando sua vida e seu ministério.`
        : `Olá, ${firstName}! Agradecemos por ter visitado nossa igreja. Foi uma alegria receber você! Esperamos vê-lo novamente. Que Deus abençoe sua vida.`;
  const message = template
    ? template.replaceAll("{nome}", firstName).replaceAll("{igreja}", churchName)
    : defaultMessage;

  return `https://wa.me/${internationalPhone}?text=${encodeURIComponent(message)}`;
}
