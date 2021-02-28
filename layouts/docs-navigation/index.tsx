import React, { useEffect, useState } from 'react'
import styled from '@emotion/styled';
import { Flex } from 'rebass';
import DocsSearchBar from 'components/docs-search-bar';
import DocsNavigationSection from 'components/docs-navigation-section';
import { Docs } from 'utils/models/docs';

interface DocsNavigationProps {
    docsList?: Docs[]
}

const DocsNavigation: React.FC<DocsNavigationProps> = ({ docsList = [] }) => {
    const [navigationDocsList, setNavigationDocsList] = useState([]);

    useEffect(() => {
        if (docsList.length !== 0) {
            localStorage.setItem("docsList", JSON.stringify(docsList))
            setNavigationDocsList(docsList)
        } else {
            setNavigationDocsList(JSON.parse(localStorage.getItem("docsList")))
        }
    }, [])

    return (
        <NavigationWrapper flexDirection="column" mr="70px">
            <DocsSearchBar />
            {navigationDocsList.map(i => !i.fileName.includes(".md") && <DocsNavigationSection key={`navigation-${i.fileName}`} docs={i} />)}
        </NavigationWrapper>
    )
}

export default DocsNavigation

const NavigationWrapper = styled(Flex)`
    min-width: 250px;
    height: 100%;
`