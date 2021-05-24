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

export const REACT_JSCSS_COMPONENT_FULL_SOURCE = `
// <Component description={"Morning Slowbeats - LoFi"}/>
export function Component(props: {
    description: string
}){
    return <>
        <Wrapper>
            <Typography>{props.description}</Typography>
        </Wrapper>
    </>;
}

const Wrapper = styled.div\`
    width: 60;
\`

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
