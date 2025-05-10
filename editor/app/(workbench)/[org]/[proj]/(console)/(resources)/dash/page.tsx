"use client";

import React from "react";
import { useProject } from "@/scaffolds/workspace";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Head from "next/head";
import Link from "next/link";
import {
  AppWindowMacIcon,
  BarChart2Icon,
  MegaphoneIcon,
  TagsIcon,
  User2Icon,
} from "lucide-react";

const menus = [
  {
    title: "Customers",
    description: "View and manage your customer list and profiles.",
    link: "./customers",
    icon: User2Icon,
  },
  {
    title: "Tags",
    description: "Create and organize tags for better content classification.",
    link: "./tags",
    icon: TagsIcon,
  },
  {
    title: "Site",
    description: "Customize your site layout and domain settings.",
    link: "./www",
    icon: AppWindowMacIcon,
  },
  {
    title: "Analytics",
    description: "Track page views, traffic sources, and user behavior.",
    link: "./analytics",
    icon: BarChart2Icon,
  },
  {
    title: "Campaigns",
    description: "Launch and manage marketing or referral campaigns.",
    link: "./campaigns",
    icon: MegaphoneIcon,
  },
];

export default function ProjectDashboardPage() {
  const project = useProject();

  return (
    <main className="w-full h-full overflow-y-scroll">
      <Head>
        <title>
          {project.organization_name}/{project.name} | Grida
        </title>
      </Head>
      <div className="container mx-auto">
        <header className="py-10 flex justify-between">
          <div>
            <span className="flex items-center gap-2 text-2xl font-black select-none">
              {project.name}
            </span>
          </div>
        </header>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {menus.map((menu, i) => (
            <Link href={menu.link} key={i} className="h-full">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <menu.icon className="size-5" />
                    {menu.title}
                  </CardTitle>
                  <CardDescription>{menu.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
