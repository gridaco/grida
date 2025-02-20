import React, { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import * as Avatar from "@radix-ui/react-avatar";
import {
  FigmaCommunityFileRelatedContentMeta,
  FigmaCommunityFileMeta,
} from "ssg/community";
import Link from "next/link";
import { FileCard } from "./file-cards";
import { Tag } from "./tags";
import { ArrowLeftIcon, HeartIcon, DownloadIcon } from "@radix-ui/react-icons";
// 1. last synced
// 2. report issue
// 3. start

interface CommunityFileReadmeProps {
  name: string;
  description: string;
  thumbnail_url: string;
  tags: string[];
  duplicate_count: number;
  like_count: number;
  creator: {
    id: string;
    handle: string;
    img_url: string;
  };
  publisher: FigmaCommunityFileMeta["publisher"];
  support_contact: string;
  related_contents: ReadonlyArray<FigmaCommunityFileRelatedContentMeta>;
}

export function Readme({
  name,
  description,
  thumbnail_url,
  creator,
  publisher,
  like_count,
  duplicate_count,
  tags,
  support_contact,
  related_contents,
  // CBs
  onProceed,
}: Partial<CommunityFileReadmeProps> & {
  onProceed?: () => void;
}) {
  return (
    <ReadmeWrapper>
      <header className="inner">
        <Link href="/community/files">
          <button className="back">
            <ArrowLeftIcon width={24} height={24} />
            Community Files
          </button>
        </Link>
        <div
          style={{
            display: "flex",
            gap: 24,
          }}
        >
          <div style={{ flex: 1 }}>
            <h1>{name}</h1>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              {/* publisher is always present, but sometimes empty with nextjs static props while dev mode */}
              {publisher && (
                <Link
                  href={`https://www.figma.com/@${publisher.profile_handle}`}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <Avatar.Root>
                      <Avatar.Image src={publisher.img_url} />
                    </Avatar.Root>
                    <span>{publisher.name}</span>
                  </div>
                </Link>
              )}
              <span>
                <HeartIcon />
                {like_count}
              </span>
              <span>
                <DownloadIcon />
                {duplicate_count}
              </span>
            </div>
          </div>
          <div className="cta">
            <button onClick={onProceed}>Explore in Code</button>
          </div>
        </div>
      </header>
      <div className="cover">
        <img
          src={thumbnail_url}
          alt={`${name} by ${creator?.handle ?? "unknown"} on Grida Code`}
        />
      </div>
      <div style={{ height: 40 }} />
      <div className="inner content">
        <div className="main">
          {description ? (
            <p dangerouslySetInnerHTML={{ __html: description }} />
          ) : (
            <div>
              <p style={{ opacity: 0.5 }}>No description provided</p>
            </div>
          )}
        </div>
        <div className="banner">
          <div>
            <h3>Tags</h3>
            <div className="tags">
              {tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
            </div>
          </div>
          <div style={{ height: 40 }} />
          {support_contact && (
            <span>
              <strong>Support: </strong>
              {support_contact}
            </span>
          )}
          <br />
          <span>
            Licensed under{" "}
            <a
              target="_blank"
              href="https://creativecommons.org/licenses/by/4.0/"
            >
              CC BY 4.0
            </a>
          </span>
        </div>
      </div>
      <hr />
      <footer>
        {related_contents?.length > 0 && (
          <>
            <h2 className="inner">Related Contents</h2>
            <div className="inner cards no-scroll-bar">
              {related_contents?.map((content) => (
                <Link
                  key={content.id}
                  scroll
                  href={{
                    pathname: "/community/file/[id]",
                    query: { id: content.id },
                  }}
                >
                  <div>
                    <FileCard {...content} theme="light" />
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </footer>
    </ReadmeWrapper>
  );
}

const ReadmeWrapper = styled.main`
  color: black;
  margin: auto;

  width: 100%;

  overflow: hidden;
  overflow-y: scroll;

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    color: black;
  }

  p {
    color: black;
  }

  a {
    color: black;
    opacity: 0.8;

    &:hover {
      opacity: 1;
    }
  }

  .cta {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;

    button {
      cursor: pointer;
      display: flex;
      background: black;
      color: white;
      border: 1px solid rgba(0, 0, 0, 0.8);
      border-radius: 4px;
      padding: 12px;
      font-size: 16px;
      font-weight: 500;

      &:hover {
        background: rgba(0, 0, 0, 0.9);
        scale: 1.01;
      }
    }
  }

  .back {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    margin-bottom: 16px;
    background: transparent;
    border: none;
    font-size: 16px;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.8);
    cursor: pointer;
    &:hover {
      color: rgba(0, 0, 0, 0.6);
    }
  }

  .cover {
    display: flex;
    justify-content: center;
    align-items: center;
    img {
      border-radius: 8px;
      max-height: 600px;
      width: auto;
      object-fit: cover;
    }
  }

  .content {
    display: flex;
    flex-direction: row;
    gap: 64px;

    .main {
      flex: 3;
    }

    .banner {
      min-width: 240px;
      flex: 1;
    }
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .cards {
    display: flex;
    flex-direction: row;
    gap: 16px;
    overflow-x: scroll;
    padding-bottom: 24px !important;
  }

  .inner {
    padding: 0 8rem;
  }

  img {
    width: 100%;
  }

  header {
    margin: 2rem 0;
  }

  footer {
    padding: 2rem 0;
  }
`;
