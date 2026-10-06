import * as React from "react";

import {
  normalizeNumberInputValue,
  reconcileNumberInputValue,
} from "@/lib/number-input";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const inputClassName = cn(
    "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
    className,
  );

  if (type === "number" && props.value !== undefined) {
    return <NumberInput className={inputClassName} {...props} />;
  }

  return <input type={type} className={inputClassName} {...props} />;
}

function NumberInput({
  value,
  onChange,
  onBlur,
  ...props
}: React.ComponentProps<"input">) {
  const sourceValue = String(value ?? "");
  const [draft, setDraft] = React.useState(() => ({
    sourceValue,
    text: normalizeNumberInputValue(sourceValue),
  }));

  // Keep temporary edits such as an empty field; accept external recalculations.
  if (draft.sourceValue !== sourceValue) {
    setDraft({
      sourceValue,
      text: reconcileNumberInputValue(draft.text, sourceValue),
    });
  }

  return (
    <input
      {...props}
      type="number"
      value={draft.text}
      onChange={(event) => {
        const text = normalizeNumberInputValue(event.target.value);
        if (text !== event.target.value) event.target.value = text;
        setDraft({ sourceValue, text });
        onChange?.(event);
      }}
      onBlur={(event) => {
        setDraft({
          sourceValue,
          text: normalizeNumberInputValue(sourceValue),
        });
        onBlur?.(event);
      }}
    />
  );
}

export { Input };
