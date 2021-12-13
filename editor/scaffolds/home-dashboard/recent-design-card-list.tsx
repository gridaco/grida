import styled from "@emotion/styled";
import router from "next/router";
import React, { useEffect, useState } from "react";
import { WorkspaceRepository } from "repository";
import {
  BuiltinDemoFileCard,
  ImportNewDesignCard,
  RecentDesignCard,
} from "components/home/cards";

export function RecentDesignCardList({ recents }: { recents: any[] }) {
  const oncardclick = (id: string, d) => {
    console.log("click", id);
    router.push(`/to-code/${id}`); // fixme id is not a param
  };

  const also_show_demo = recents.length <= 2;

  return (
    <ListWrap>
      <ImportNewDesignCard />
      {also_show_demo && <BuiltinDemoFileCard />}
      {recents.map((recentDesign) => {
        return (
          <RecentDesignCard
            key={recentDesign.id}
            data={recentDesign}
            onclick={oncardclick}
          />
        );
      })}
    </ListWrap>
  );
}

const ListWrap = styled.div`
  display: flex;
  flex-direction: row;
  gap: 20px;
`;
