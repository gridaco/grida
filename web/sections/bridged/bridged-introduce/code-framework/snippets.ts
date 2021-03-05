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
                "LO\nFI",
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 60.480003356933594,
                  fontWeight: FontWeight.w700,
                  fontFamily: "Helvetica",
                ),
              ),
              SizedBox(
                width: 92.18,
              ),
              `;

//               Container(
//                 child: Container(
//                   child: Opacity(
//                     opacity: 0.5,
//                     child: Container(
//                       width: 18.48,
//                       height: 23.52,
//                       decoration: BoxDecoration(
//                         color: Colors.white,
//                       ),
//                     ),
//                   ),
//                   width: 40.32,
//                   height: 40.32,
//                   padding: EdgeInsets.only(
//                     left: 13,
//                     right: 8,
//                   ),
//                 ),
//                 width: 40.32,
//                 height: 40.32,
//               ),
//             ],
//             mainAxisAlignment: MainAxisAlignment.start,
//             mainAxisSize: MainAxisSize.min,
//           ),
//           width: 252,
//           height: 233.52,
//           padding: EdgeInsets.only(
//             left: 18,
//             right: 17,
//             top: 106,
//             bottom: 20,
//           ),
//           decoration: BoxDecoration(
//             color: Colors.black,
//           ),
//         ),
//         SizedBox(
//           height: 11.76,
//         ),
//         SizedBox(
//           child: Text(
//             "Morning Slowbeats - LoFi",
//             style: TextStyle(
//               color: Color(
//                 0xffa3a3a3,
//               ),
//               fontSize: 23.520000457763672,
//               fontWeight: FontWeight.w400,
//               fontFamily: "Roboto",
//             ),
//           ),
//           width: 252.00001525878906,
//         ),
//       ],
//     ),
//     width: MediaQuery.of(context).size.width,
//   );
// `;

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
