import React from "react";
import { Badge } from "@/components/ui/badge";

const IS_DEV = process.env.NODE_ENV === "development";

export function AlphaDisabledFeature({
  children,
}: React.PropsWithChildren<{}>) {
  if (IS_DEV) {
    return <>{children}</>;
  }

  return (
    <div className="w-full h-full relative">
      <div className="absolute z-50 h-full w-full backdrop-blur flex flex-col justify-center items-center gap-8">
        <Badge className="mb-2" variant={"outline"}>
          Alpha
        </Badge>
        <div className="border flex flex-col bg-background/80 shadow rounded-sm items-center justify-center p-10">
          <h1 className="text-2xl font-bold">
            This feature is not available yet
          </h1>
          <p>This feature is currently in alpha and is not available yet.</p>
        </div>
      </div>
      {children}
    </div>
  );
}
