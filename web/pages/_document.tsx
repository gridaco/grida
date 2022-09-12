import { Html, Head, Main, NextScript } from "next/document";

export default function Document(props) {
  return (
    <Html lang={"en"}>
      <Head>
        {/* region Font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* Nanum Pen Script, Roboto Mono, Inter */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Nanum+Pen+Script&family=Roboto+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* endregion */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
