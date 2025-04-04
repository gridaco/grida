"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Smile } from "lucide-react";

interface GeneralStepProps {
  data: any;
  updateData: (data: any) => void;
}

export function GeneralStep({ data, updateData }: GeneralStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-3 rounded-full">
          <Smile className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-medium">
            Welcome to your new referral campaign!
          </h3>
          <p className="text-muted-foreground">
            Let&apos;s start by giving your campaign a name and description.
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md inline-flex items-center mb-2">
        You can change this later
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Campaign Name</Label>
          <Input
            id="name"
            placeholder="Spring 2025 Referral Program"
            value={data.name}
            onChange={(e) => updateData({ name: e.target.value })}
            maxLength={40}
            required
          />
          <p className="text-xs text-muted-foreground">
            This name will be visible to your users.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Campaign Description</Label>
          <Textarea
            id="description"
            placeholder="Describe the purpose and goals of this campaign..."
            value={data.description}
            onChange={(e) => updateData({ description: e.target.value })}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            This description is for internal use only.
          </p>
        </div>
      </div>
    </div>
  );
}
