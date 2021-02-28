import React, { useEffect } from 'react'
import renderToString from 'next-mdx-remote/render-to-string'
import hydrate from 'next-mdx-remote/hydrate'
import matter from 'gray-matter'
import DocsNavigation from 'layouts/docs-navigation'
import { Flex } from 'rebass'
import fs from 'fs';
import { cwd } from 'process'

const DocsInnerContent = ({ mdxSource, docsList }) => {

    const content = hydrate(mdxSource)

    return <Flex my="90px">
        <DocsNavigation docsList={docsList} />
        <div className="wrapper">{content}</div>
    </Flex>
}

DocsInnerContent.getInitialProps = async (context) => {
    const { query: { topic } } = context;
    const markdown = await import(`../../../docs/${topic}/index.md`);
    const { content } = matter(markdown.default)
    const mdxSource = await renderToString(content)

    try {
        const docsFiles: Array<string> = await fs.promises?.readdir(cwd() + '/docs');
        const docsContent = docsFiles?.map(async root => {
            if (root.includes(".md")) {
                return {
                    type: "file",
                    fileName: root
                }
            } else {
                const innerFiles = await fs.promises.readdir(cwd() + `/docs/${root}`);
                return {
                    type: "dir",
                    fileName: root,
                    child: innerFiles.map(file => ({ type: "file", fileName: file }))
                }
            }
        })
        return { docsList: await Promise.all(docsContent), mdxSource };
    } catch (e) {
        return { mdxSource };
    }
}

export default DocsInnerContent
