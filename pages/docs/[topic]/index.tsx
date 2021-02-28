import React, { useEffect } from 'react'
import renderToString from 'next-mdx-remote/render-to-string'
import hydrate from 'next-mdx-remote/hydrate'
import matter from 'gray-matter'

const DocsInnerContent = ({ mdxSource }) => {

    const content = hydrate(mdxSource)
    return <div className="wrapper">{content}</div>
}

DocsInnerContent.getInitialProps = async (context) => {
    const { query: { topic } } = context;

    const markdown = await import(`../../../docs/${topic}/index.md`);

    const { content } = matter(markdown.default)

    const mdxSource = await renderToString(content)
    return { mdxSource }
}

export default DocsInnerContent
