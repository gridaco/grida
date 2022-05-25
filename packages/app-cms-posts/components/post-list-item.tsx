import React from "react";
import styled from "@emotion/styled";
import css from "@emotion/css";
import dayjs from "dayjs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuArrow,
} from "@editor-ui/dropdown-menu";

interface ItemMenuProps {
  onDeleteClick?: () => void;
  onUnlistClick?: () => void;
  onPublishClick?: () => void;
  onViewOnPublicationClick: (props: { preview: boolean }) => void;
}

export function PostListItem({
  title,
  summary,
  author,
  publishedAt,
  createdAt,
  thumbnail,
  readingTime,
  onClick,
  isDraft,
  isListed,
  href,
  ...menuProps
}: {
  title: string;
  summary: string;
  author?: string;
  publishedAt?: Date | string;
  createdAt?: Date | string;
  isDraft?: boolean;
  thumbnail?: string;
  readingTime?: number;
  isListed?: boolean;
  onClick?: () => void;
  href?: string;
} & ItemMenuProps) {
  return (
    <Container onClick={onClick} href={href}>
      <TextContents>
        <Title>{title?.length ? title : "Untitled post"}</Title>
        {summary && <Summary>{summary}</Summary>}
        <MetaContainer>
          {isListed === false && !isDraft && <UnlistedIndicator />}
          {author && <Author>@{author}</Author>}
          <PublishedAt>
            {isDraft ? (
              <>Created on {dayjs(createdAt).format("MMM DD, YYYY")}</>
            ) : (
              <>Published on {dayjs(publishedAt).format("MM/DD/YYYY")}</>
            )}
          </PublishedAt>
          {readingTime && (
            <ReadingTime>{readingtimeToMinutes(readingTime)}</ReadingTime>
          )}
          <ItemDropdownMenu
            {...menuProps}
            onEditClick={onClick}
            view={isDraft ? "preview" : "view"}
          />
        </MetaContainer>
      </TextContents>
      {thumbnail && <Thumbnail src={thumbnail} />}
    </Container>
  );
}

function UnlistedIndicator() {
  return (
    <UnlistedContainer>
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M13.8261 4.20298C13.6037 3.98052 13.243 3.98052 13.0205 4.20298L4.15886 13.0647C3.9364 13.2871 3.9364 13.6478 4.15886 13.8703C4.38133 14.0927 4.74201 14.0927 4.96447 13.8703L5.95321 12.8815L6.7122 12.1226L7.64895 11.1858L11.1789 7.65587L12.3726 6.46217L13.0921 5.7427L13.8261 5.00859C14.0486 4.78612 14.0486 4.42544 13.8261 4.20298ZM8.99924 4.44965C9.59809 4.44965 10.1797 4.52358 10.7354 4.6628C10.8821 4.69955 10.9282 4.88118 10.8212 4.9881L10.311 5.4983C10.2635 5.54582 10.1953 5.56606 10.1293 5.55373C9.76299 5.48538 9.38526 5.44965 8.99924 5.44965C6.63264 5.44965 4.57801 6.79258 3.55891 8.76261C3.47971 8.9157 3.47971 9.09801 3.55891 9.25111C3.85838 9.83002 4.24727 10.3548 4.70722 10.8072C4.78832 10.887 4.79132 11.018 4.71088 11.0985L4.28724 11.5221C4.21112 11.5982 4.0882 11.6006 4.01139 11.5252C3.47401 10.9977 3.01994 10.3857 2.67071 9.71057C2.44244 9.26931 2.44244 8.74441 2.67071 8.30314C3.85481 6.01415 6.24432 4.44965 8.99924 4.44965ZM8.99924 12.5641C8.62644 12.5641 8.26138 12.5307 7.90689 12.4669C7.8412 12.4551 7.7736 12.4754 7.7264 12.5226L7.21417 13.0348C7.10692 13.1421 7.15368 13.3242 7.30101 13.3603C7.84523 13.4935 8.41399 13.5641 8.99924 13.5641C11.7542 13.5641 14.1437 11.9996 15.3278 9.71058C15.556 9.26931 15.556 8.74441 15.3278 8.30314C14.9837 7.63807 14.5379 7.03415 14.0109 6.51201C13.9342 6.436 13.8108 6.43815 13.7345 6.51452L13.3108 6.93819C13.2306 7.01833 13.2333 7.14878 13.3137 7.22867C13.7639 7.67606 14.145 8.19313 14.4396 8.76261C14.5188 8.9157 14.5188 9.09802 14.4396 9.25111C13.4205 11.2211 11.3658 12.5641 8.99924 12.5641Z"
          fill="#7D7C78"
        />
      </svg>
      <MetaLabel>Unlisted</MetaLabel>
    </UnlistedContainer>
  );
}

function ItemDropdownMenu({
  onDeleteClick,
  onPublishClick,
  onUnlistClick,
  onEditClick,
  onViewOnPublicationClick: onPreviewClick,
  view,
}: ItemMenuProps & {
  onEditClick: () => void;
  view: "preview" | "view";
}) {
  return (
    <DropdownMenu>
      <MoreMenu onClick={(e) => e.stopPropagation()}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8.68374 11.8844C8.88017 12.0542 9.17735 12.0458 9.36385 11.8593L13.6065 7.61666C13.8018 7.4214 13.8018 7.10482 13.6065 6.90955C13.4112 6.71429 13.0946 6.71429 12.8994 6.90955L9.00973 10.7992L5.11381 6.90328C4.91855 6.70802 4.60196 6.70802 4.4067 6.90328C4.21144 7.09854 4.21144 7.41513 4.4067 7.61039L8.64934 11.853C8.66043 11.8641 8.67191 11.8746 8.68374 11.8844Z"
            fill="#535455"
          />
        </svg>
      </MoreMenu>
      <DropdownMenuContent>
        {onDeleteClick && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
          >
            Delete
          </DropdownMenuItem>
        )}
        {onUnlistClick && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onUnlistClick();
            }}
          >
            Unlist
          </DropdownMenuItem>
        )}
        {onPublishClick && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onPublishClick();
            }}
          >
            Publish
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEditClick}>Edit</DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onPreviewClick({
              preview: view === "preview",
            });
          }}
        >
          {view === "view" ? "View on publication" : "Preview on publication"}
        </DropdownMenuItem>
        <DropdownMenuArrow />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function readingtimeToMinutes(readingTime: number) {
  // 0 min -> 1 min
  const min = Math.max(1, Math.floor(readingTime / 1000 / 60));
  if (min === 1) {
    return "1 minute read";
  } else {
    return `${min} minutes read`;
  }
}

const Container = styled.a`
  text-decoration: none;
  cursor: pointer;
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  gap: 16px;
  min-height: 80px;
  box-sizing: border-box;
  color: rgb(55, 53, 48);
  border-bottom: 1px solid transparent;

  :hover {
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    color: black;
  }

  transition: border-bottom 0.3s ease-in-out, color 0.3s ease-in-out;
`;

const TextContents = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  gap: 8px;
  box-sizing: border-box;
`;

const Title = styled.span`
  text-overflow: ellipsis;
  font-size: 24px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 700;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;

const Summary = styled.span`
  opacity: 0.9;
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;

const MetaContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 20px;
  box-sizing: border-box;
`;

const UnlistedContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  box-sizing: border-box;
`;

const MetaLabelStyle = css`
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  text-align: left;
`;

const MetaLabel = styled.span`
  ${MetaLabelStyle}
`;

const Author = styled.span`
  ${MetaLabelStyle}
`;

const PublishedAt = styled.span`
  ${MetaLabelStyle}
`;

const ReadingTime = styled.span`
  ${MetaLabelStyle}
`;

const Thumbnail = styled.img`
  width: 130px;
  height: 130px;
  object-fit: cover;
  margin-bottom: 4px;
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.05);
`;

const MoreMenu = styled(DropdownMenuTrigger)`
  padding: 0px;
  outline: none;
  border: none;
  width: 21px;
  height: 21px;
  border-radius: 100px;
  background-color: transparent;

  :hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
`;
