import Icon from 'components/icon';
import React from 'react'
import { Box, Flex, Text } from 'rebass';
import styled from '@emotion/styled';
import { Sitemap } from './sitemap';
import SitemapList from 'components/sitemap-list';
import { media } from 'utils/styled/media';
import { IconList } from 'components/icon/icons';

const iconList: Array<keyof IconList> = ["youtube", "instagram", "twitter", "facebook", "dribble", "github"]

const Footer = () => {
    return (
        <Flex alignItems="center" justifyContent="center" width="100%" bg="#eee" >
            <Flex width={["320px", "730px", "985px", "1250px"]} my={["40px", "50px", "100px", "150px"]} mx="20px" flexDirection='column'>
                <FooterContent width="100%" >
                    <Icon name="bridged" mr="100px" mb="64px" />
                    <SitemapWrapper>
                        {Sitemap.map(i => <SitemapList key={i.label} sitemap={i} />)}
                    </SitemapWrapper>
                </FooterContent>
                <Box mt="80px">
                    {iconList.map(i => <Icon name={i} mr="12px" />)}
                </Box>
                <FooterBottom justifyContent="space-between" my="24px">
                    <Text>Copyright © 2021 Bridged XYZ LLC</Text>
                    <Flex className="policys">
                        <Text>Cookies</Text>
                        <Text>Privacy policy</Text>
                        <Text>Terms and conditions</Text>
                    </Flex>
                </FooterBottom>
            </Flex>
        </Flex>
    )
}

export default Footer

const FooterContent = styled(Flex)`
    justify-content: center;

    @media (max-width: 767px) {
        flex-direction: column
    }
`

const FooterBottom = styled(Flex)`
    color: #4E4E4E;
    font-size: 14px;
    @media (max-width: 767px) {
        flex-direction: column;

        .policys {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(95px, 1fr));
            margin-top: 20px;

            div {
                margin-top: 4px;
                white-space: nowrap;
                margin-left: 0px !important;
            }
        }
    }

    .policys { 
        div {
            margin-left: 16px;
        }
    }
    
`


const SitemapWrapper = styled(Box)`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  grid-column-gap: 100px;
  grid-row-gap: 64px;

  @media (max-width: 360px) {
    grid-column-gap: 80px;
  }
`