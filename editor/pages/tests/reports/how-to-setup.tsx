import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";

export default function HowToSetupReports() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>How to setup local server for @codetest/reports</title>
      </Head>

      <main
        style={{
          textAlign: "center",
          width: 400,
          margin: "auto",
        }}
      >
        <h1>
          How to setup local server for <code>@codetest/reports</code>
        </h1>
        <p>
          <code>@codetest/reports</code> is a package that allows you to run
          engine tests locally, due to its high maintainance cost, we don't
          provide official reports server yet.
          <br />
          <br />
          <b>To generate reports, run the following command:</b>
          <br />
          <br />
          <code>
            cd testing/reports
            <br />
            yarn build
            <br />
            yarn start
          </code>
          <br />
          <br />
          <b>To run local reports server, run the following command:</b>
          <br />
          <br />
          <code>
            cd testing/server
            <br />
            yarn dev
          </code>
          <br />
          <br />
          <b>Go back to the page after server has started</b>
          <br />
          <br />
          <button
            onClick={() => {
              router.replace("/tests/reports");
            }}
          >
            I've started the server, Go back to the page
          </button>
        </p>
      </main>
    </>
  );
}
