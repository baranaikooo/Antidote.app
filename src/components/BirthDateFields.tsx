import { useState, type Ref } from "react";
import { ChoiceSelect } from "@/components/ui/choice-select";

const digitPair = (number: number) => String(number).padStart(2, "0");
const choices = (values: string[]) => values.map((value) => ({ value, label: value }));
const monthChoices = choices(Array.from({ length: 12 }, (_, i) => digitPair(i + 1)));

function daysInMonth(year: string, month: string) {
  // Keep 29 February available until the year has been chosen.
  return month ? new Date(Number(year) || 2000, Number(month), 0).getDate() : 31;
}

export function BirthDateFields({
  initialValue,
  onChange,
  firstFieldRef,
}: {
  initialValue: string;
  onChange: (date: string) => void;
  firstFieldRef: Ref<HTMLButtonElement>;
}) {
  const [parts, setParts] = useState(() => {
    const [year = "", month = "", day = ""] = initialValue.split("-");
    return { year, month, day };
  });
  const currentYear = new Date().getFullYear();
  const earliestYear = Math.min(currentYear - 100, Number(parts.year) || currentYear);
  const dayChoices = choices(
    Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, i) => digitPair(i + 1)),
  );
  const yearChoices = choices(
    Array.from({ length: currentYear - earliestYear + 1 }, (_, i) => String(currentYear - i)),
  );

  function change(part: keyof typeof parts, value: string) {
    const next = { ...parts, [part]: value };
    if (Number(next.day) > daysInMonth(next.year, next.month)) next.day = "";
    setParts(next);
    onChange(next.year && next.month && next.day ? `${next.year}-${next.month}-${next.day}` : "");
  }

  return (
    <fieldset className="min-w-0 text-left">
      <legend className="mb-2 font-semibold">Dátum narodenia</legend>
      <div className="birth-date-fields">
        <ChoiceSelect
          label="Deň"
          value={parts.day}
          options={dayChoices}
          onValueChange={(value) => change("day", value)}
          triggerRef={firstFieldRef}
        />
        <ChoiceSelect
          label="Mesiac"
          value={parts.month}
          options={monthChoices}
          onValueChange={(value) => change("month", value)}
        />
        <ChoiceSelect
          label="Rok"
          value={parts.year}
          options={yearChoices}
          onValueChange={(value) => change("year", value)}
        />
      </div>
    </fieldset>
  );
}
