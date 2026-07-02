import { Metadata } from "next";
import { Button } from "@app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@app/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@app/ui/components/field";
import { Input } from "@app/ui/components/input";
import { GridaLogo } from "@/components/grida-logo";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Basic sign in for local development",
};

type SerachParams = {
  redirect_uri?: string;
  next?: string;
  /**
   * GRIDA-SEC-005 — desktop sign-in PKCE challenge, forwarded from
   * `/desktop-auth`. When present, the sign-in route completes the
   * desktop deep-link mint instead of the web redirect.
   */
  challenge?: string;
  /** Error code the sign-in route redirects back with (e.g. a failed mint). */
  error?: string;
};

function describeError(code: string): string {
  switch (code) {
    case "desktop_link_failed":
      return "Signed in, but the desktop hand-off failed (is Mailpit running?). Try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

export default async function InsidersBasicAuthPage(props: {
  searchParams: Promise<SerachParams>;
}) {
  const searchParams = await props.searchParams;
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 self-center font-medium"
        >
          <div className="flex size-6 items-center justify-center rounded-md">
            <GridaLogo />
          </div>
          Grida
        </Link>
        <Form searchParams={searchParams} />
      </div>
    </div>
  );
}

function Form({ searchParams }: { searchParams: SerachParams }) {
  return (
    <div>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome Insider !</CardTitle>
          <CardDescription>
            This is a basic auth page for insiders and local development
          </CardDescription>
        </CardHeader>
        <CardContent>
          {searchParams.error && (
            <p className="mb-4 text-sm text-destructive">
              {describeError(searchParams.error)}
            </p>
          )}
          <form method="post" action="/insiders/auth/basic/sign-in">
            <input
              type="hidden"
              name="redirect_uri"
              value={searchParams.redirect_uri}
            />
            <input type="hidden" name="next" value={searchParams.next} />
            <input
              type="hidden"
              name="challenge"
              value={searchParams.challenge}
            />
            <div className="grid gap-6">
              <div className="grid gap-6">
                <FieldGroup className="gap-6">
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="insider@grida.co"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password" className="sr-only">
                      Password
                    </FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      placeholder="password"
                      type="password"
                      required
                    />
                  </Field>
                </FieldGroup>
                <Button type="submit" className="w-full">
                  Login
                </Button>
              </div>
              <div className="text-center text-sm">
                Don&apos;t have an account?{" "}
                <a
                  href="http://localhost:54323/project/default/auth/users"
                  className="underline underline-offset-4"
                  target="_blank"
                >
                  Create a new account
                </a>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
