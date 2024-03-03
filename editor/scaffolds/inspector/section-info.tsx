import styled from "@emotion/styled";
import { SceneNodeIcon } from "@code-editor/node-icons";
import { useTargetContainer } from "hooks/use-target-node";

import React from "react";
import { useInspectorElement } from "hooks/use-inspector-element";
export function InfoSection() {
  const { target } = useTargetContainer();

  if (!target) {
    return <></>;
  }

  const { type, name } = target;
  return (
    <section className="flex flex-col p-3">
      <SceneTitle>
        <SceneNodeIcon color="white" type={type} />
        <input disabled value={name} />
      </SceneTitle>
      {/* <SceneDescription>{"No description"}</SceneDescription> */}
    </section>
  );
}

export function CrafInfoSection() {
  const element = useInspectorElement();

  const { id, type, name, tag } = element ?? {};
  return (
    <section className="flex flex-col p-3">
      <SceneTitle>
        {/* <SceneNodeIcon color="white" type={type} /> */}
        <input disabled value={name} />
        <pre className="text-xs">
          {type} {type === "html" ? tag : ""}
          <br />
          {id}
        </pre>
      </SceneTitle>
      {/* <SceneDescription>{"No description"}</SceneDescription> */}
    </section>
  );
}

const SceneTitle = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: default;
  font-weight: normal;

  input {
    margin: 0;
    width: 100%;
    background: transparent;
    font-size: 16px;
    font-weight: 600;
    outline: none;
    border: none;
    color: rgba(255, 255, 255, 0.8);
  }
`;
