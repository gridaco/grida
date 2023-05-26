import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { SigninToContinuePrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor, SetupEditor } from "scaffolds/editor";
import { Workspace, useWorkspaceInitializerContext } from "scaffolds/workspace";
import { useRouter } from "next/router";
import { InferGetStaticPropsType } from "next";
import { Dialog } from "@mui/material";
import { Readme } from "components/community-files/readme";
import { FigmaArchiveMetaFile } from "ssg/community-files";

type FigmaCommunityFileMeta = InferGetStaticPropsType<typeof getStaticProps>;

export default function FigmaCommunityFileEditorPage(
  props: FigmaCommunityFileMeta
) {
  const {
    id,
    // file,
    name,
    description,
    thumbnail_url,
    tags,
    publisher,
  } = props;
  // const data = useMemo(() => JSON.parse(file), []);
  const router = useRouter();
  const [readme, setReadme] = useState(true);
  const [startup, setStartup] = useState(false);

  useEffect(() => {
    if (startup) {
      // setup the editor
    }
  }, [startup]);

  return (
    <>
      <Head>
        <title>{name}</title>
        <meta property="og:title" content={name} />
        <meta property="og:image" content={thumbnail_url} />
        <meta property="og:description" content={description} />
        <meta name="description" content={description} />
        <meta name="tags" content={(tags || []).join(", ")} />
      </Head>
      <Dialog open={readme} maxWidth="lg">
        <Readme
          key={id}
          {...props}
          onProceed={() => {
            setStartup(true);
            setReadme(false);
          }}
        />
      </Dialog>
      <SigninToContinuePrmoptProvider>
        <Workspace>
          <CommunityFileSetup id={id}>
            <SetupEditor
              //
              key={id}
              filekey={id}
              nodeid={undefined}
              router={router}
            >
              <Editor />
            </SetupEditor>
          </CommunityFileSetup>
        </Workspace>
      </SigninToContinuePrmoptProvider>
    </>
  );
}

interface CommunityFileSetupProps {
  /**
   * The file id of the community file.
   */
  id: string;
}

function CommunityFileSetup({
  children,
  id,
}: React.PropsWithChildren<CommunityFileSetupProps>) {
  const { provideEditorSnapshot: initialize } =
    useWorkspaceInitializerContext();

  // TODO:
  return <>{children}</>;
}

export async function getStaticPaths() {
  const fs = require("fs");
  const path = require("path");
  const stage =
    process.env.FIGMA_COMMUNITY_FILES_STAGE === "production" ? "prod" : "dev";
  const metafile = path.join(
    process.cwd(),
    `../data/figma-archives/${stage}/meta.json`
  );

  // read meta.json from data/figma-archives/meta.json
  const meta = JSON.parse(fs.readFileSync(metafile));

  const paths = meta.map(({ id }) => ({
    params: {
      id,
    },
  }));

  return {
    paths: paths,
    fallback: true,
  };
}

export async function getStaticProps(context) {
  const id = context.params.id;

  const file = new FigmaArchiveMetaFile();

  const props = file.getStaticProps(id);

  return {
    props: props,
  };
}
