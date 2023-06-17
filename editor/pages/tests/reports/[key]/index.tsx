import React, { useEffect } from "react";
import Head from "next/head";
import { InferGetServerSidePropsType } from "next";
import styled from "@emotion/styled";
import { Client, NodeReportCoverage } from "@codetest/editor-client";
import { CircleIcon } from "@radix-ui/react-icons";

type P = InferGetServerSidePropsType<typeof getServerSideProps>;

export default function ReportPage({ data }: P) {
  return (
    <>
      <Head>
        <title>Report Coverages - @codetest/reports</title>
        {/*  */}
      </Head>
      <Main>
        <h1>
          <code>@codetest/reports</code>
        </h1>
        {/* <code>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </code> */}
        <div className="nodes">
          {Object.keys(data).map((k) => {
            const record: NodeReportCoverage = data[k];
            return <Item key={k} id={k} {...record} />;
          })}
        </div>
        <footer />
      </Main>
    </>
  );
}

const Main = styled.main`
  font-family: monospace;
  width: 400px;
  margin: auto;

  /*  */
  .nodes {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  footer {
    height: 200px;
  }
`;

function Item({ id, a, b, diff, report }: NodeReportCoverage & { id: string }) {
  const [focus, setFocus] = React.useState<"a" | "b" | null>(null);

  return (
    <ItemContainer>
      <header>
        <p className="title">
          <CircleIcon />
          {id} {focus && <span>({focus})</span>}
        </p>
      </header>
      <div className="view" data-focus={focus}>
        <img className="a" src={a} alt="A" />
        <img className="b" src={b} alt="B" />
        <img className="c" src={diff} alt="C" />
        <div
          className="hover-area hover-area-left"
          onMouseEnter={() => setFocus("a")}
          onMouseLeave={() => setFocus(null)}
        />
        <div
          className="hover-area hover-area-right"
          onMouseEnter={() => setFocus("b")}
          onMouseLeave={() => setFocus(null)}
        />
      </div>
    </ItemContainer>
  );
}

const ItemContainer = styled.div`
  display: flex;
  flex-direction: column;

  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;

  width: 400px;
  height: 100%;

  header {
    padding: 16px;
    .title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }

  .view {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;

    .a,
    .b,
    .c {
      position: relative;
      z-index: 1;
      flex: 1 0 auto;
      width: 100%;
      height: auto;
    }

    .a,
    .b {
      pointer-events: none;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      opacity: 0.5;
      transition: opacity 0.1s ease-in-out;
    }

    &[data-focus="a"] .a {
      z-index: 9;
      opacity: 1;
    }

    &[data-focus="b"] .b {
      z-index: 9;
      opacity: 1;
    }

    .hover-area {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 50%;
      height: 100%;
      z-index: 2;
    }

    .hover-area-left {
      cursor: w-resize;
      left: 0;
    }

    .hover-area-right {
      cursor: e-resize;
      right: 0;
    }
  }
`;

export async function getServerSideProps(context: any) {
  const key = context.params.key;

  const client = Client({
    baseURL: "http://localhost:6627",
  });

  try {
    const { data } = await client.file({ file: key });

    return {
      props: {
        data,
      },
    };
  } catch (e) {
    return {
      notFound: true,
    };
  }
}
