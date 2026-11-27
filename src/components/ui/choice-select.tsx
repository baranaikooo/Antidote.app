import type { Ref } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export function ChoiceSelect({
  label,
  value,
  options,
  onValueChange,
  id,
  triggerRef,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
  id?: string;
  triggerRef?: Ref<HTMLButtonElement>;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} ref={triggerRef} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent align="start" sideOffset={6}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
