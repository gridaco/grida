"use client";

import resources from "./resources";
import i18n from "i18next";
import React, { useEffect } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";

type InitWith = { lng: string };

export function csr_init_i18n(init: InitWith) {
  const lng = init.lng;
  i18n.use(initReactI18next).init({
    lng: lng,
    debug: false,
    resources: resources,
    preload: [lng],
  });
}
export function I18nProvider({
  lng,
  children,
}: React.PropsWithChildren<InitWith>) {
  useEffect(() => {
    csr_init_i18n({ lng: lng });
  }, [lng]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
