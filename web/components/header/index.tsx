import Icon from "components/icon";
import Link from "next/link";
import React from "react";
import styled from "@emotion/styled";
import { Box, Flex, Text, Button } from "rebass";
import ExpandHeaderItem from "./expand-header-item";
import { HeaderMap } from "./headermap";

const Header = () => {
	return (
		<HeaderWrapper
			alignItems="center"
			justifyContent="center"
			width="100%"
			height="60px"
		>
			<Flex
				width={["320px", "730px", "985px", "1040px"]}
				mx="20px"
				justifyContent="space-between"
				alignItems="center"
				height="100%"
			>
				<ResponsiveMenu>
					<Icon name="headerMenu" />
				</ResponsiveMenu>
				<Flex alignItems="center">
					<Link href="/">
						<Bridged name="bridged" width={32} height={32} />
					</Link>
					<Link href="/">
						<ResponsiveTitle fontSize="18px" ml="8px" fontWeight="600">
							Bridged
            </ResponsiveTitle>
					</Link>
					<NavigationWrapper ml="60px" alignItems="center">
						{HeaderMap.map(i =>
							!i.href ? (
								<ExpandHeaderItem key={i.label} item={i} />
							) : (
									<Link href={i.href} key={i.label}>
										<Text
											mx="12px"
											color="#8B8B8B"
											fontWeight="bold"
											fontSize="16px"
										>
											{i.label}
										</Text>
									</Link>
								),
						)}
					</NavigationWrapper>
				</Flex>
				<SignupButton
					onClick={() => {
						window.location.assign("https://accounts.bridged.xyz/signup");
					}}
					fontSize={["13px", "13px", "15px"]}
					p={["6px 10px", "6px 10px", "9px 20px", "9px 20px"]}
				>
					Sign up
        </SignupButton>
			</Flex>
		</HeaderWrapper>
	);
};

export default Header;

const HeaderWrapper = styled(Flex)`
  position: fixed;
  background-color: #fff;
  z-index: 999;
`;

const Bridged = styled(Icon)`
  @media (max-width: 767px) {
    position: absolute;
  }
`;

const SignupButton = styled(Button)`
  height: 35px;

  @media (max-width: 767px) {
    height: 25px;
  }
`;

const NavigationWrapper = styled(Flex)`
  height: 24px;

  @media (max-width: 767px) {
    display: none;
  }
`;

const ResponsiveMenu = styled(Flex)`
  display: none;

  @media (max-width: 767px) {
    display: flex;
  }
`;

const ResponsiveTitle = styled(Text)`
  @media (max-width: 1100px) {
    display: none;
  }
`;
