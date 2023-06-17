import React, { useEffect } from "react";
import Head from "next/head";
import { InferGetServerSidePropsType } from "next";
import styled from "@emotion/styled";
import { Client, NodeReportCoverage } from "@codetest/editor-client";

type P = InferGetServerSidePropsType<typeof getServerSideProps>;

export default function QAEditor({ key, data }: P) {
  return (
    <>
      <Head>
        <title>QA - {key}</title>
        {/*  */}
      </Head>
      <Main>
        {/* <code>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </code> */}
        <div className="frames">
          {Object.keys(data).map((k) => {
            const record: NodeReportCoverage = data[k];
            return (
              <div className="item" key={k}>
                <p>{k}</p>
                <div className="images">
                  <img src={record.b} alt="B" />
                  <img src={record.diff} alt="C" />
                  <img src={record.a} alt="A" />
                </div>
              </div>
            );
          })}
        </div>
      </Main>
    </>
  );
}

const Main = styled.main`
  /*  */
  .frames {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-wrap: wrap;
  }

  .item {
    display: flex;
    flex-direction: column;

    width: 400px;
    height: 400px;

    img {
      width: 100%;
      height: auto;
    }

    .images {
      display: flex;
      flex-direction: row;
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
        key,
        data,
      },
    };
  } catch (e) {
    return {
      notFound: true,
    };
  }
}
