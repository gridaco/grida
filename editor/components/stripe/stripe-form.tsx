import Image from "next/image";
import creditcards from "@/public/assets/stripe/visa-mastercard-amex-paypal.png";
import { IdCardIcon, LockClosedIcon } from "@radix-ui/react-icons";
import React from "react";

export function StripeCardForm() {
  return (
    <div className="flex flex-col">
      <div>
        <label className="flex flex-col gap-1 justify-start mb-2 relative text-sm">
          Card number
          <div className="flex w-full relative items-center">
            <div className="relative w-full">
              <Input
                name="cc-number"
                type="tel"
                inputMode="numeric"
                autoComplete="cc-number"
                maxLength={19}
                placeholder="1234 1234 1234 1234"
                defaultValue=""
              />
            </div>
            <Image
              alt="credit cards"
              src={creditcards}
              width={483}
              height={100}
              className="absolute right-0 h-6 w-[120px] mr-3"
            />
          </div>
        </label>
        <div className="flex w-full justify-between gap-x-3">
          <label className="flex w-full flex-col gap-1 justify-start mb-2 text-sm">
            Expiration
            <div className="relative w-full">
              <Input
                name="cc-exp"
                type="text"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM / YY"
                defaultValue=""
              />
            </div>
          </label>
          <label className="flex w-full flex-col gap-1 justify-end mb-2 text-sm">
            CVC
            <div className="flex w-full relative items-center">
              <div className="relative w-full">
                <Input
                  name="cc-csc"
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="CVC"
                  defaultValue=""
                />
              </div>
              <IdCardIcon
                aria-hidden="true"
                className="absolute right-0 h-6 w-6 mr-3 text-neutral-400"
              />
            </div>
          </label>
        </div>
        <div className="flex w-full justify-between gap-x-3">
          <div className="flex w-full flex-col gap-1 justify-start mb-2 text-sm">
            Country
            <div className="relative w-full">
              <Input
                name="country"
                type="text"
                autoComplete="country-name"
                placeholder="United states"
                defaultValue=""
              />
            </div>
          </div>
          <div className="flex w-full flex-col gap-1 justify-end mb-2 text-sm">
            ZIP
            <div className="relative w-full">
              <Input
                name="postal-code"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder={"12345"}
                defaultValue=""
              />
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex w-full">
            <button
              type="button"
              className="items-center border text-base leading-4 font-medium bg-black dark:bg-white text-white dark:text-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black py-1.5 w-full sm:w-auto px-4 flex justify-center  shadow !w-full min-h-[42px] sm:min-h-[38px] border-transparent rounded-md"
            >
              <span className="max-w-full overflow-hidden">
                <div>Pay $10</div>
              </span>
            </button>
          </div>
        </div>
      </div>
      <div className="flex mt-3 justify-center items-center opacity-80">
        <LockClosedIcon />
        <footer className="inline-block z-10">
          <div className="flex justify-center font-normal text-sm underline decoration-dotted">
            Payment secured by Stripe
          </div>
        </footer>
      </div>
    </div>
  );
}

function Input(props: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className="block w-full p-2 text-neutral-900 border border-neutral-300 rounded-lg bg-neutral-50 text-xs focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
    />
  );
}
