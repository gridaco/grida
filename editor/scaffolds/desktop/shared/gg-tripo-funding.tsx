"use client";
// GRIDA-GG: desktop — visible, explicit choice between org credits and BYOK.
import { useId } from "react";
import Link from "next/link";
import { Label } from "@app/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";
import type { GridaGatewayTripo } from "@/lib/desktop/gg-tripo";

export function TripoFunding({
  value,
  onChange,
  hostedSupported,
  disabled,
}: {
  value: GridaGatewayTripo.Provider;
  onChange: (value: GridaGatewayTripo.Provider) => void;
  hostedSupported: boolean;
  disabled: boolean;
}) {
  const id = useId();
  if (!hostedSupported) return null;
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        Pay with
      </Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(value) => {
          if (value === "gg" || value === "tripo") onChange(value);
        }}
      >
        <SelectTrigger id={id} className="h-9 w-full min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gg">Grida credits</SelectItem>
          <SelectItem value="tripo">Your Tripo API key</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function TripoConnection({
  connection,
  onRefresh,
}: {
  connection: GridaGatewayTripo.Connection;
  onRefresh: () => void;
}) {
  return connection.href ? (
    <Link href={connection.href} className="underline underline-offset-4">
      {connection.label}
    </Link>
  ) : connection.retry ? (
    <button
      type="button"
      onClick={onRefresh}
      className="text-left underline underline-offset-4"
    >
      {connection.label} Retry
    </button>
  ) : (
    <span>{connection.label}</span>
  );
}
