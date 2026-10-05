import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useAppearance } from "@/components/appearance-context";

function Toaster(props: ToasterProps) {
  const { appearance } = useAppearance();
  return (
    <Sonner
      theme={appearance}
      richColors
      toastOptions={{
        classNames: {
          toast: "border-border bg-card text-card-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
