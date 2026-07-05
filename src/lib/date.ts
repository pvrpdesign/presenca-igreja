import type { ServiceType } from "@/lib/types";

export const SERVICE_LABELS: Record<ServiceType, string> = {
  quarta: "Quarta",
  sabado: "Sábado",
  especial: "Especial"
};

export function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function inferServiceType(dateValue: string): ServiceType {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  const weekday = date.getDay();

  if (weekday === 3) return "quarta";
  if (weekday === 6) return "sabado";
  return "especial";
}

export function formatDateBR(dateValue: string) {
  if (!dateValue) return "";
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString("pt-BR");
}

export function serviceTitle(dateValue: string, type: ServiceType) {
  return `${SERVICE_LABELS[type]} - ${formatDateBR(dateValue)}`;
}
