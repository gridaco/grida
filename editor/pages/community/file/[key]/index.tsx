import React, { useEffect, useState } from "react";
import Head from "next/head";
import { SigninToContinuePrmoptProvider } from "components/prompt-banner-signin-to-continue";
import {
  Editor,
  EditorDefaultProviders,
  SetupFigmaCommunityFileEditor,
} from "scaffolds/editor";
import { Workspace, useWorkspaceInitializerContext } from "scaffolds/workspace";
import { useRouter } from "next/router";
import { InferGetServerSidePropsType } from "next";
import { Dialog } from "@mui/material";
import { Readme } from "components/community-files/readme";
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";

type FigmaCommunityFileMeta = InferGetServerSidePropsType<
  typeof getServerSideProps
>;

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
          <SetupFigmaCommunityFileEditor
            key={id}
            filekey={id}
            nodeid={undefined}
            router={router}
          >
            <EditorDefaultProviders>
              <Editor />
            </EditorDefaultProviders>
          </SetupFigmaCommunityFileEditor>
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

export async function getServerSideProps(context) {
  return {
    props: new FigmaCommunityArchiveMetaRepository().getProps(
      context.params.id
    ),
  };
}
