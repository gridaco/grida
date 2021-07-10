import React from "react";
import Link from "next/link";
// import styled from "@emotion/styled";

export default function Home() {
  return (
    <>
      {/* <RootContainer> */}
      {/* <BodyContainer /> */}
      <Link href="/figma">from figma</Link>
      <br />
      <br />
      <Link href="/preferences">Preferences (set access token)</Link>
      {/* </RootContainer> */}
    </>
  );
}

// const RootContainer = styled.div`
//   padding: 24px;
// `;

// function BodyContainer() {
//   return (
//     <>
//       <RecentDesignSection />
//     </>
//   );
// }

// function RecentDesignSection() {
//   return <>A?</>;
// }
