import resources from "./resources";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

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
