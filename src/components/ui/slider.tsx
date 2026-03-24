import { useMemo } from "react";
import type { ComponentProps } from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "src/lib/utils";

function resolveValues(
  value: number[] | undefined,
  defaultValue: number[] | undefined,
  min: number,
  max: number,
): number[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(defaultValue)) {
    return defaultValue;
  }
  return [min, max];
}

export default function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  disabledThumbs,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root> & {
  disabledThumbs?: Set<number>;
}): React.JSX.Element {
  const _values = useMemo(
    () => resolveValues(value, defaultValue, min, max),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => {
        const isDisabled = disabledThumbs?.has(index) ?? false;
        return (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(
              "border-primary ring-ring/50 block size-4 shrink-0 rounded-full border bg-white shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50",
              isDisabled && "pointer-events-none opacity-30 cursor-default",
            )}
            aria-disabled={isDisabled || undefined}
            tabIndex={isDisabled ? -1 : undefined}
          />
        );
      })}
    </SliderPrimitive.Root>
  );
}
