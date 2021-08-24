import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import styled from "@emotion/styled";

import DashboardLayout from "@app/scene-view/layouts/dashboard";
import { SceneItem } from "@app/scene-view/components/scene-item";
import SearchFormBox from "@app/scene-view/components/search/search-form-box";
import { SceneStoreService } from "@base-sdk/scene-store";

/** dev only */ import { mocks } from "@app/scene-view";
import { TopBar } from "../../../app/components";
import { SceneRecord } from "@base-sdk/scene-store";
import { makeService } from "services/scenes-store";

// interface IScreen {
//   name: string;
//   source: string;
//   preview: string;
//   updatedAt: string;
// }

export default function ScreensPage() {
  const router = useRouter();
  const query = {
    src: router.query.src as string,
    screenRedirect: (router.query.screenRedirect as string) || "",
  };

  const [focusedScreenId, setFocusedScreenId] = useState<string>();
  const [screens, setScreens] = useState<SceneRecord[]>([]);
  const service = makeService();

  useEffect(() => {
    const updateScreens = (screens: any) =>
      setScreens(
        screens.map(({ onclick, ...screen }) => ({
          ...screen,
          source: query.screenRedirect || onclick,
        }))
      );

    const fetchData = async () => {
      const data = await service.list();
      updateScreens(data);
      if (!data) {
        updateScreens(mocks.scenes);
      }
    };

    fetchData();
  }, [query.src]);

  const handleSelection = (id: string) => {
    setFocusedScreenId(id);
  };

  const handleDoubleClick = (id: string) => {
    router.push(`/scenes/${id}`);
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
      <TopBar controlDoubleClick={() => {}} isSimple={true} />
      <Grid>
        {screens.map(({ id, rawname, newname, ...d }, i) => {
          return (
            <SceneItem
              key={id}
              id={id}
              onSelected={handleSelection}
              onDoubleClick={() => handleDoubleClick(id)}
              isSelected={focusedScreenId === id}
              data={{
                ...d,
                name: newname ?? rawname,
                updatedAt: "now", // TODO:
              }}
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
