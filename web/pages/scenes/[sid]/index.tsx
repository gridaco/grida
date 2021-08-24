import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import Axios from "axios";

import { useRouter } from "next/router";

import { QuicklookQueryParams } from "@base-sdk/base/features/quicklook";
import Editor, { useMonaco } from "@monaco-editor/react";
import CircularProgress from "@material-ui/core/CircularProgress";

// import FrameFlutter from "../../components/frame-flutter";
import DashboardAppbar from "@app/scene-view/components/appbar/dashboard.appbar";
import Toolbar from "@app/scene-view/components/toolbar";
import { checkFrameSourceMode } from "@base-sdk/base/frame-embed";
import { AppFramework, AppLanguage } from "@base-sdk/base/types";
import Background from "@app/scene-view/components/canves/background";
import { EditorThemeProvider } from "../../../../ui/editor-ui/packages/editor-ui-theme";
import { TopBar } from "../../../../app/components";
import { ShareModalContents } from "../../../../app/components/share-modal";
import { makeService } from "services/scenes-store";
import { SceneRecord } from "@base-sdk/scene-store";

interface IQuicklookQueries extends QuicklookQueryParams {
  globalizationRedirect?: string;
}

/**
 * frame or url is required
 * @param frame the frame id of selected node, which uploaded to default bridged quicklook s3 buket.
 * @param url the custom url of the compiled js file. any source is allowed.
 */
export default function ScenesId() {
  const router = useRouter();
  const [source, setSource] = useState<string>();
  const [data, setData] = useState<SceneRecord>();
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const onClickShare = (isViaible) => setIsShareModalOpen(isViaible);

  const service = makeService();

  let editingSource: string;
  // const query: IQuicklookQueries = {
  //   id: (router.query.sid as string) ?? "",
  //   framework: (router.query.framework as AppFramework) ?? AppFramework.flutter,
  //   language: (router.query.language as AppLanguage) ?? AppLanguage.dart,
  //   url: router.query.url as string,
  //   name: router.query.name as string,
  //   w: Number.parseInt(router.query.w as string) ?? 375,
  //   h: Number.parseInt(router.query.h as string) ?? 812,
  //   globalizationRedirect:
  //     (router.query["globalization-redirect"] as string) ?? "#",
  // };
  // console.info("query for quicklook: ", query);

  // useEffect(() => {
  //   switch (query.framework) {
  //     case "flutter":
  //       if (query.url) {
  //         if (query.language == "js") {
  //           setSource(query.url);
  //         } else if (query.language == "dart") {
  //           // fetch dart file and set as source
  //           Axios.get(query.url).then((r) => {
  //             const dartSource = r.data;
  //             editingSource = dartSource;
  //             setSource(dartSource);
  //           });
  //         }
  //       }
  //       break;
  //     default:
  //       throw new Error(
  //         `the framework ${query.framework} is not supported yet.`
  //       );
  //   }
  // }, [query.url]);

  useEffect(() => {
    const fetchData = async () => {
      const sid = await router.query.sid;
      const _sid = "" + sid;
      const _data = await service.get(_sid);
      setData(_data);
      setSource(_data.raw[""]);
    };

    if (router.query.sid !== undefined) {
      fetchData();
    }
  }, [router.query]);

  // const run = () => {
  //   if (editingSource) {
  //     setSource(editingSource);
  //   } else {
  //     alert("your code has no changes");
  //   }
  // };

  // if (!data) {
  //   return <CircularProgress />;
  // }

  function _framework(code) {
    if (!!code.flutter) {
      return AppFramework.flutter;
    } else if (!!code.react) {
      return AppFramework.react;
    }
  }

  function _language(code) {
    if (!!code.flutter) {
      return AppLanguage.dart;
    } else if (!!code.react) {
      return AppLanguage.js;
    }
  }

  return (
    <>
      <EditorThemeProvider light>
        <TopBar
          controlDoubleClick={() => {}}
          // title={query.name || "No Name"}
          title={"No Name"}
          contorlModal={() => setIsShareModalOpen(!isShareModalOpen)}
        />
        <ShareModalContents
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          copyLink="123"
          isPublic={true}
          publicContorl={() => {}}
        />
        <Wrapper>
          <SideContainer>
            <Background>
              {!data ? (
                <CircularProgress />
              ) : (
                <>
                  {appFrame({
                    id: data.id,
                    framework: _framework(data.customdata_1p),
                    source: source!!,
                    preview: data.preview,
                    language: _language(data.customdata_1p),
                  })}
                </>
              )}
            </Background>
          </SideContainer>
          <SideContainer
            style={{ width: "45vw", background: "#1e1e1e", paddingTop: "70px" }}
          >
            <Editor
              language="dart"
              theme="vs-dark"
              value={source}
              options={{
                unusualLineTerminators: "off",
              }}
              onChange={(value: string) => {
                editingSource = value;
              }}
            />
          </SideContainer>
        </Wrapper>
      </EditorThemeProvider>
    </>
  );
}

function appFrame(props: {
  id: string;
  source: string;
  preview: string;
  framework: AppFramework;
  language: AppLanguage;
}) {
  // region check mode
  const mode = checkFrameSourceMode(props.framework, props.source);
  // endregion check mode

  const loading = <CircularProgress />;

  if (!props.source && !props.id) {
    return loading;
  }

  return (
    <>
      {/* <IFrame
        id={props.id}
        src={`https://frames-appbox.vercel.app/flutter?src=${props.preview}&mode=${mode}&language=${props.language}`}
      /> */}
      <IFrame id={props.id} src={props.preview} />
    </>
  );
}

// opens vs code; code editor for editing this source on developer's local environment.
const openVSCode = () => {
  // todo -- pass params for rerouting on the editor
  window.location.href = "vscode://file";
  // not using this line since its purpose on oppening app on same window.
  // open('vscode://file')
};

const Wrapper = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  height: 100vh;
  overflow-y: hidden;
`;

const SideContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
`;

const IFrame = styled.iframe`
  background: #ffffff;
  box-shadow: 0px 0px 4px rgba(222, 222, 222, 0.25),
    0px 0px 32px 4px rgba(220, 220, 220, 0.12);
  border-radius: 2px;
`;

const ButtonList = styled.div`
  display: flex;
  align-items: center;
`;

const Button = styled.button`
  color: white;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  span {
    font-weight: 500;
    font-size: 14px;
    line-height: 1.2;
    text-transform: capitalize;
  }

  &:active,
  &:focus {
    outline: 0;
  }
`;

const ButtonIconImage = styled.img`
  width: 16px;
  height: 16px;
  margin-right: 8px;
`;
