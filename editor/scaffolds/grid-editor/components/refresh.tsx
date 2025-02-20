"use client";

import React from "react";
import { Spinner } from "@/components/spinner";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";

export function GridRefreshButton({
  refreshing,
  onRefreshClick,
}: {
  refreshing?: boolean;
  onRefreshClick?: () => void;
}) {
  return (
    <Button
      disabled={refreshing}
      onClick={onRefreshClick}
      variant="outline"
      size="sm"
    >
      <span className="me-2">
        {refreshing ? <Spinner /> : <ReloadIcon className="w-3.5 h-3.5" />}
      </span>
      {refreshing ? "Loading..." : "Refresh"}
    </Button>
  );
}
