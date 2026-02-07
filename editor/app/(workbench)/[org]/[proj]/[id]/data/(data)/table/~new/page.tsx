"use client";

import React, { useEffect } from "react";
import { TableIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui-editor/dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { Button } from "@/components/ui/button";
import artwork from "../../../../../../../../../public/images/abstract-database-illustration.png";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function WelcomeNewPage() {
  const welcome = useDialogState();

  useEffect(() => {
    // ux delay. open dialog after x
    setTimeout(() => {
      welcome.openDialog();
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TableIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle>Create your first table</EmptyTitle>
          <EmptyDescription>
            Let&apos;s get started by creating your first table.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <Dialog {...welcome.props}>
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
