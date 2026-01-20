"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Platform } from "@/lib/platform";
import { Smile } from "lucide-react";

interface GeneralStepProps {
  data: Platform.WEST.Referral.Wizard.CampaignData;
  updateData: (
    data: Partial<Platform.WEST.Referral.Wizard.CampaignData>
  ) => void;
}

export function GeneralStep({ data, updateData }: GeneralStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-3 rounded-full">
          <Smile className="size-6 text-primary" />
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
        <Field>
          <FieldLabel htmlFor="title">Campaign Title</FieldLabel>
          <Input
            id="title"
            placeholder="Spring 2025 Referral Program"
            value={data.title}
            autoComplete="off"
            onChange={(e) => updateData({ title: e.target.value })}
            maxLength={40}
            required
          />
          <FieldDescription className="text-xs text-muted-foreground">
            This title will be visible to your users.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Campaign Description</FieldLabel>
          <Textarea
            id="description"
            placeholder="Describe the purpose and goals of this campaign..."
            value={data.description}
            onChange={(e) => updateData({ description: e.target.value })}
            rows={4}
          />
          <FieldDescription className="text-xs text-muted-foreground">
            This description is visible to your users.
          </FieldDescription>
        </Field>
      </div>
    </div>
  );
}
