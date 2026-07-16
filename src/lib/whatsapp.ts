import { normalizeBrazilPhone } from "@/lib/duplicates";

type ThankYouMessageKind = "visitante" | "musica";

export function getThankYouWhatsAppUrl(
  phone: string | null | undefined,
  name: string,
  kind: ThankYouMessageKind
) {
  const normalizedPhone = normalizeBrazilPhone(phone);

  if (!normalizedPhone) return null;

  const internationalPhone = normalizedPhone.startsWith("55")
    ? normalizedPhone
    : `55${normalizedPhone}`;
  const firstName = name.trim().split(/\s+/)[0] || name;
  const message =
    kind === "musica"
      ? `Olá, ${firstName}! Agradecemos por ter participado conosco com a música especial. Foi uma alegria receber você em nossa igreja! Que Deus abençoe sua vida e seu ministério.`
      : `Olá, ${firstName}! Agradecemos por ter visitado nossa igreja. Foi uma alegria receber você! Esperamos vê-lo novamente. Que Deus abençoe sua vida.`;

  return `https://wa.me/${internationalPhone}?text=${encodeURIComponent(message)}`;
}
