import React from 'react'
import styled from '@emotion/styled'
import { Flex, Heading } from 'rebass';
import { Docs } from 'utils/models/docs'
import Link from 'next/link';

interface DocsNavigationSectionProps {
    docs: Docs
}

const DocsNavigationSection: React.FC<DocsNavigationSectionProps> = ({ docs }) => {
    return (
        <SectionWrapper flexDirection="column">
            <Link href={`/docs/${docs.fileName}`}>
                <Heading fontSize="18px" fontWeight={500}>{docs.fileName}</Heading>
            </Link>
            {docs.child.map(i => <Link key={`child-${i.fileName}`} href={`/docs/${docs.fileName}/${i.fileName.replace(".md", "")}`}>{i.fileName}</Link>)}
        </SectionWrapper>
    )
}

export default DocsNavigationSection

const SectionWrapper = styled(Flex)`
    margin-top: 50px;

    a {
        margin-top: 12px;
        color: #686868;
    }
`