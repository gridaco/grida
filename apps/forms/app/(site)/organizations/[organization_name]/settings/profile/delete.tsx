"use client";

import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function DeleteOrganizationConfirm({
  org,
  children,
}: React.PropsWithChildren<{ org: string }>) {
  const [confirm, setConfirm] = useState("");

  const match = confirm === org;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Are you sure you want to delete this?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Deleting the <b>{org}</b> organization will delete all of its
            projects and data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form
          id="delete"
          action={`/private/accounts/organizations/${org}/delete`}
          method="post"
        >
          <div className="grid gap-2">
            <Label htmlFor="confirm">
              Enter this organization’s name to confirm
            </Label>
            <Input
              id="confirm"
              name="confirm"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" form="delete" disabled={!match}>
            Cancel plan and delete this organization
          </Button>
          {/* <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
          >
          </AlertDialogAction> */}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
