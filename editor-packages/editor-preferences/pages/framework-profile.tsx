import React, { useEffect } from "react";
import styled from "@emotion/styled";
import { config } from "@grida/builder-config";
import { BaseFrameworkSelectItem } from "../components";
import { PageContentLayout } from "../layouts";

type BaseFramework = config.FrameworkConfig["framework"];

export default function EditorPreferenceFrameworkProfilePage() {
  const [baseframework, setBaseframework] =
    React.useState<BaseFramework>("react");

  useEffect(() => {
    //
  }, [baseframework]);

  return (
    <PageContentLayout>
      <h1>Framework Profile</h1>
      <BaseFrameworkSelect
        selection={baseframework}
        onSelect={(bf) => {
          setBaseframework(bf);
        }}
      />
    </PageContentLayout>
  );
}

const baseframeworks: BaseFramework[] = [
  "react",
  "react-native",
  "flutter",
  "solid-js",
  "vanilla",
];

function BaseFrameworkSelect({
  selection,
  onSelect,
}: {
  selection: BaseFramework;
  onSelect: (framework: BaseFramework) => void;
}) {
  return (
    <BaseFrameworksWrap>
      {baseframeworks.map((bf, ix) => {
        return (
          <BaseFrameworkSelectItem
            key={ix}
            framework={bf}
            onClick={() => onSelect(bf)}
            selected={selection === bf}
          />
        );
      })}
    </BaseFrameworksWrap>
  );
}

const BaseFrameworksWrap = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  align-content: center;
  gap: 21px;
`;
