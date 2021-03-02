import Icon from "components/icon";
import Link from "next/link";
import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { center } from 'utils/styled/styles';
import { Box, Flex, Text, Button } from "rebass";
import ExpandHeaderItem from "./expand-header-item";
import { HeaderMap } from "./headermap";

const Header = () => {
	const [currentExpandHeader, setCurrentExpandHeader] = useState("");
	const [isOpenMenu, setIsOpenMenu] = useState(false);

	useEffect(() => {
		if (isOpenMenu) {
			document.getElementsByTagName("body")[0].style.overflow = "hidden"
		} else {
			document.getElementsByTagName("body")[0].style.overflow = "auto"
		}
	}, [isOpenMenu])

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
				<ResponsiveMenu className="cursor" onClick={() => setIsOpenMenu(!isOpenMenu)}>
					<Icon name={isOpenMenu ? "headerClose" : "headerMenu"} />
				</ResponsiveMenu>
				<Flex alignItems="center">
					<Link href="/">
						<Bridged className="cursor" name="bridged" width={32} height={32} />
					</Link>
					<Link href="/">
						<ResponsiveTitle className="cursor" fontSize="18px" ml="8px" fontWeight="600">
							Bridged
            </ResponsiveTitle>
					</Link>
					<NavigationWrapper ml="60px" alignItems="center">
						{HeaderMap.map(i =>
							!i.href ? (
								<ExpandHeaderItem
									type="desktop"
									key={i.label}
									item={i}
									isExpand={currentExpandHeader === i.label}
									onExpandHeader={() => setCurrentExpandHeader(i.label)}
									onContractHeader={() => setCurrentExpandHeader("")}
								/>
							) : (
									<Link href={i.href} key={i.label}>
										<Item
											onMouseOver={() => setCurrentExpandHeader("")}
											className="cursor"
											mx="12px"
											color="#8B8B8B"
											fontWeight="bold"
											fontSize="16px"
										>
											{i.label}
										</Item>
									</Link>
								),
						)}
					</NavigationWrapper>
				</Flex>
				<SignupButton
					onClick={() => {
						!isOpenMenu && window.location.assign("https://accounts.bridged.xyz/signup");
					}}
					style={{ opacity: isOpenMenu && 0 }}
					fontSize={["13px", "13px", "15px"]}
					p={["6px 10px", "6px 10px", "9px 20px", "9px 20px"]}
				>
					Sign up
        </SignupButton>
			</Flex>
			{isOpenMenu &&
				<ResponsiveMenu justifyContent="space-between" style={{ position: "absolute", top: 60, height: "calc(100vh - 60px)" }} bg="#fff" width="100%" px="20px" pb="24px" flexDirection="column">
					<Flex mt="24px" flexDirection="column">
						{HeaderMap.map(i =>
							!i.href ? (
								<ExpandHeaderItem
									key={i.label}
									type="mobile"
									item={i}
									isExpand={currentExpandHeader === i.label}
									onExpandHeader={() => setCurrentExpandHeader(i.label)}
									onContractHeader={() => setCurrentExpandHeader("")}
								/>
							) : (
									<Link href={i.href} key={i.label}>
										<Item
											onMouseOver={() => setCurrentExpandHeader("")}
											className="cursor"
											my="12px"
											color="#8B8B8B"
											fontWeight="bold"
											fontSize="16px"
										>
											{i.label}
										</Item>
									</Link>
								),
						)}
					</Flex>
					<Box>
						<Button width="100%" bg="#2562FF" height="35px" fontSize="13px" mb="12px">
							Sign up
						</Button>
						<Button width="100%" bg="#fff" color="#000" height="35px" fontSize="13px" style={center}>
							<Icon name="lock" isVerticalMiddle mr="6px" /> Sign in
						</Button>
					</Box>
				</ResponsiveMenu>
			}
		</HeaderWrapper>
	);
};

export default Header;

const HeaderWrapper = styled(Flex)`
  position: fixed;
  background-color: #fff;
  z-index: 999;
	border-bottom: 1px solid #F8F8F8;
`;

const Bridged = styled(Icon)`
  @media (max-width: 767px) {
    position: absolute;
  }
`;

const Item = styled(Text)`
	&:hover{
		color:#000;
	}
`

const SignupButton = styled(Button)`
  height: 35px;

	@media (min-width: 767px) {
		opacity: 1 !important;
  }

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
