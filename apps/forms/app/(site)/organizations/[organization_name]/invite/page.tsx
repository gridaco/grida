import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GridaLogo } from "@/components/grida-logo";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import Link from "next/link";

export default function NewOrganizationSetupInvitePage({
  params,
}: {
  params: {
    organization_name: string;
  };
}) {
  const { organization_name } = params;

  return (
    <main className="max-w-md mx-auto p-4 md:p-0">
      <Nav organization_name={organization_name} />
      <header className="text-center py-20">
        <span className="text-muted-foreground text-sm">
          Start collaborating
        </span>
        <h1 className="text-xl font-bold">Welcome to {organization_name}</h1>
      </header>
      <form className="flex flex-col gap-8">
        <section className="flex flex-col gap-2 py-4 px-4 border rounded shadow-sm">
          <h2 className="font-semibold">Add organization members</h2>
          <p className="text-sm text-muted-foreground">
            Organization members will be able to view repositories, organize
            into teams, review code, and tag other members using @mentions.
          </p>
          <Link href={""}>
            Learn more about permissions for organizations →
          </Link>
        </section>
        <div className="grid gap-2">
          <Label>Search by username, full name or email address</Label>
          <Input placeholder="Organization name" />
        </div>
        <footer className="flex flex-col gap-2 w-full py-10 border-t">
          <Button className="w-full">Complete setup</Button>
          <Button variant="link" className="w-full">
            Skip this step
          </Button>
        </footer>
      </form>
      {/*  */}
    </main>
  );
}

function Nav({ organization_name }: { organization_name: string }) {
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
          <BreadcrumbPage>{organization_name}</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>
      <nav></nav>
    </header>
  );
}
