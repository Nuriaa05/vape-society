import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclosure({
  title,
  badge,
  children,
  className,
}: {
  title: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details
      className={cn(
        "app-disclosure rounded-lg border border-border bg-card open:bg-muted/20",
        className,
      )}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {title}
          {badge ? (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary dark:text-accent">
              {badge}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="disclosure-chevron h-4 w-4 shrink-0 text-muted-foreground"
        />
      </summary>
      <div className="border-t border-border px-4 py-3">{children}</div>
    </details>
  );
}
