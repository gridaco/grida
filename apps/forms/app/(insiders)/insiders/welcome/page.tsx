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

export default function WelcomeContent() {
  return (
    <div className="w-dvw h-dvh flex items-center justify-center">
      <Card>
        <CardHeader>
          <CardTitle>Welcome Isiders.</CardTitle>
          <CardDescription>
            Ready to contribute? Here are some helpful links.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-96">
          <div className="grid gap-2">
            <Link
              href="https://grida.co/join-slack"
              target="_blank"
              className="w-full justify-start"
            >
              <Button variant="outline" className="w-full">
                <Users className="mr-2 h-4 w-4" />
                Join Community Chat
              </Button>
            </Link>
            <Link
              href="https://github.com/gridaco/grida/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22"
              target="_blank"
              className="w-full justify-start"
            >
              <Button variant="outline" className="w-full">
                <Zap className="mr-2 h-4 w-4" />
                Explore Good-First-Issues
              </Button>
            </Link>
            <Link
              href="https://cal.com/universe-from-grida/15min"
              target="_blank"
              className="w-full justify-start"
            >
              <Button variant="outline" className="w-full">
                <CalendarDays className="mr-2 h-4 w-4" />
                Schedule a Meeting
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
