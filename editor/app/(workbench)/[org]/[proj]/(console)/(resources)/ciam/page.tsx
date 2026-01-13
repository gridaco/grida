import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { previewlink } from "@/lib/internal/url";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";

type Params = { org: string; proj: string };

export default async function CIAMConsolePage({
  params,
}: Readonly<{
  params: Promise<Params>;
}>) {
  const { org, proj } = await params;

  const items = [
    {
      title: "Customer portal",
      description: "Open the customer portal login page.",
      href: previewlink({ org, proj, path: "/p/login" }),
    },
    {
      title: "Customer signup (test)",
      description: "Dev-only page to register + verify a customer via OTP.",
      href: previewlink({ org, proj, path: "/p/test/signup" }),
    },
  ] as const;

  return (
    <main className="w-full h-full overflow-y-auto">
      <div className="container mx-auto">
        <header className="py-10 flex justify-between">
          <div>
            <span className="flex items-center gap-2 text-2xl font-black select-none">
              CIAM
            </span>
            <p className="text-sm text-muted-foreground mt-1">
              Verification + session entry points for customer-facing flows.
            </p>
          </div>
        </header>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              target="_blank"
              className="h-full"
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <OpenInNewWindowIcon />
                    {item.title}
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

