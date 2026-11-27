import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(
  (
    {
      className,
      "aria-label": label,
      "aria-valuetext": valueText,
      "aria-describedby": describedBy,
      ...props
    },
    ref,
  ) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex min-h-11 w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block size-[1.375rem] rounded-full border-2 border-card bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={label}
        aria-valuetext={valueText}
        aria-describedby={describedBy}
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
