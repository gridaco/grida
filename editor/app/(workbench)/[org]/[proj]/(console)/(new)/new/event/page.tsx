"use client";
import { Button } from "@/components/ui/button";
import { MaxDialog } from "./_components/max";
import { DescriptionDialog } from "./_components/description";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { Title } from "./_components/title";
import { MainImage } from "./_components/image";
import {
  type Appearance,
  FontFamily,
  TemplatePageBackgroundSchema,
} from "@/types";
import palettes from "@/theme/palettes";
import React, { useMemo, useState } from "react";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import {
  CalendarIcon,
  ShuffleIcon,
  StickyNoteIcon,
  TicketIcon,
} from "lucide-react";
import { cn } from "@/utils";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import { CaretSortIcon } from "@radix-ui/react-icons";
import { ScheduleDialog } from "./_components/schedule";

const theme_preset_thumbnaul = {
  solid: "/assets/page-theme-preview-preset/preset-soild.png",
  shader: "/assets/page-theme-preview-preset/preset-shader.png",
  pattern: "/assets/page-theme-preview-preset/preset-pattern.png",
};

const __images = [
  "/mock/thumbnails/image-01.png",
  "/mock/thumbnails/image-02.png",
  "/mock/thumbnails/image-03.png",
  "/mock/thumbnails/image-04.png",
  "/mock/thumbnails/image-05.png",
  "/mock/thumbnails/image-06.png",
  "/mock/thumbnails/image-07.png",
  "/mock/thumbnails/image-08.png",
  "/mock/thumbnails/image-09.png",
  "/mock/thumbnails/image-10.png",
];

export default function NewEventPage() {
  const maxDialog = useDialogState("max");
  const scheduleDialog = useDialogState("schedule");
  const descriptionDialog = useDialogState("description");

  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [image, setImage] = useState<string>(random(__images));
  const [theme, setTheme] = useState<EventPageTheme>(
    ThemeMaker.randomSolidTheme()
  );

  const descriptionPlainText = useMemo(() => {
    const el = document.createElement("div");
    el.innerHTML = description;
    return el.textContent || "";
  }, [description]);

  const randomize = () => {
    setTheme(ThemeMaker.randomSolidTheme());
    setImage(random(__images));
  };

  return (
    <AgentThemeProvider
      appearance={theme.appearance}
      background={theme.background}
      palette={theme.palette}
      font={theme["font-family"]}
    >
      <main className="py-20">
        <MaxDialog {...maxDialog.props} />
        <DescriptionDialog
          {...descriptionDialog.props}
          onValueCommit={setDescription}
        />
        <ScheduleDialog {...scheduleDialog.props} />
        <div className="container max-w-4xl mx-auto flex gap-4">
          <aside className="min-w-80 max-w-80">
            <div className="w-full">
              <MainImage src={image} />
              <div className="flex h-14 gap-2 mt-4 items-stretch">
                <ThemeSelect className="flex-1" />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-full min-w-14 aspect-square"
                  onClick={randomize}
                >
                  <ShuffleIcon className="size-4" />
                </Button>
              </div>
            </div>
          </aside>
          <aside className="w-full">
            <div className="mt-8">
              <Title value={title} onValueChange={setTitle} />
            </div>
            <div>
              <PropertyLine
                icon={<StickyNoteIcon className="size-4" />}
                label={description ? "Event Description" : "Add Description"}
                onClick={descriptionDialog.openDialog}
              >
                {descriptionPlainText && <p>{descriptionPlainText}</p>}
              </PropertyLine>
            </div>
            <div className="mt-4">
              <Label className="text-sm font-semibold">Registration</Label>
              <PropertyLine
                icon={<TicketIcon className="size-4" />}
                label={"Max"}
                onClick={maxDialog.openDialog}
              />
              <PropertyLine
                icon={<CalendarIcon className="size-4" />}
                label={"Schedule"}
                onClick={scheduleDialog.openDialog}
              />
            </div>
            <div className="w-full mt-10">
              <Button size="lg" className="w-full">
                Create Event
              </Button>
            </div>
          </aside>
        </div>
      </main>
    </AgentThemeProvider>
  );
}

function ThemeSelect({ className }: { className?: string }) {
  return (
    <button
      className={cn(
        "h-14 text-left rounded-md p-2 border border-input flex justify-between gap-2",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Image
          src={theme_preset_thumbnaul.solid}
          width={400}
          height={300}
          alt="thumb"
          className="h-10 w-auto aspect-[4/3] rounded"
        />
        <div>
          <span className="block text-xs">Theme</span>
          <span className="block mt-px">Solid</span>
        </div>
      </div>
      <div className="flex items-center justify-center p-1">
        <CaretSortIcon />
      </div>
    </button>
  );
}

function PropertyLine({
  className,
  children,
  label,
  icon,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  icon: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-h-9 px-4 py-2 flex bg-muted w-full rounded text-sm text-muted-foreground",
        className
      )}
      {...props}
    >
      <span className="size-5">{icon}</span>
      <div className="flex flex-col gap-2">
        <label className="font-semibold">{label}</label>
        {children}
      </div>
    </div>
  );
}

interface EventPageTheme {
  background?: TemplatePageBackgroundSchema;
  palette?: keyof typeof palettes;
  "font-family"?: FontFamily;
  appearance?: Appearance;
}

// preview

namespace ThemeMaker {
  type Palette = (typeof palettes)[keyof typeof palettes];
  type PaletteKey = keyof typeof palettes;
  export function randomPalette(): [PaletteKey, Palette] {
    const keys = Object.keys(palettes);
    const randomKey: PaletteKey = keys[
      Math.floor(Math.random() * keys.length)
    ] as PaletteKey;

    return [randomKey, palettes[randomKey]];
  }

  const fontfamilies: FontFamily[] = ["inconsolata", "inter", "lora"];
  export function randomFontFamily(): FontFamily {
    return fontfamilies[Math.floor(Math.random() * fontfamilies.length)];
  }

  export function randomSolidTheme(): {
    palette: PaletteKey;
    "font-family": FontFamily;
  } {
    return {
      palette: randomPalette()[0],
      "font-family": randomFontFamily(),
    };
  }
}

function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
