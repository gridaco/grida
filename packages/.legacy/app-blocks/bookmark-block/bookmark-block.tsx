import React from "react";
import styled from "@emotion/styled";

export function BookmarkBlock({ url }: { url: string }) {
  // 1. fetch url data
  // TODO:
  return <BaseBookmarkBlock loading url={url} favicon={url + "/favicon.ico"} />;
}

export function BaseBookmarkBlock({
  title,
  description,
  url,
  favicon,
  preview,
  loading,
}: {
  title?: string;
  description?: string;
  url: string;
  favicon: string;
  preview?: string;
  loading: boolean;
}) {
  return (
    <Container>
      <NonPreviewSegment>
        {loading ? (
          <LoadingContainer>
            {/* TODO: add progress */}
            <ReflectUiCurcularProgress
              src="grida://assets-reservation/images/999:87597"
              alt="icon"
            />
            <LoadingText>Loading preview...</LoadingText>
          </LoadingContainer>
        ) : (
          <>
            <Title>{title}</Title>
            <Description>{description}</Description>
          </>
        )}
        <UrlInfo>
          <Favicon src={favicon} />
          <UrlRaw>{url}</UrlRaw>
        </UrlInfo>
      </NonPreviewSegment>
      {preview ? <PreviewSegment src={preview} /> : <></>}
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  border: solid 1px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  box-sizing: border-box;
`;

const NonPreviewSegment = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  gap: 16px;
  width: 661px;
  box-sizing: border-box;
  padding: 16px;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 11px;
  box-sizing: border-box;
`;

const ReflectUiCurcularProgress = styled.img`
  width: 18px;
  height: 18px;
  object-fit: cover;
`;

const Title = styled.span`
  color: rgb(26, 26, 26);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  min-height: 21px;
  align-self: stretch;
  flex-shrink: 0;
`;

const Description = styled.span`
  color: rgba(26, 26, 26, 0.6);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
  flex-shrink: 0;
`;

const UrlInfo = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 11px;
  box-sizing: border-box;
`;

const Favicon = styled.img`
  width: 21px;
  height: 21px;
  object-fit: cover;
`;

const UrlRaw = styled.span`
  color: rgb(26, 26, 26);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const LoadingText = styled.span`
  color: rgba(26, 26, 26, 0.4);
  text-overflow: ellipsis;
  font-size: 18px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;
`;

const PreviewSegment = styled.img`
  width: 219px;
  height: 181px;
  object-fit: cover;
`;
