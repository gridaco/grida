import React from "react";
import styled from "@emotion/styled";
import { HeartIcon, DownloadIcon } from "@radix-ui/react-icons";

export const FileCard = React.forwardRef(function (
  {
    id,
    name,
    thumbnail_url,
    like_count,
    duplicate_count,
    theme = "dark",
  }: Partial<{
    id: string;
    name: string;
    thumbnail_url: string;
    like_count: number;
    duplicate_count: number;
  }> & {
    theme?: "light" | "dark";
  },
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <ItemWrapper ref={ref} data-id={id} data-theme={theme}>
      <span className="thumb">
        <img
          src={thumbnail_url}
          alt={name}
          style={{
            maxHeight: 200,
            height: "100%",
            width: "100%",
          }}
        />
      </span>
      <div className="content">
        <div>
          <span className="name">{name}</span>
        </div>
        <div className="stats">
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
    </ItemWrapper>
  );
});

const ItemWrapper = styled.div`
  --forground-rgb-light: 0, 0, 0;
  --background-rgb-light: 255, 255, 255;
  --forground-rgb-dark: 255, 255, 255;
  --background-rgb-dark: 0, 0, 0;

  color: var(--forground-rgb-light);

  &[data-theme="dark"] {
    color: var(--forground-rgb-dark);
    border: 1px solid rgba(var(--forground-rgb-dark), 0.1);
    box-shadow: 0 0 16px 4px rgba(var(--forground-rgb-dark), 0);

    &:hover {
      box-shadow: 0 0 16px 4px rgba(var(--forground-rgb-dark), 0.04);
      border: 1px solid rgba(var(--forground-rgb-dark), 0.2);
    }
  }

  &[data-theme="light"] {
    color: var(--forground-rgb-light);
    border: 1px solid rgba(var(--forground-rgb-light), 0.1);
    box-shadow: 0 0 16px 4px rgba(var(--forground-rgb-light), 0);

    &:hover {
      box-shadow: 0 0 16px 4px rgba(var(--forground-rgb-light), 0.04);
      border: 1px solid rgba(var(--forground-rgb-light), 0.2);
    }
  }

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  border-radius: 4px;
  overflow: hidden;

  width: 380px;

  transition: all 0.2s ease-in-out;

  &:hover {
    img {
      transform: scale(1.03);
    }
  }

  cursor: pointer;

  .thumb {
    width: 100%;
    height: 200px;
    overflow: hidden;
  }

  img {
    height: 100%;
    width: 100%;
    object-fit: cover;
    transition: all 0.2s ease-in-out;
  }

  .content {
    padding: 4px 8px;
    display: flex;
    gap: 8px;
    flex-direction: column;
    padding-bottom: 16px;
  }

  .name {
    font-size: 16px;
    font-weight: 500;
  }

  .stats {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    opacity: 0.8;

    span {
      display: flex;
      align-items: center;
      gap: 2px;
    }
  }
`;
