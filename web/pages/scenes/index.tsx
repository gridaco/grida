import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import styled from "@emotion/styled";

import DashboardLayout from "@app/scene-view/layouts/dashboard";
import { SceneItem } from "@app/scene-view/components/scene-item";
import SearchFormBox from "@app/scene-view/components/search/search-form-box";

/** dev only */ import { mocks } from "@app/scene-view";
import { ScenesTopBar, TopBar } from "../../../app/components";

interface IScreen {
  name: string;
  source: string;
  preview: string;
  updatedAt: string;
}

export default function ScreensPage() {
  const router = useRouter();
  const query = {
    src: router.query.src as string,
    screenRedirect: (router.query.screenRedirect as string) || "",
  };

  const [focusedScreenId, setFocusedScreenId] = useState<string>();
  const [screens, setScreens] = useState<IScreen[]>([]);

  useEffect(() => {
    const updateScreens = (screens: any) =>
      setScreens(
        screens.map(({ onclick, ...screen }) => ({
          ...screen,
          source: query.screenRedirect || onclick,
        }))
      );

    const fetchData = async () => {
      if (!query.src) {
        updateScreens(mocks.scenes);
        return;
      }
      const { data } = await axios.get(query.src);
      updateScreens(data);
    };

    fetchData();
  }, [query.src]);

  const handleSelection = (id: string) => {
    setFocusedScreenId(id);
  };

  const handleDoubleClick = (source: string) => {
    router.replace(source);
  };

  return (
    <Background>
      {/* <DashboardLayout title="Overview" isScenes={true}> */}
      {/* <SearchFormBox
          containerStyle={{
            margin: "0 auto",
            marginBottom: 24,
          }}
        /> */}
      <ScenesTopBar controlDoubleClick={() => {}} />
      <Grid>
        {screens.map(({ source, ...d }, i) => {
          const id = i.toString();
          return (
            <SceneItem
              key={id}
              id={id}
              onSelected={handleSelection}
              onDoubleClick={() => handleDoubleClick(source)}
              isSelected={focusedScreenId === id}
              data={d}
            />
          );
        })}
      </Grid>
      {/* </DashboardLayout> */}
    </Background>
  );
}

const Background = styled.div`
  // TEMPORARY STYLE!!!
  // TO BE UPDATED LATER ON @editor-ui/theme
  // reset DashboardLayout theme
  background: #fcfcfc;
  height: 100vh;
`;

const Grid = styled.div`
  width: fit-content;
  display: grid;
  grid-template-columns: repeat(4, minmax(224px, 240px));
  grid-gap: 1.5rem;
  /* 56 is topbar size */
  padding-top: 56px;
  margin: 0 auto;
  /* place-content: start space-evenly; */

  @media (max-width: 1280px) {
    grid-template-columns: repeat(3, minmax(224px, 1fr));
  }

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, minmax(224px, 1fr));
  }

  @media (max-width: 768px) {
    grid-template-columns: repeat(1, minmax(224px, 1fr));
  }
`;
