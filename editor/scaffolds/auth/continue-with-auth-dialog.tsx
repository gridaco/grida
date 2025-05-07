"use client";

import React from "react";
import { GridaLogo } from "@/components/grida-logo";
import { ContinueWithGoogleButton } from "./continue-with-google-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ContinueWithAuthProps {
  next?: string;
  redirect_uri?: string;
  onSuccess?: () => void;
}

export function ContinueWithAuthDialog({
  open,
  onOpenChange,
  next,
  redirect_uri,
  onSuccess,
}: React.ComponentProps<typeof Dialog> & ContinueWithAuthProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <GridaLogo className="h-8 w-8" />
          </div>
          <DialogTitle className="text-center">Sign in required</DialogTitle>
          <DialogDescription className="text-center">
            To use Grida you must log into an existing account or create one
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <ContinueWithGoogleButton
            next={next}
            redirect_uri={redirect_uri}
            skipBrowserRedirect={true}
            onSuccess={onSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
