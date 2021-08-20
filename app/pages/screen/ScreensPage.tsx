import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import styled from "@emotion/styled";
import { TopBar } from "../../components";
import { SceneItem } from "../../components/scene-item/scene-item";
import { mockups } from "./__test__";

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
        updateScreens(mockups);
        return;
      }
      // const { data } = await axios.get(query.src);
      const data = "";
      updateScreens(data);
    };

    fetchData();
  }, [query.src]);

  const handleSelection = (id: string) => {
    setFocusedScreenId(id);
  };

  const handleDoubleClick = (source: string) => {
    window.location.href = source;
  };
  return (
    <>
      <TopBar controlDoubleClick={() => {}} />
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
    </>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));
  grid-gap: 1.5rem;
`;
