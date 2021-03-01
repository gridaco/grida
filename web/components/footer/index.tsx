import Icon from 'components/icon';
import React from 'react'
import { Box, Flex, Text } from 'rebass';
import styled from '@emotion/styled';
import { Sitemap } from './sitemap';
import SitemapList from 'components/sitemap-list';
import { media } from 'utils/styled/media';

const Footer = () => {
    return (
        <Flex alignItems="center" justifyContent="center" width="100%" bg="#eee" >
            <FooterContent width={["320px", "730px", "985px", "1250px"]} mt={["40px", "50px", "100px", "150px"]}>
                <Icon name="bridged" mr="100px" mb="64px" ml="20px" />
                <SitemapWrapper>
                    {Sitemap.map(i => <SitemapList key={i.label} sitemap={i} />)}
                </SitemapWrapper>
            </FooterContent>
        </Flex>
    )
}

export default Footer

const FooterContent = styled(Flex)`
    justify-content: center;

    @media (max-width: 768px) {
        flex-direction: column
    }
`

const SitemapWrapper = styled(Box)`
  margin: 0 20px;
  width: calc(100% - 40px);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  grid-column-gap: 100px;
  grid-row-gap: 64px;

  @media (max-width: 360px) {
    grid-column-gap: 80px;
  }
`