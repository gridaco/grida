import { GridaLogo } from "@/components/grida-logo";
import { GitHubLogoIcon, SlashIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import Image from "next/image";
import PricingComparisonTable from "@/www/pricing/pricing-comparison-table";
import { PricingCard, PricingCardButton } from "@/www/pricing/pricing-card";
import {
  AccountTreeIcon,
  ApiIcon,
  DashBoardCustomizeIcon,
  SmartToyIcon,
  AnalysisIcon,
  VisualStudioIcon,
} from "@/www/icons";

export default function Home() {
  return (
    <main>
      <Header />
      <div className="p-24 mt-48">
        <section className="relative">
          <div>
            <div className="flex flex-col items-center text-center">
              <h1 className="text-6xl font-bold py-10 text-center">
                Forms for developers
              </h1>
              <p className="text-lg opacity-80 max-w-md">
                Grida Forms is a{" "}
                <span>
                  <code className="underline">headless & api-first</code> form
                </span>
                builder for developers
              </p>
              <button className="mt-16 px-3 py-2 bg-neutral-800 text-white rounded border border-neutral-800 hover:invert transition-all">
                Start your project
              </button>
            </div>
          </div>
        </section>
        <div className="h-64" />
        <section>
          <div>
            <h2 className="text-4xl font-semibold text-center py-20">
              Elevate User Experience with Tailored Interactivity{" "}
            </h2>
          </div>
          <div className="mt-20">
            <div className="columns-1 lg:columns-2 2xl:columns-3 grid-rows-2 space-y-20">
              <FeatureCard
                icon={<SmartToyIcon size={24} />}
                title={"Smart Customer Identity"}
                excerpt={
                  "Optimize user experience with customizable Smart Customer Identity in your forms."
                }
              />
              <FeatureCard
                icon={<AccountTreeIcon size={24} />}
                title={"Connect Customer Identity"}
                excerpt={
                  "Align your forms with your customers' identity, fostering a personalized and trustworthy interaction."
                }
              />
              <FeatureCard
                icon={<VisualStudioIcon size={24} />}
                title={"Visual Editor"}
                excerpt={
                  "Visual Editor allows users to intuitively customize visuals, ensuring their forms match their unique style."
                }
              />
              <FeatureCard
                icon={<AnalysisIcon size={24} />}
                title={"Advanced Analytics"}
                excerpt={
                  "Advanced Analytics provides detailed insights to optimize your form strategy."
                }
              />
              <FeatureCard
                icon={<DashBoardCustomizeIcon size={24} />}
                title={"Custom branding & form"}
                excerpt={
                  "Customize your form pages with branding elements to align seamlessly with your brand identity."
                }
              />
              <FeatureCard
                icon={<ApiIcon size={24} />}
                title={"API access"}
                excerpt={
                  "API access allows for streamlined integration and enhanced form functionality."
                }
              />
            </div>
          </div>
        </section>
        <div className="h-96" />
        <section>
          <div className="pt-12 pb-20 flex flex-col items-center gap-7">
            <h2 className="text-4xl font-semibold text-center">
              Discover Our Service: Engineered for Your Expansion
            </h2>
            <p className="opacity-50 text-center">
              Begin your creation at no cost, join forces with your team, and
              then expand to reach millions.
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
          <div className="columns-1 lg:columns-2 2xl:columns-4 gap-10 space-y-10 w-full">
            <PricingCard
              plan={"Free"}
              price={{
                primary: "$0",
                secondary: "/month",
              }}
              features={[
                {
                  name: "Responses Included",
                  trail: "50",
                },
                {
                  name: "Additional responses",
                  trail: "X",
                },
                {
                  name: "Number of forms",
                  trail: "5",
                },
                {
                  name: "Blocks per form",
                  trail: "♾️",
                },
                {
                  name: "Seats",
                  trail: "1",
                },
              ]}
              excerpt="Try Grida forms for free"
              action={<PricingCardButton>Start for free</PricingCardButton>}
            />
            <PricingCard
              plan={"Pro"}
              price={{
                primary: "$20",
                secondary: "/month",
              }}
              features={[
                {
                  name: "Responses Included",
                  trail: "1,000",
                },
                {
                  name: "Additional responses",
                  trail: "then $5 per 1K",
                },
                {
                  name: "Number of forms",
                  trail: "♾️",
                },
                {
                  name: "Blocks per form",
                  trail: "♾️",
                },
                {
                  name: "Seats",
                  trail: "♾️",
                },
              ]}
              excerpt="Get start Grida forms for Pro"
              inverted
              action={<PricingCardButton>Get Started</PricingCardButton>}
            />
            <PricingCard
              plan={"Business"}
              price={{
                primary: "$60",
                secondary: "/month",
              }}
              features={[
                {
                  name: "Responses Included",
                  trail: "10,000",
                },
                {
                  name: "Additional responses",
                  trail: "then $1 per 1K",
                },
                {
                  name: "Number of forms",
                  trail: "♾️",
                },
                {
                  name: "Blocks per form",
                  trail: "♾️",
                },
                {
                  name: "Seats",
                  trail: "♾️",
                },
              ]}
              excerpt="Get start Grida forms for Business"
              action={<PricingCardButton>Get Started</PricingCardButton>}
            />
            <PricingCard
              plan={"Enterprise"}
              price={{ primary: "Contact" }}
              features={[
                {
                  name: "Responses Included",
                  trail: "♾️",
                },
                {
                  name: "Additional responses",
                  trail: "$1 per 1K",
                },
                {
                  name: "Number of forms",
                  trail: "♾️",
                },
                {
                  name: "Blocks per form",
                  trail: "♾️",
                },
                {
                  name: "Seats",
                  trail: "♾️",
                },
              ]}
              excerpt="Get start Grida forms for Enterprise"
              action={<PricingCardButton>Contact Sales</PricingCardButton>}
            />
          </div>
        </section>
        <PricingComparisonTable />
        <section className="mt-72">
          <div className="py-80 flex flex-col items-center gap-7">
            <GridaLogo />
            <p className="text-4xl font-semibold text-center">
              Create Effortlessly, Expand Boundlessly
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

function FeatureCard({
  title,
  excerpt,
  icon,
}: {
  title: string;
  excerpt: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex justify-center">
      <div className="flex-col gap-7">
        {icon}
        <div className="flex flex-col gap-1 mt-4 max-w-64">
          <span className="text-md font-medium">{title}</span>
          <p className=" text-sm font-normal opacity-50">{excerpt}</p>
        </div>
      </div>
    </div>
  );
}

async function Header() {
  return (
    <header className="top-0 left-0 right-0 py-14 px-24 flex justify-between items-center">
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
