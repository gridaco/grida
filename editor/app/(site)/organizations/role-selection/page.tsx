"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import React from "react";
import { GridaLogo } from "@/components/grida-logo";
import Link from "next/link";

const professions = [
  "Creative",
  "Knowledge Management",
  "Founder / CEO",
  "Operations",
  "Human Resources",
  "Marketing",
  "Educator",
  "Internal Communication",
  "Customer Service",
  "Engineering",
  "Product Design",
  "Sales",
  "Student",
  "IT Admin",
  "Finance",
  "Project / Program Management",
  "Product Management",
  "Other",
];

const roles = [
  "Executive (C-level / VP)",
  "Department lead",
  "Team manager",
  "Team member",
  "Solo-preneur / Freelancer",
  "Using Notion just for myself",
];

export default function RoleSelectionPage() {
  const [profession, setProfession] = useState("");
  const [role, setRole] = useState("");
  const router = useRouter();

  return (
    <main className="max-w-md mx-auto p-4 md:p-0">
      <Nav />
      <div className="h-40" />
      <header className="text-center py-20">
        <span className="text-muted-foreground text-sm">
          Tell us about yourself
        </span>
        <h1 className="text-xl font-bold">What kind of work do you do?</h1>
      </header>

      <div className="grid gap-6">
        <Label htmlFor="profession" className="text-sm font-medium">
          Select your profession
        </Label>
        <Select
          name="profession"
          value={profession}
          onValueChange={setProfession}
          required
        >
          <SelectTrigger className="w-full">
            {profession || "Select response"}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="" disabled>
              Select response
            </SelectItem>
            {professions.map((professionOption) => (
              <SelectItem key={professionOption} value={professionOption}>
                {professionOption}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label htmlFor="role" className="text-sm font-medium">
          Select your role
        </Label>
        <Select name="role" value={role} onValueChange={setRole} required>
          <SelectTrigger className="w-full">
            {role || "Select response"}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="" disabled>
              Select response
            </SelectItem>
            {roles.map((roleOption) => (
              <SelectItem key={roleOption} value={roleOption}>
                {roleOption}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <footer className="w-full py-10 border-t mt-10">
        <Button
          className="w-full"
          disabled={!profession || !role}
          onClick={() =>
            router.push(
              `/organizations/new?profession=${profession}&role=${role}`
            )
          }
        >
          Next
        </Button>
      </footer>
    </main>
  );
}

function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 w-full p-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <Link href="/">
              <GridaLogo className="w-4 h-4" />
            </Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <Link href="/organizations">organizations</Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>new</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>
      <nav></nav>
    </header>
  );
}
