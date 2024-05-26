"use client";

import resources from "./resources";
import i18n from "i18next";
import React, { useEffect } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";

type InitWith = { lng: string };

i18n.use(initReactI18next).init({
  debug: false,
  resources: resources,
  fallbackLng: "en",
});

export function I18nProvider({
  lng,
  children,
}: React.PropsWithChildren<InitWith>) {
  useEffect(() => {
    i18n.changeLanguage(lng);
  }, [lng]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
