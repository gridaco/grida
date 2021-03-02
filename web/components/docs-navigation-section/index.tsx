import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Flex, Heading } from "rebass";
import Link from "next/link";
import { DocsRoute } from "utils/docs/model";

function DocsNavigationSection(props: { route: DocsRoute; level?: number }) {
  const routeConfig = props.route;
  const level = props.level ?? 0;

  return (
    <div style={{ marginLeft: level * 20 }}>
      <SectionWrapper flexDirection="column">
        <h4>{routeConfig.title}</h4>
        {routeConfig.routes &&
          routeConfig.routes.map((i, ix) =>
            i.routes ? (
              <DocsNavigationSection route={i} level={level + 1} />
            ) : (
              <Link href={i.path}>
                <Heading fontSize="16px" fontWeight={400}>
                  {i.title}
                </Heading>
              </Link>
            ),
          )}
      </SectionWrapper>
    </div>
  );
}

export default DocsNavigationSection;

const SectionWrapper = styled(Flex)`
  margin-top: 50px;

  a {
    margin-top: 12px;
    color: #686868;
  }
`;
