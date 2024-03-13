"use client";

import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import Image from "next/image";
import { ChatBubbleIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import abstract_photo from "../../../public/images/abstract-placeholder.jpg";
import { useSearchParams } from "next/navigation";
import { GridaLogo } from "@/components/grida-logo";

const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export default function SigninPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-col flex-1 bg-alternative">
        <div className="absolute top-0 w-full px-8 mx-auto sm:px-6 lg:px-8 mt-14">
          <nav className="relative flex items-center justify-between sm:h-10">
            <div className="flex items-center flex-grow flex-shrink-0 lg:flex-grow-0">
              <div className="flex items-center justify-between w-full md:w-auto">
                <Link className="flex gap-2 items-center" href="/">
                  <GridaLogo />
                  <span className="font-bold">Grida Forms</span>
                </Link>
              </div>
            </div>
            <div className="items-center hidden space-x-3 md:ml-10 md:flex md:pr-4">
              <Link
                target="_blank"
                rel="noreferrer"
                type="button"
                className="relative justify-center cursor-pointer inline-flex items-center space-x-2 text-center font-regular ease-out duration-200 rounded-md outline-none transition-all outline-0 focus-visible:outline-4 focus-visible:outline-offset-1 border text-foreground bg-button hover:bg-selection border-button hover:border-button-hover focus-visible:outline-brand-600 shadow-sm text-xs px-2.5 py-1"
                href="/contact"
              >
                <ChatBubbleIcon />
                <span className="truncate">Contact</span>
              </Link>
            </div>
          </nav>
        </div>
        <div className="flex flex-1">
          <main className="flex flex-col items-center flex-1 flex-shrink-0 px-5 pt-16 pb-8 border-r shadow-lg bg-background border-default">
            <div className="flex-1 flex flex-col justify-center w-[330px] sm:w-[384px]">
              <div className="mb-10">
                <h1 className="mt-8 mb-2 font-semibold text-2xl lg:text-3xl">
                  Welcome to
                  <br /> Grida Forms
                </h1>
                <h2 className="text-sm text-foreground-light">
                  Sign up or Sign in to your account
                </h2>
              </div>
              <div className="flex flex-col gap-5">
                <ContinueWithGoogleButton />
              </div>
            </div>
            <div className="sm:text-center">
              <p className="text-xs text-foreground-lighter sm:mx-auto sm:max-w-sm">
                By continuing, you agree to Grida&apos;s{" "}
                <a
                  className="underline hover:text-foreground-light"
                  href="https://grida.co/docs/support/terms-and-conditions"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  className="underline hover:text-foreground-light"
                  href="https://grida.co/docs/support/privacy-policy"
                >
                  Privacy Policy
                </a>
                , and to receive periodic emails with updates.
              </p>
            </div>
          </main>
          <aside className="flex-col items-center justify-center flex-1 flex-shrink hidden basis-1/4 xl:flex">
            <div
              className="relative flex flex-col gap-6"
              style={{
                height: "-webkit-fill-available",
              }}
            >
              <div className="flex-1">
                <Image
                  className="object-cover w-full h-full"
                  src={abstract_photo}
                  alt={"Grida office"}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ContinueWithGoogleButton() {
  const supabase = createPagesBrowserClient();
  const search = useSearchParams();
  const next = search.get("next");

  const url = new URL(`${HOST_NAME}/auth/callback`);

  if (next) {
    url.searchParams.set("next", next);
  }

  return (
    <button
      className="flex px-4 py-2 rounded items-center justify-center gap-4 border shadow-sm hover:shadow-md transition-shadow"
      onClick={() => {
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: url.toString(),
          },
        });
      }}
    >
      <GoogleLogo />
      Continue with Google
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg
      className="w-5 h-5 fill-black dark:fill-white"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 210 210"
    >
      <path
        d="M0,105C0,47.103,47.103,0,105,0c23.383,0,45.515,7.523,64.004,21.756l-24.4,31.696C133.172,44.652,119.477,40,105,40
	c-35.841,0-65,29.159-65,65s29.159,65,65,65c28.867,0,53.398-18.913,61.852-45H105V85h105v20c0,57.897-47.103,105-105,105
	S0,162.897,0,105z"
      />
    </svg>
  );
}
