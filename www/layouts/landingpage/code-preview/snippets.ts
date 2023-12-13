export const FLUTTER_COMPONENT_FULL_SOURCE = `
Container(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          child: Row(
            children: [
              Text(
                "LO\\nFI",
                style: Theme.of(context).textTheme.headline6
                  .copyWith(color:Colors.white),
              ),
              SizedBox(
                width: 92,
              ),
              Container(
                child: Container(
                  child: Opacity(
                    opacity: 0.5,
                    child: Container(
                      width: 18,
                      height: 24,
                      decoration: BoxDecoration(
                        color: Colors.white,
                      ),
                    ),
                  ),
                  width: 40,
                  height: 40,
                  padding: EdgeInsets.only(
                    left: 13,
                    right: 8,
                  ),
                ),
                width: 40,
                height: 40,
              ),
            ],
            mainAxisAlignment: MainAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
          ),
          width: 252,
          height: 232,
          padding: EdgeInsets.only(
            left: 18,
            right: 18,
            top: 108,
            bottom: 20,
          ),
          decoration: BoxDecoration(
            color: Colors.black,
          ),
        ),
        SizedBox(
          height: 12,
        ),
        SizedBox(
          child: Text(
            "Morning Slowbeats - LoFi",
            style: Theme.of(context).textTheme.subtitle1
              .copyWith(color:0xffa3a3a3),
          ),
          width: 252,
        ),
      ],
    ),
  );
`;

export const REACT_TSX_STYLED_COMPONENTS_SOURCE = `function CardMusicItem({
  artwork,
  musicName,
}: {
  artwork: string | JSX.Element;
  musicName: string;
}) => {
  return (
    <CardWrapper>
      <ArtworkContainer>
        {artwork}
        <MusicPlayButton icon={"play"} />
      </ArtworkContainer>
      <MusicName>{musicName}</MusicName>
    </CardWrapper>
  );
};

const CardWrapper = styled.div\`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: none;
  gap: 4px;
  width: 138px;
  height: 180px;
  box-sizing: border-box;
\`;

const ArtworkContainer = styled.div\`
  height: 144px;
  position: relative;
  align-self: stretch;
\`;


const MusicName = styled.span\`
  color: rgba(164, 164, 164, 1);
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  align-self: stretch;
\`;

`;

export const HTML_COMPONENT_FULL_SOURCE = `
<head>
  <stylesheet>
    .wrapper {
      width: 60px;
    }
  </stylesheet>

</head>
<div class="wrapper">
    <h6>Morning Slowbeats - LoFi</h6>
</div>
`;
