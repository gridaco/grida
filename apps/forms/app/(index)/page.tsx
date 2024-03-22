import { GridaLogo } from "@/components/grida-logo";
import { GitHubLogoIcon, SlashIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { CheckIcon } from "@radix-ui/react-icons";
import Image from "next/image";

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
            <button className="mt-20 px-3 py-2 bg-neutral-800 rounded border border-neutral-800 hover:invert transition-all">
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
                title={"Smart Customer Identity"}
                excerpt={
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                }
              />
              <FeatureCard
                title={"Smart Customer Identity"}
                excerpt={
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                }
              />
              <FeatureCard
                title={"Smart Customer Identity"}
                excerpt={
                  "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                }
              />
              <FeatureCard
                title={"Smart Customer Identity"}
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
            <h2 className="text-4xl font-semibold">
              Predictable pricing, designed to scale
            </h2>
            <p className="opacity-50">
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
        <section>
          <div className="flex flex-row">
            <div className="columns-1 py-20 pl-20 gap-4">
              <div>
                <p className="text-lg font-semibold">Free</p>
                <p className=" text-lg opacity-50">$0 / month</p>
              </div>
              <button
                className="mt-8 px-11 py-2 bg-neutral-800 rounded border border-neutral-700 hover:invert
        transition-all"
              >
                Start for free
              </button>
            </div>
            <div className="columns-1 py-20 pl-20 gap-4">
              <div>
                <p className="text-lg font-semibold">Pro</p>
                <p className=" text-lg opacity-50">$0 / month</p>
              </div>
              <button
                className="mt-8 px-11 py-2 bg-neutral-800 rounded border border-neutral-700 hover:invert
        transition-all"
              >
                Start for free
              </button>
            </div>
            <div className="columns-1 py-20 pl-20 gap-4">
              <div>
                <p className="text-lg font-semibold">Business</p>
                <p className=" text-lg opacity-50">$0 / month</p>
              </div>
              <button
                className="mt-8 px-11 py-2 bg-neutral-800 rounded border border-neutral-700 hover:invert
        transition-all"
              >
                Start for free
              </button>
            </div>
            <div className="columns-1 py-20 pl-20 gap-4">
              <div>
                <p className="text-lg font-semibold">Enterprise</p>
                <p className=" text-lg opacity-50">$0 / month</p>
              </div>
              <button
                className="mt-8 px-11 py-2 bg-neutral-800 rounded border border-neutral-700 hover:invert
        transition-all"
              >
                Start for free
              </button>
            </div>
          </div>
        </section>
        <section>
          <div className="py-20 flex flex-col items-center gap-7">
            <GridaLogo />
            <h2 className="text-4xl font-semibold">
              Build in a weekend, scale to millions
            </h2>
            <button
              className="mt-10 px-3 py-2 bg-neutral-800 rounded border border-neutral-800 hover:invert
        transition-all"
            >
              Start your project
            </button>
          </div>
        </section>
        <section>
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
        </section>
      </div>
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
            <span className="text-2xl font-bold dark:text-white">Forms</span>
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

function PricingCard({
  plan,
  price,
  excerpt,
  inverted,
}: {
  //
  plan: string;
  price: {
    primary: string;
    secondary?: string;
  };
  excerpt: string;
  inverted?: boolean;
}) {
  return (
    <div
      data-inverted={inverted}
      className="
      flex-1 flex flex-col p-7 bg-neutral-900 border border-neutral-500/50 gap-8 rounded-lg
      data-[inverted='true']:invert
      hover:scale-[1.02]
      transition-all
      "
    >
      <div className="flex flex-col gap-1">
        <span className="text-3xl font-semibold">{plan}</span>
        <span className=" text-sm font-normal opacity-50">{excerpt}</span>
      </div>
      <div>
        <span className="text-[48px] font-medium">{price.primary}</span>
        {price.secondary && (
          <span className="ml-2 text-sm font-normal opacity-50">
            {price.secondary}
          </span>
        )}
      </div>
      <hr className=" opacity-15" />
      <div className="flex flex-col gap-5">
        <PricingFeatureRow />
        <PricingFeatureRow />
        <PricingFeatureRow />
        <PricingFeatureRow />
        <PricingFeatureRow />
      </div>
      <button
        className="
        text-lg font-medium px-5 py-3 rounded bg-neutral-800
        hover:invert
        transition-all
      "
      >
        Start for free
      </button>
    </div>
  );
}

function PricingFeatureRow() {
  return (
    <div className="flex items-center w-full gap-2">
      <CheckIcon />
      <span className="flex-1">Responses Included</span>
      <span className=" opacity-50">50</span>
    </div>
  );
}
