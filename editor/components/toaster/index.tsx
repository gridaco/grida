"use client";

import React, { useEffect } from "react";
import toast, { Toaster, useToasterStore } from "react-hot-toast";

function useMaxToasts(max: number) {
  const { toasts } = useToasterStore();

  useEffect(() => {
    toasts
      .filter((t) => t.visible) // Only consider visible toasts
      .filter((_, i) => i >= max) // Is toast index over limit?
      .forEach((t) => toast.dismiss(t.id)); // Dismiss – Use toast.remove(t.id) for no exit animation
  }, [toasts, max]);
}

export function ToasterWithMax({
  max = 10,
  ...props
}: React.ComponentProps<typeof Toaster> & {
  max?: number;
}) {
  useMaxToasts(max);

  return (
    <Toaster
      toastOptions={{
        className:
          "border text-sm bg-background text-foreground fill-foreground",
        success: {
          iconTheme: {
            primary: "hsl(var(--primary))",
            secondary: "hsl(var(--secondary))",
          },
        },
        loading: {
          iconTheme: {
            primary: "hsl(var(--primary))",
            secondary: "hsl(var(--secondary))",
          },
        },
        error: {
          iconTheme: {
            primary: "hsl(var(--destructive))",
            secondary: "hsl(var(--destructive-foreground))",
          },
        },
      }}
      {...props}
    />
  );
}
