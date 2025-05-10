"use client";
import React, { useState } from "react";
import { PhoneInput } from "@/components/extension/phone-input";
import { type CountryCode } from "libphonenumber-js/core";

const PhoneFieldDefaultCountryContext = React.createContext<
  CountryCode | undefined
>(undefined);

function usePhoneFieldDefaultCountry(fallback?: CountryCode) {
  const context = React.use(PhoneFieldDefaultCountryContext);
  return context ?? fallback;
}

export function PhoneFieldDefaultCountryProvider({
  children,
  defaultCountry,
}: React.PropsWithChildren<{
  defaultCountry: CountryCode | undefined | (string | {});
}>) {
  return (
    <PhoneFieldDefaultCountryContext.Provider
      value={defaultCountry as CountryCode | undefined}
    >
      {children}
    </PhoneFieldDefaultCountryContext.Provider>
  );
}

export function PhoneField({
  id,
  name,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof PhoneInput>, "onChange"> & {
  onValueChange?: (value: string) => void;
  defaultCountry?: CountryCode;
}) {
  const defaultCountry = usePhoneFieldDefaultCountry(props.defaultCountry);
  const [value, setValue] = useState<string>(props.value ?? "");
  return (
    <>
      <input type="hidden" id={id} name={name} value={value} />
      <PhoneInput
        {...props}
        value={value}
        defaultCountry={defaultCountry}
        onChange={(value) => {
          console.log("onChange", value);
          setValue(value);
          onValueChange?.(value);
        }}
      />
    </>
  );
}
