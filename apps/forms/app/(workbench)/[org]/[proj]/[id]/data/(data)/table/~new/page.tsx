"use client";

import React, { useEffect } from "react";
import { TableIcon } from "@radix-ui/react-icons";
import EmptyWelcome from "@/components/empty";
import Image from "next/image";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { Button } from "@/components/ui/button";
import artwork from "../../../../../../../../../public/images/abstract-database-illustration.png";

export default function WelcomeNewPage() {
  const welcome = useDialogState();

  useEffect(() => {
    // ux delay. open dialog after x
    const timer = setTimeout(() => {
      welcome.openDialog();
    }, 100);
  }, []);

  return (
    <>
      <EmptyWelcome
        art={<TableIcon className="w-10 h-10 text-muted-foreground" />}
        title={"Create your first table"}
        paragraph={"Let's get started by creating your first table."}
      />
      <Dialog {...welcome}>
        <DialogContent hideCloseButton className="outline-none overflow-hidden">
          <div className="-m-6">
            <Image
              src={artwork}
              width={1000}
              height={1000}
              alt="Database illustration"
              className="w-full"
              placeholder="blur"
            />
            <div className="h-12" />
          </div>
          <DialogTitle>Welcome to Grida Database</DialogTitle>
          <DialogDescription>
            Grida Database is a powerful tool for creating and managing your
            data. Get started by creating your first table or connecting to an
            existing database.
          </DialogDescription>
          <DialogClose asChild>
            <Button>Get Started</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}
