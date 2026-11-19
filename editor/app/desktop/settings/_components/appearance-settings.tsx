"use client";

import { useTheme } from "next-themes";
import { Label } from "@app/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@app/ui/components/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import { cn } from "@app/ui/lib/utils";

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

const PALETTES = {
  light:
    "bg-[#f2f2f2] [--sample-window:#fff] [--sample-rail:#f8f8f8] [--sample-border:#dedede] [--sample-mark:#d6d6d6] [--sample-bubble:#ededed]",
  dark: "bg-[#2c2c2c] [--sample-window:#1c1c1c] [--sample-rail:#242424] [--sample-border:#3e3e3e] [--sample-mark:#515151] [--sample-bubble:#383838]",
};

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
        orientation="horizontal"
        value={theme ?? "system"}
        onValueChange={setTheme}
        className="max-w-md grid-cols-3 gap-3.5"
      >
        {THEMES.map(({ value, label }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <Label
                htmlFor={`appearance-${value}`}
                className="group block min-w-0 cursor-pointer"
              >
                <RadioGroupItem
                  id={`appearance-${value}`}
                  aria-label={label}
                  value={value}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className="relative block aspect-[8/5] overflow-hidden rounded-xl border border-border group-hover:border-foreground/30 group-has-data-[state=checked]:border-transparent group-has-data-[state=checked]:ring-2 group-has-data-[state=checked]:ring-foreground group-has-[:focus-visible]:outline-2 group-has-[:focus-visible]:outline-offset-4 group-has-[:focus-visible]:outline-ring"
                >
                  <WindowSample tone={value === "dark" ? "dark" : "light"} />
                  {value === "system" && <WindowSample tone="dark" rightHalf />}
                </span>
              </Label>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </RadioGroup>
    </section>
  );
}

function WindowSample({
  tone,
  rightHalf = false,
}: {
  tone: keyof typeof PALETTES;
  rightHalf?: boolean;
}) {
  return (
    <span
      className={cn(
        "absolute inset-0",
        PALETTES[tone],
        rightHalf && "[clip-path:inset(0_0_0_50%)]"
      )}
    >
      <span className="absolute inset-x-[10%] -bottom-1 top-[17%] flex overflow-hidden rounded-t-md border border-(--sample-border) bg-(--sample-window) shadow-xs shadow-black/10">
        <span className="flex w-[26%] flex-col items-center gap-1 border-r border-(--sample-border) bg-(--sample-rail) pt-2">
          <span className="size-2 rounded-[2px] bg-(--sample-mark)" />
          <span className="h-0.5 w-2 rounded-full bg-(--sample-mark)" />
          <span className="h-0.5 w-2 rounded-full bg-(--sample-mark)" />
        </span>
        <span className="relative flex-1">
          <span className="absolute inset-x-[12%] top-[14%] grid gap-1">
            <span className="ml-auto h-2 w-3/5 rounded-full bg-(--sample-bubble)" />
            <span className="h-0.5 w-4/5 rounded-full bg-(--sample-mark)" />
            <span className="h-0.5 w-1/2 rounded-full bg-(--sample-mark)" />
          </span>
          <span className="absolute inset-x-[12%] bottom-[12%] h-2.5 rounded-full border border-(--sample-border)" />
        </span>
      </span>
    </span>
  );
}
