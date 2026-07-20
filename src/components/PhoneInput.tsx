import { formatBrazilPhone } from "@/lib/duplicates";

export function PhoneInput({
  autoFocus,
  className = "field-input",
  onChange,
  required,
  value
}: {
  autoFocus?: boolean;
  className?: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <input
      autoComplete="tel"
      autoFocus={autoFocus}
      className={className}
      inputMode="tel"
      maxLength={15}
      onChange={(event) => onChange(formatBrazilPhone(event.target.value))}
      placeholder="Ex.: (71) 99999-9999"
      required={required}
      type="tel"
      value={formatBrazilPhone(value)}
    />
  );
}
