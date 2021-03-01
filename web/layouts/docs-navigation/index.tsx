import React, { useEffect, useState } from 'react'
import styled from '@emotion/styled';
import { Flex } from 'rebass';
import DocsSearchBar from 'components/docs-search-bar';
import DocsNavigationSection from 'components/docs-navigation-section';
import { docs } from 'utils/methods/getDocs';

const DocsNavigation: React.FC = () => {

    return (
        <NavigationWrapper flexDirection="column" mr="70px">
            <DocsSearchBar />
            {Object.keys(docs).map(i => <DocsNavigationSection key={`navigation`} docs={docs[i]} />)}
        </NavigationWrapper>
    )
}

export default DocsNavigation

const NavigationWrapper = styled(Flex)`
    min-width: 250px;
    height: 100%;
`