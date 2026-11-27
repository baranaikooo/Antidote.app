import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function DisclosureSummary({ className, children, ...props }: ComponentProps<"summary">) {
  return (
    <summary className={cn("antidote-disclosure", className)} {...props}>
      {children}
      <ChevronDown className="antidote-disclosure-icon" aria-hidden="true" />
    </summary>
  );
}
