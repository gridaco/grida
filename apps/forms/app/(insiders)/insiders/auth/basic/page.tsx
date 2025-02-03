import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GridaLogo } from "@/components/grida-logo";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Basic sign in for local development",
};

export default function InsidersBasicAuthPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="flex h-6 w-6 items-center justify-center rounded-md">
            <GridaLogo />
          </div>
          Grida
        </a>
        <Form />
      </div>
    </div>
  );
}

function Form() {
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
          <form method="post" action="/insiders/auth/basic/sign-in">
            <div className="grid gap-6">
              <div className="grid gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Input
                    id="password"
                    name="password"
                    placeholder="Password"
                    type="password"
                    required
                  />
                </div>
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
