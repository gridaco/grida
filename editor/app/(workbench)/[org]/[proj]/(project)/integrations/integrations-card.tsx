"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Integration } from "./data";
import Link from "next/link";
import { GridaLogo } from "@/components/grida-logo";

interface IntegrationCardProps {
  integration: Integration;
  isConnected: boolean;
}

export function IntegrationCard({
  integration,
  isConnected,
}: IntegrationCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(isConnected);

  // const Icon = iconMap[integration.icon];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <GridaLogo className="h-8 w-8" />
          <div>
            <CardTitle className="text-xl">{integration.name}</CardTitle>
            <div className="flex gap-2 mt-1">
              {integration.is_new && (
                <Badge
                  variant="secondary"
                  className="bg-blue-50 text-blue-700 border-blue-200"
                >
                  New
                </Badge>
              )}
              {integration.is_popular && (
                <Badge
                  variant="secondary"
                  className="bg-amber-50 text-amber-700 border-amber-200"
                >
                  Popular
                </Badge>
              )}
            </div>
          </div>
        </div>
        {connectionStatus && (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <CardDescription className="text-sm">
          {integration.description}
        </CardDescription>
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        {connectionStatus ? (
          <div className="flex space-x-2 w-full">
            <Button variant="outline" className="flex-1" asChild>
              <Link href={`/integrations/configure/${integration.id}`}>
                Configure
              </Link>
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive"
              disabled={isLoading}
            >
              {isLoading ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>
        ) : (
          <Button className="w-full" disabled={isLoading}>
            {isLoading ? "Connecting..." : "Connect"}
          </Button>
        )}

        {integration.docs && (
          <Button variant="link" size="sm" className="w-full" asChild>
            <Link
              href={integration.docs}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Documentation
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
