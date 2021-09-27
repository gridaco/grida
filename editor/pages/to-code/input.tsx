import React, { useState } from "react";
import styled from "@emotion/styled";
import { analyzeDesignUrl, DesignProvider } from "@design-sdk/url-analysis";
import { parseFileAndNodeId } from "@design-sdk/figma-url";
import * as api from "@design-sdk/figma-remote-api";
import { personal } from "@design-sdk/figma-auth-store";
import { useRouter } from "next/router";

function ToCodeInput() {
  const router = useRouter();
  const [inputUrl, setInputUrl] = useState<string>();
  const [processing, setProcessing] = useState<boolean>(false);
  const [designs, setDesigns] = useState<ReadonlyArray<api.Node>>([]);
  const _r = analyze(inputUrl);

  const onsubmit = async () => {
    setProcessing(true);
    switch (_r) {
      case "id":
        break;
      case "figma":
        // load design from local storage or remote figma
        const q = parseFileAndNodeId(inputUrl);
        // case 1. both file and node id
        // case 1-1. node id is page - load frames under the page
        // case 1-2. node id is frame - load the frame
        // case 2. only file id - load pages & frame under the file

        // fetch depth 1 to determine the node type
        // fetch the pages & depth 1 nodes (total in depth 2)
        const cl = api.Client({
          personalAccessToken: personal.get_safe(),
        });
        if (q.node) {
          const input_node_reference = await cl.fileNodes(q.file, {
            ids: [q.node],
            depth: 2,
          });
          // canvas is a page in figma remote api.
          const is_page =
            input_node_reference.data.nodes[q.node].document.type === "CANVAS";

          if (is_page) {
            const frames = (input_node_reference.data.nodes[q.node]
              .document as api.Canvas).children;
            setDesigns(frames);
          } else {
            // if not a page, push directly to the frame
            const new_query = {
              ...router.query,
              design: q.url,
            };

            router.push({ pathname: "/to-code", query: new_query });
          }
        } else {
          cl.file(q.file, { depth: 1 });
        }
        break;
      default:
        break;
    }
    setProcessing(false);
  };

  return (
    <RootWrapperToCodeInput>
      <InputHtmlTagInput
        disabled={processing}
        placeholder="https://figma.com/files/1234/5678:910"
        onChange={(e) => {
          setInputUrl(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onsubmit();
          }
        }}
      />
      <CardList>
        {designs.map((d) => {
          const onclick = () => {
            const q = parseFileAndNodeId(inputUrl);
            //www.figma.com/file/HSozKEVWhh8saZa2vr1Nxd/design-to-code?node-id=563%3A6151
            const target_design_url = `https://www.figma.com/file/${q.file}?node-id=${d.id}`;
            const new_query = {
              ...router.query,
              // : FIXME: somehow the design url is not acceptable by use-design.
              design: target_design_url,
            };
            router.push({ pathname: "/to-code", query: new_query });
          };
          return <Card name={d.name} type={d.type} onclick={onclick} />;
        })}
      </CardList>
    </RootWrapperToCodeInput>
  );
}

const CardList = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 18px;
  box-sizing: border-box;
`;

const Card = ({
  name,
  type,
  onclick,
}: {
  name: string;
  type: string;
  onclick: () => void;
}) => {
  return (
    <div style={{ margin: 8, fontSize: 12 }} onClick={onclick}>
      {name}
      <br />
      {type}
    </div>
  );
};

const analyze = (url: string): "id" | DesignProvider => {
  const _r = analyzeDesignUrl(url);
  if (_r == "unknown") {
    return "id";
  } else {
    return _r;
  }
};

const RootWrapperToCodeInput = styled.div`
  min-height: 100vh;
  background-color: rgba(255, 255, 255, 1);
  position: relative;
`;

const InputHtmlTagInput = styled.input`
  width: 551px;
  height: 55px;
  overflow: hidden;
  background-color: rgba(255, 255, 255, 1);
  border-radius: 4px;
  position: absolute;
  box-shadow: 0px 4px 32px rgba(186, 186, 186, 0.25);
  left: calc((calc((50% + 1px)) - 276px));
  top: calc((calc((50% + 1px)) - 28px));

  outline: none;
  border: none;
  box-sizing: border-box;
  padding: 24px;

  /* text */
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: "Helvetica Neue";
  font-weight: 400;
  line-height: 100%;
  text-align: left;
`;

export default ToCodeInput;
