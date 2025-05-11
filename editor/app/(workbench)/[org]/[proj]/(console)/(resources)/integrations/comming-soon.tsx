"use client";

import { useEffect, useState } from "react";
import { Building2, MessageSquareText, Puzzle, Rocket } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";

export function IntegrationsCommingSoonDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Open the dialog when the component mounts
    setOpen(true);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto bg-primary/10 p-3 rounded-full mb-4">
            <Puzzle className="size-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            Custom Integrations Available
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            We&apos;re actively expanding our integration ecosystem!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <p className="text-center text-sm">
            While we&apos;re building our integration marketplace, we&apos;re
            happy to create custom integrations tailored specifically to your
            needs.
          </p>

          <div className="grid grid-cols-3 gap-4 py-2">
            <div className="flex flex-col items-center text-center">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <MessageSquareText className="size-5 text-primary" />
              </div>
              <span className="text-xs">Tell us what you need</span>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Building2 className="size-5 text-primary" />
              </div>
              <span className="text-xs">We build it for you</span>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Rocket className="size-5 text-primary" />
              </div>
              <span className="text-xs">Launch together</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-center gap-2">
          <DialogClose asChild>
            <Button variant="outline">Browse Upcoming Integrations</Button>
          </DialogClose>
          <Link href={sitemap.links.contact} target="_blank">
            <Button>Contact Us</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
