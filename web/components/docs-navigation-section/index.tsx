import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Flex, Heading } from "rebass";
import Link from "next/link";
import { DocsRoute } from "utils/docs/model";

function DocsNavigationSection(props: { route: DocsRoute; level?: number }) {
  const routeConfig = props.route;
  const level = props.level ?? 0;

  return (
    <SidebarController level={level}>
      <SectionWrapper level={level} flexDirection="column">
        {routeConfig.path ? (
          <Link href={routeConfig.path ?? ""}>
            <Heading fontSize="18px">{routeConfig.title}</Heading>
          </Link>
        ) : (
          <h4>{routeConfig.title}</h4>
        )}

        {routeConfig.routes &&
          routeConfig.routes.map((i, ix) =>
            i.routes ? (
              <DocsNavigationSection route={i} level={level + 1} key={ix} />
            ) : (
              <Link href={i.path} key={ix}>
                <Heading
                  fontSize="16px"
                  my="6px"
                  fontWeight={400}
                  color={"#686868"}
                >
                  {i.title}
                </Heading>
              </Link>
            ),
          )}
      </SectionWrapper>
    </SidebarController>
  );
}

export default DocsNavigationSection;

const SidebarController = styled.div<{ level: number }>`
  margin-bottom: 50px;
  ${p =>
    p.level >= 1 && {
      margin: 0,
    }};
`;

const SectionWrapper = styled(Flex)<{ level: number }>`
  margin-top: 30px;

  h4 {
    margin: 0px;
    margin-bottom: 12px;
  }

  a {
    margin-top: 12px;
    color: #686868;
  }

  ${p =>
    p.level >= 1 && {
      borderLeft: "2px solid #EDEDED",
      paddingLeft: 16,
    }}
`;
