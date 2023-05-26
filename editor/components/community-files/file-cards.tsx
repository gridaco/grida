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
  }: Partial<{
    id: string;
    name: string;
    thumbnail_url: string;
    like_count: number;
    duplicate_count: number;
  }>,
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <ItemWrapper ref={ref} data-id={id}>
      <span className="thumb">
        <img src={thumbnail_url} />
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
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  border-radius: 4px;
  overflow: hidden;

  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 0 16px 4px rgba(0, 0, 0, 0);

  width: 380px;

  transition: all 0.2s ease-in-out;

  &:hover {
    box-shadow: 0 0 16px 4px rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(0, 0, 0, 0.2);

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
