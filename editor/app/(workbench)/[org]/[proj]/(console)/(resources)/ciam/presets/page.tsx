"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { createBrowserCIAMClient } from "@/lib/supabase/client";
import { useProject } from "@/scaffolds/workspace";
import { toast } from "sonner";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlusIcon, StarIcon } from "lucide-react";
import type { Database } from "@app/database";

type PortalPresetRow =
  Database["grida_ciam_public"]["Views"]["portal_preset"]["Row"];

function usePortalPresets() {
  const project = useProject();
  const client = useMemo(() => createBrowserCIAMClient(), []);

  const key = `portal-presets-${project.id}`;

  const { data, isLoading, error, mutate } = useSWR<PortalPresetRow[]>(
    key,
    async () => {
      const { data, error } = await client
        .from("portal_preset")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    }
  );

  const createPreset = useCallback(
    async (name: string) => {
      const { error } = await client.from("portal_preset").insert({
        project_id: project.id,
        name,
      });
      if (error) throw error;
      mutate();
    },
    [client, project.id, mutate]
  );

  const setPrimary = useCallback(
    async (presetId: string) => {
      const { error } = await client.rpc("set_primary_portal_preset", {
        p_project_id: project.id,
        p_preset_id: presetId,
      });
      if (error) throw error;
      mutate();
    },
    [client, project.id, mutate]
  );

  return { presets: data, isLoading, error, createPreset, setPrimary };
}

export default function PortalPresetsPage() {
  const { presets, isLoading, createPreset, setPrimary } =
    usePortalPresets();
  const pathname = usePathname();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await toast.promise(createPreset(newName.trim()), {
        loading: "Creating preset...",
        success: "Preset created",
        error: "Failed to create preset",
      });
      setNewName("");
      setDialogOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleSetPrimary = (presetId: string) => {
    toast.promise(setPrimary(presetId), {
      loading: "Setting primary...",
      success: "Primary preset updated",
      error: "Failed to set primary",
    });
  };

  return (
    <main className="w-full h-full overflow-y-auto">
      <div className="container mx-auto max-w-screen-md">
        <header className="py-10 flex justify-between items-start">
          <div>
            <span className="flex items-center gap-2 text-2xl font-black select-none">
              Portal Presets
            </span>
            <p className="text-sm text-muted-foreground mt-1">
              Manage customer portal variants and customize the OTP verification
              email template.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusIcon className="size-4" />
                New Preset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Portal Preset</DialogTitle>
                <DialogDescription>
                  Give your preset a name. You can configure the email template
                  after creation.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="e.g. Default, VIP Portal"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                >
                  {creating ? <Spinner /> : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </header>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : !presets || presets.length === 0 ? (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-base">No presets yet</CardTitle>
              <CardDescription>
                Create a portal preset to customize the verification email sent
                to customers when they log in.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-3">
            {presets.map((preset) => (
              <Link key={preset.id} href={`${pathname}/${preset.id}`}>
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">
                        {preset.name}
                        {preset.is_primary && (
                          <Badge
                            variant="secondary"
                            className="ms-2 align-middle"
                          >
                            <StarIcon className="size-3" />
                            Primary
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {preset.verification_email_template?.enabled
                          ? "Custom email template enabled"
                          : "Using default email template"}
                        {" · "}
                        Updated{" "}
                        {new Date(preset.updated_at).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    {!preset.is_primary && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          handleSetPrimary(preset.id);
                        }}
                      >
                        Set as Primary
                      </Button>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
