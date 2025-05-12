import React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { CalendarDays, Users, Zap } from "lucide-react";
import Link from "next/link";
import { HomeIcon } from "@radix-ui/react-icons";

export default function WelcomeContent() {
  return (
    <div className="w-dvw h-dvh flex items-center justify-center">
      <Card>
        <CardHeader>
          <CardTitle>Welcome Insiders.</CardTitle>
          <CardDescription>
            Ready to contribute? Here are some helpful links.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-96">
          <div className="grid gap-2">
            <Link href="/dashboard" className="w-full justify-start">
              <Button variant="outline" className="w-full">
                <HomeIcon className="size-4" />
                Home
              </Button>
            </Link>
            <Link
              href="https://grida.co/join-slack"
              target="_blank"
              className="w-full justify-start"
            >
              <Button variant="outline" className="w-full">
                <Users className="size-4" />
                Join Community Chat
              </Button>
            </Link>
            <Link
              href="https://github.com/gridaco/grida/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22"
              target="_blank"
              className="w-full justify-start"
            >
              <Button variant="outline" className="w-full">
                <Zap className="size-4" />
                Explore Good-First-Issues
              </Button>
            </Link>
            <Link
              href="https://cal.com/universe-from-grida/15min"
              target="_blank"
              className="w-full justify-start"
            >
              <Button variant="outline" className="w-full">
                <CalendarDays className="size-4" />
                Schedule a Meeting
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
