import React from "react";
import type { FigmaCommunityFileMeta } from "ssg/community";
import { FileCard } from "components/community-files/file-cards";
import Link from "next/link";
import styled from "@emotion/styled";

export function CommunityResultsLayout({
  heading,
  files,
}: {
  heading?: React.ReactNode;
  files: ReadonlyArray<Partial<FigmaCommunityFileMeta>>;
  loadMore?: () => void;
  hasMore?: boolean;
  loader?: React.ReactNode;
}) {
  return (
    <>
      <Main>
        {heading}
        <div className="grid">
          {files.map((file) => (
            <Link
              key={file.id}
              href={{
                pathname: "/community/file/[id]",
                query: {
                  id: file.id,
                },
              }}
            >
              <div>
                <FileCard {...file} />
              </div>
            </Link>
          ))}
        </div>
      </Main>
    </>
  );
}

const Main = styled.main`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px;

  h1 {
    color: white;
  }

  color: white !important;

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: center;
    justify-content: center;
  }
`;
