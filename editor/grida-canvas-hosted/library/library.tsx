"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import { IconsBrowser, type IconsBrowserItem } from "./icons-browser";
import { PhotosBrowser } from "./photos-browser";
import type { PhotoAsset } from "./lib-photos-actions";
import { ShapesBrowser, type ShapeAsset } from "./shapes-browser";
import { WidgetsBrowser } from "./widgets-browser";
import { LogosBrowser } from "./icons-logos-browser";
import { useLocalStorage } from "@uidotdev/usehooks";
import { toast } from "sonner";
import { cn } from "@/components/lib/utils";
import cg from "@grida/cg";
import cmath from "@grida/cmath";
import { datatransfer } from "@/grida-canvas/data-transfer";

function TabButton({
  value,
  active,
  onClick,
  children,
}: {
  value: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 text-xs rounded",
        active
          ? "font-semibold text-foreground"
          : "font-normal text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

type ThemeOverride = "light" | "dark";

/**
 * Unified Library UI Component
 *
 * Provides a tabbed interface for browsing and inserting Icons, Photos, Shapes, Logos, and Widgets
 * directly into the editor. This component handles insertion automatically.
 */
export function Library() {
  const instance = useCurrentEditor();
  const [tab, setTab] = useLocalStorage("grida-library-tab", "icons");
  const [themeOverride, setThemeOverride] = useState<ThemeOverride | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const handleInsertIcon = useCallback(
    async (icon: IconsBrowserItem) => {
      const task = fetch(icon.download, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Failed to fetch icon");
          }
          return res.text();
        })
        .then((svg) => instance.commands.createNodeFromSvg(svg))
        .then((node) => {
          node.$.name = icon.name || node.$.name;
        });

      toast.promise(task, {
        loading: "Loading icon...",
        success: "Icon inserted",
        error: "Failed to insert icon",
      });
    },
    [instance.commands]
  );

  const handleIconDragStart = useCallback(
    (icon: IconsBrowserItem, event: React.DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(
        datatransfer.key,
        datatransfer.encode({
          type: "svg",
          name: icon.name,
          src: icon.download,
        })
      );
    },
    []
  );

  const handlePhotoDragStart = useCallback(
    (photo: PhotoAsset, event: React.DragEvent<HTMLElement>) => {
      const imageUrl = photo.urls.regular || photo.urls.full || photo.urls.raw;
      if (imageUrl) {
        event.dataTransfer.setData(
          datatransfer.key,
          datatransfer.encode({
            type: "image",
            name: photo.alt || "Photo",
            src: imageUrl,
            width: photo.width,
            height: photo.height,
          })
        );
      }
    },
    []
  );

  const handleInsertPhoto = useCallback(
    async (photo: PhotoAsset) => {
      const task = (async () => {
        try {
          // raw might be too big?
          // const imageUrl = photo.urls.full || photo.urls.raw;
          const imageUrl = photo.urls.regular;
          if (!imageUrl) {
            throw new Error("No image URL available");
          }

          const imageRef = await instance.createImageAsync(imageUrl);
          const node = instance.commands.createRectangleNode();

          node.$.layout_positioning = "absolute";
          node.$.name = photo.alt || "Photo";
          node.$.layout_target_width = imageRef.width;
          node.$.layout_target_height = imageRef.height;

          node.$.fill_paints = [
            {
              type: "image",
              src: imageRef.url,
              fit: "cover",
              transform: cmath.transform.identity,
              filters: cg.def.IMAGE_FILTERS,
              blend_mode: cg.def.BLENDMODE,
              opacity: 1,
              active: true,
            } satisfies cg.ImagePaint,
          ];
        } catch (error) {
          throw error instanceof Error
            ? error
            : new Error("Failed to insert photo");
        }
      })();

      toast.promise(task, {
        loading: "Loading photo...",
        success: "Photo inserted",
        error: "Failed to insert photo",
      });
    },
    [instance]
  );

  const handleInsertShape = useCallback(
    async (shape: ShapeAsset) => {
      const task = fetch(shape.src, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Failed to fetch shape");
          }
          return res.text();
        })
        .then((svg) => instance.commands.createNodeFromSvg(svg))
        .then((node) => {
          node.$.name = shape.name.split(".svg")[0] || shape.name;
        });

      toast.promise(task, {
        loading: "Loading shape...",
        success: "Shape inserted",
        error: "Failed to insert shape",
      });
    },
    [instance.commands]
  );

  const handleShapeDragStart = useCallback(
    (shape: ShapeAsset, event: React.DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(
        datatransfer.key,
        datatransfer.encode({
          type: "svg",
          name: shape.name,
          src: shape.src,
        })
      );
    },
    []
  );

  const handleInsertLogo = useCallback(
    async (logo: IconsBrowserItem) => {
      const task = fetch(logo.download, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Failed to fetch logo");
          }
          return res.text();
        })
        .then((svg) => instance.commands.createNodeFromSvg(svg))
        .then((node) => {
          node.$.name = logo.name || node.$.name;
        });

      toast.promise(task, {
        loading: "Loading logo...",
        success: "Logo inserted",
        error: "Failed to insert logo",
      });
    },
    [instance.commands]
  );

  const handleLogoDragStart = useCallback(
    (logo: IconsBrowserItem, event: React.DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData(
        datatransfer.key,
        datatransfer.encode({
          type: "svg",
          name: logo.name,
          src: logo.download,
        })
      );
    },
    []
  );

  const handleShouldThemeChange = useCallback((theme: ThemeOverride) => {
    setThemeOverride(theme);
  }, []);

  // Reset theme override when switching away from logos tab
  useEffect(() => {
    if (tab !== "logos") {
      setThemeOverride(null);
    }
  }, [tab]);

  return (
    <div
      ref={containerRef}
      data-theme-override={themeOverride ?? undefined}
      className={cn("h-full flex flex-col bg-background", themeOverride)}
    >
      <div className="flex gap-1 px-2 pt-2">
        <TabButton
          value="icons"
          active={tab === "icons"}
          onClick={() => setTab("icons")}
        >
          Icons
        </TabButton>
        <TabButton
          value="photos"
          active={tab === "photos"}
          onClick={() => setTab("photos")}
        >
          Photos
        </TabButton>
        <TabButton
          value="logos"
          active={tab === "logos"}
          onClick={() => setTab("logos")}
        >
          Logos
        </TabButton>
        <TabButton
          value="shapes"
          active={tab === "shapes"}
          onClick={() => setTab("shapes")}
        >
          Shapes
        </TabButton>
        {/* <TabButton
          value="widgets"
          active={tab === "widgets"}
          onClick={() => setTab("widgets")}
        >
          Widgets
        </TabButton> */}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "icons" && (
          <IconsBrowser
            onInsert={handleInsertIcon}
            onDragStart={handleIconDragStart}
          />
        )}
        {tab === "photos" && (
          <PhotosBrowser
            onInsert={handleInsertPhoto}
            onDragStart={handlePhotoDragStart}
          />
        )}
        {tab === "shapes" && (
          <ShapesBrowser
            onInsert={handleInsertShape}
            onDragStart={handleShapeDragStart}
          />
        )}
        {tab === "logos" && (
          <LogosBrowser
            onInsert={handleInsertLogo}
            onDragStart={handleLogoDragStart}
            onShouldThemeChange={handleShouldThemeChange}
          />
        )}
        {tab === "widgets" && <WidgetsBrowser />}
      </div>
    </div>
  );
}
