import resources from "@/k/i18n";
import i18next from "i18next";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: {
    lng: string;
  };
}) {
  await i18next.init({
    lng: params.lng,
    fallbackLng: "en",
    debug: false,
    resources: resources,
  });

  return <>{children}</>;
}
