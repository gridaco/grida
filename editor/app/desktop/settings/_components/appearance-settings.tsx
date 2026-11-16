"use client";

import { useTheme } from "next-themes";
import { Label } from "@app/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@app/ui/components/radio-group";

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  return (
    <section data-testid="settings-appearance" className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a theme, or follow your system appearance.
        </p>
      </header>
      <RadioGroup
        aria-label="Theme"
        value={theme ?? "system"}
        onValueChange={setTheme}
        className="gap-3"
      >
        {[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ].map((option) => (
          <Label
            key={option.value}
            htmlFor={`appearance-${option.value}`}
            className="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 font-normal"
          >
            <RadioGroupItem
              id={`appearance-${option.value}`}
              value={option.value}
            />
            {option.label}
          </Label>
        ))}
      </RadioGroup>
    </section>
  );
}
