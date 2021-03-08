import Meta from "./meta";
import { Flex } from 'rebass';

export default function Layout({ preview, children }) {
  return (
    <>
      <Meta />
      <Flex alignItems="center" justifyContent="center">
        <Flex width={["320px", "730px", "985px", "1040px"]} my="80px">{children}</Flex>
      </Flex>
    </>
  );
}
