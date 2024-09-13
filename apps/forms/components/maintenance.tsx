import Link from "next/link";
import { GridaLogo } from "./grida-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { InstagramLogoIcon, TwitterLogoIcon } from "@radix-ui/react-icons";
import { Button } from "./ui/button";
import { SlackIcon } from "lucide-react";

export default function Maintenance() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen">
      <Card className="max-w-md">
        <CardContent>
          <CardHeader className="text-center">
            <div className="flex items-center justify-center my-4">
              <GridaLogo className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>We'll be back soon!</CardTitle>
            <CardDescription>
              We're currently performing some maintenance on our site. We'll be
              back shortly!
            </CardDescription>
          </CardHeader>
          <hr />
          <div className="py-4 flex items-center justify-center text-center prose prose-sm dark:prose-invert">
            <p>
              <strong>What&apos;s happening</strong>
              <br />
              We are running a regular scheduled maintenance. Please visit our{" "}
              <Link href="https://x.com/grida_co" target="_blank">
                <TwitterLogoIcon className="h-4 w-4 text-primary inline-block align-middle" />
                status
              </Link>{" "}
              for more information.
            </p>
          </div>
          <footer>
            <Link href="/">
              <Button className="w-full" variant="outline">
                Home
              </Button>
            </Link>
          </footer>
        </CardContent>
      </Card>
      <hr className="my-10 w-full" />
      <footer className="flex flex-wrap max-w-sm gap-4">
        <Link href="https://x.com/grida_co" target="_blank">
          <TwitterLogoIcon className="h-4 w-4" />
        </Link>
        <Link href="https://instagram.com/grida.co" target="_blank">
          <InstagramLogoIcon className="h-4 w-4" />
        </Link>
        <Link href="https://grida.co/join-slack" target="_blank">
          <SlackIcon className="h-4 w-4" />
        </Link>
      </footer>
    </main>
  );
}
