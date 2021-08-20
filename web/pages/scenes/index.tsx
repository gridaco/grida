import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import styled from "@emotion/styled";
import axios from "axios";

import DashboardLayout from "../../layouts/dashboard";
import { SceneItem } from "../../components/scene-item";
import SearchFormBox from "../../components/search/search-form-box";

import mockups from "../../mockups/screens";

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
      const { data } = await axios.get(query.src);
      updateScreens(data);
    };

    fetchData();
  }, [query.src]);

  const handleSelection = (id: string) => {
    setFocusedScreenId(id);
  };

  // const handleDoubleClick = (id: string) => {
  //   router.push(`/globalization/?scene=${id}`);
  // };

  const handleDoubleClick = (source: string) => {
    window.location.href = source;
  };

  return (
    <DashboardLayout title="Overview">
      <SearchFormBox
        containerStyle={{
          margin: "0 auto",
          marginBottom: 24,
        }}
      />
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
    </DashboardLayout>
  );
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));
  grid-gap: 1.5rem;
`;
