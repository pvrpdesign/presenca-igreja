import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";

type ExportAuthorization = {
  userId: string | undefined;
  userRole: UserRole | undefined;
  exportType: string;
  fileName: string;
  recordCount: number;
  filters?: Record<string, string | number | boolean | null>;
};

export async function authorizeDataExport({
  userId,
  userRole,
  exportType,
  fileName,
  recordCount,
  filters = {}
}: ExportAuthorization) {
  if (!userId || !userRole) {
    window.alert("Sua sessão não foi identificada. Entre novamente antes de exportar.");
    return false;
  }

  const purpose = window.prompt(
    "Informe a finalidade desta exportação. Ex.: planejamento da recepção ou reunião da liderança."
  );

  if (purpose === null) return false;

  const normalizedPurpose = purpose.trim();
  if (normalizedPurpose.length < 5) {
    window.alert("Descreva a finalidade da exportação com pelo menos 5 caracteres.");
    return false;
  }

  const confirmed = window.confirm(
    "Este arquivo contém dados pessoais. Mantenha-o protegido, compartilhe somente com pessoas autorizadas e exclua-o quando deixar de ser necessário. Deseja continuar?"
  );

  if (!confirmed) return false;

  const { error } = await supabase.from("export_audit_logs").insert({
    user_id: userId,
    user_role: userRole,
    export_type: exportType,
    file_name: fileName,
    purpose: normalizedPurpose,
    record_count: recordCount,
    filters
  });

  if (error) {
    window.alert("Não foi possível registrar a exportação. Rode o SQL 20 no Supabase e tente novamente.");
    return false;
  }

  return true;
}

