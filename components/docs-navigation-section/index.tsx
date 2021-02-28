import React, { useEffect, useState } from 'react'
import styled from '@emotion/styled'
import { Flex, Heading } from 'rebass';
import Link from 'next/link';

const DocsNavigationSection: React.FC<any> = ({ docs }) => {
    const [title, setTitle] = useState("");
    const [childs, setChilds] = useState([]);

    useEffect(() => {
        setTitle(docs[0]?.fileName.replace("/", ""));
        setChilds(docs.map(i => {
            return {
                fileName: i.fileName.split("/")[i.fileName.split("/").length - 1],
                content: i.content
            }
        }));
    }, [docs])

    return (
        (title != "" && !title.includes(".md")) && <SectionWrapper flexDirection="column">

            {childs.map((i, ix) =>
                ix === 0 ?
                    <Link href={`/docs/${title}`}>
                        <Heading fontSize="18px" fontWeight={500}>{title}</Heading>
                    </Link> :
                    <Link
                        key={`child-${i.fileName}`}
                        href={`/docs/${title}/${i.fileName.replace(".md", "")}`}
                    >
                        {i.fileName.replace(".md", "")}
                    </Link>
            )}
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