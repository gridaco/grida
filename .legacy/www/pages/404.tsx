import Error from "next/error";
import { getPageTranslations } from "utils/i18n";

// TODO: prefer light color scheme for 404 page

export default function NotFoundPage() {
  return <Error statusCode={404} />;
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale)),
    },
  };
}
