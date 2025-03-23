"use client";
import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, ExternalLink } from "lucide-react";
import { IntegrationsSearch } from "./integrations-serach";
import { Integration, integrations } from "./data";
import { IntegrationCard } from "./integrations-card";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";

export default function IntegrationsPage() {
  // Get unique integration types for tabs
  const types = Array.from(
    new Set(integrations.flatMap((integration) => integration.categories))
  );

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">
            Connect your favorite tools and services to enhance your workflow.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <IntegrationsSearch />
          <Button variant="outline" asChild>
            <Link href="#">
              <FileText className="mr-2 h-4 w-4" />
              View Documentation
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="connected">Connected</TabsTrigger>
          {types.map((type) => (
            <TabsTrigger key={type} value={type} className="capitalize">
              {type}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="space-y-8">
          {types.map((type) => {
            const typeIntegrations = integrations.filter((i) =>
              i.categories.includes(type)
            );
            return (
              <section key={type}>
                <h2 className="text-xl font-semibold mb-4 capitalize">
                  {type} Tools
                </h2>
                <IntegrationsGrid integrations={typeIntegrations} />
              </section>
            );
          })}
        </TabsContent>

        {types.map((type) => (
          <TabsContent key={type} value={type}>
            <IntegrationsGrid
              integrations={integrations.filter((i) =>
                i.categories.includes(type)
              )}
            />
          </TabsContent>
        ))}
      </Tabs>

      <section className="bg-muted p-6 rounded-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              Need a custom integration?
            </h2>
            <p className="text-muted-foreground">
              Don&apos;t see what you&apos;re looking for? Request a custom
              integration for your specific needs.
            </p>
          </div>
          <Link href={sitemap.links.contact} target="_blank">
            <Button>
              Request Integration
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function IntegrationsGrid({ integrations }: { integrations: Integration[] }) {
  const [searchQuery, setSearchQuery] = useState("");

  // Get search query from URL if present
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q");
    if (query && query !== searchQuery) {
      setSearchQuery(query);
    }
  }

  // Filter integrations based on search query
  const filteredIntegrations = searchQuery
    ? integrations.filter(
        (integration) =>
          integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          integration.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      )
    : integrations;

  if (filteredIntegrations.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium">No integrations found</h3>
        <p className="text-muted-foreground">
          Try adjusting your search or filters
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filteredIntegrations.map((integration) => (
        <IntegrationCard
          key={integration.id}
          integration={integration}
          isConnected={false}
        />
      ))}
    </div>
  );
}
