import { GridaLogo } from "@/components/grida-logo";
import { GitHubLogoIcon, SlashIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import Image from "next/image";
import PricingComparisonTable from "@/www/pricing/pricing-comparison-table";
import { PricingCard } from "@/www/pricing/pricing-card";

export default function Home() {
  return (
    <main>
      <Header />

      <div className="p-24">
        <section className="relative">
          <div>
            <div className="flex flex-col">
              <h1 className="text-6xl font-bold py-10">
                Forms for
                <br />
                developers
              </h1>
              <p className="text-lg opacity-80 max-w-sm">
                Grida Forms is a{" "}
                <code className="underline">headless & api-first</code> form
                builder for developers
              </p>
            </div>
            <button className="mt-20 px-3 py-2 bg-neutral-800 text-white rounded border border-neutral-800 hover:invert transition-all">
              Start your project
            </button>
          </div>
          <div className="hidden lg:block absolute -top-40 right-0 -z-10">
            <Image
              className="w-[50vw] object-contain"
              src="/assets/landing/hero-main-artwork.png"
              width={1080}
              height={1080}
              alt=""
            />
          </div>
        </section>
        <div className="h-64" />
        <section>
          <div>
            <h2 className="text-4xl font-semibold text-center py-10">
              Deliver an optimized User Experience{" "}
            </h2>
          </div>
          <div className="mt-20">
            <div className="columns-3 grid-rows-2 space-y-8">
              <FeatureCard
                title={"Smart Customer Identity"}
                excerpt={
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                }
              />
              <FeatureCard
                title={"Connect Customer Identity"}
                excerpt={
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                }
              />
              <FeatureCard
                title={"Visual Editor"}
                excerpt={
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                }
              />
              <FeatureCard
                title={"Advanced Analytics"}
                excerpt={
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                }
              />
              <FeatureCard
                title={"Custom branding & form page"}
                excerpt={
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                }
              />
              <FeatureCard
                title={"API access"}
                excerpt={
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                }
              />
            </div>
          </div>
        </section>
        <div className="h-96" />
        <section>
          <div className="py-20 flex flex-col items-center gap-7">
            <h2 className="text-4xl font-semibold text-center">
              Predictable pricing, designed to scale
            </h2>
            <p className="opacity-50 text-center">
              Start building for free, collaborate with a team, then scale to
              millions of users.
            </p>
            <label className="inline-flex items-center cursor-pointer">
              <input type="checkbox" value="" className="sr-only peer" />
              <span className="me-3 text-sm text-gray-900 dark:text-gray-300">
                Monthly
              </span>
              <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-blue  rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              <span className="ms-3 text-sm text-gray-900 dark:text-gray-300">
                Yearly (00% save)
              </span>
            </label>
          </div>
          <div className="columns-1 xl:columns-4 gap-10 w-full">
            <PricingCard
              plan={"Free"}
              price={{
                primary: "$0",
                secondary: "/month",
              }}
              excerpt="Try Grida forms for free"
            />
            <PricingCard
              plan={"Pro"}
              price={{
                primary: "$20",
                secondary: "/month",
              }}
              excerpt="Get start Grida forms for Pro"
              inverted
            />
            <PricingCard
              plan={"Business"}
              price={{
                primary: "$60",
                secondary: "/month",
              }}
              excerpt="Get start Grida forms for Business"
            />
            <PricingCard
              plan={"Enterprise"}
              price={{ primary: "Contact" }}
              excerpt="Get start Grida forms for Enterprise"
            />
          </div>
        </section>
        <PricingComparisonTable />
        <section>
          <div className="py-80 flex flex-col items-center gap-7">
            <GridaLogo />
            <p className="text-4xl font-semibold text-center">
              Build in a weekend, scale to millions
            </p>
            <button
              className="mt-10 px-3 py-2 text-white bg-neutral-800 rounded border border-neutral-800 hover:invert
        transition-all"
            >
              Start your project
            </button>
          </div>
        </section>
        {/* <section>
          <div id="accordion-collapse" data-accordion="collapse">
            <h2 id="accordion-collapse-heading-1">
              <button
                type="button"
                className="flex items-center justify-between w-full p-5 font-sm rtl:text-right rounded-xl dark:focus:ring-gray-800 dark:hover:bg-neutral-800 gap-3"
                data-accordion-target="#accordion-collapse-body-1"
                aria-expanded="true"
                aria-controls="accordion-collapse-body-1"
              >
                <span>What is Grida Forms?</span>
                <svg
                  data-accordion-icon
                  className="w-3 h-3 rotate-180 shrink-0"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 10 6"
                >
                  <path
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5 5 1 1 5"
                  />
                </svg>
              </button>
            </h2>
          </div>
          <div
            id="accordion-collapse-body-1"
            className="hidden"
            aria-labelledby="accordion-collapse-heading-1"
          >
            <div className="p-5 dark:bg-gray-900">
              <p className="mb-2 text-gray-500 dark:text-gray-400">
                Flowbite is an open-source library of interactive components
                built on top of Tailwind CSS including buttons, dropdowns,
                modals, navbars, and more.
              </p>
            </div>
          </div>
        </section> */}
      </div>
      <footer className="mx-auto mt-32 w-full max-w-container px-4 sm:px-6 lg:px-8">
        <div className="border-t border-neutral-400 border-opacity-25 py-10">
          <div className="pt-8 flex flex-col items-center gap-7">
            <GridaLogo />
          </div>
        </div>
        <p className="mt-1 text-center text-sm leading-6 text-current">
          Grida Inc. All rights reserved.
        </p>
        <div className="mt-20 mb-16 flex items-center justify-center text-sm leading-6 text-neutral-500">
          Privacy policy
          <div className="h-4 w-px mx-4 bg-neutral-400 opacity-25"></div>
          <p>Changelog</p>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ title, excerpt }: { title: string; excerpt: string }) {
  return (
    <div className="flex flex-col gap-7">
      <div className="w-7 h-7 bg-gray-200" />
      <div className="flex flex-col gap-1 max-w-52">
        <span className="text-md font-medium">{title}</span>
        <p className=" text-sm font-normal opacity-50">{excerpt}</p>
      </div>
    </div>
  );
}

async function Header() {
  return (
    <header className="top-0 left-0 right-0 p-24 flex justify-between items-center">
      <div className="flex">
        <span className="flex items-center gap-2">
          <Link href="https://grida.co" target="_blank">
            <GridaLogo />
          </Link>
          <SlashIcon width={20} height={20} />
          <Link href="/">
            <span className="text-2xl font-bold dark:text-white">
              Grida Forms
            </span>
          </Link>
        </span>
      </div>
      <div className="flex gap-10 items-center">
        <Link href="https://github.com/gridaco/grida/tree/main/apps/forms">
          <button className="flex justify-center items-center">
            <GitHubLogoIcon className="fill-black" width={24} height={24} />
          </button>
        </Link>
        <Link href="/sign-in">
          <button>Sign in</button>
        </Link>
        <Link href="/sign-in">
          <button className="px-4 py-2 rounded bg-black text-white dark:bg-white dark:text-black">
            Get Started
          </button>
        </Link>
      </div>
    </header>
  );
}
