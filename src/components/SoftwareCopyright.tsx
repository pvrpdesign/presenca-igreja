export function SoftwareCopyright({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs leading-5 text-muted ${className}`.trim()}>
      Software © 2026 Paulo Victor Silva de Oliveira LTDA.<br />
      CNPJ 57.152.299/0001-17. Todos os direitos reservados.
    </p>
  );
}
