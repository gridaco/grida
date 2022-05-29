import "../styles/globals.css";
import type { AppProps } from "next/app";
import { GlobalHelpButton } from "@app/fp-customer-support";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <GlobalHelpButton />
      <Component {...pageProps} />;
    </>
  );
}
export default MyApp;
