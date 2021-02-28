import React, { useEffect } from 'react'
import { NextPage } from 'next';
import fs from 'fs';
import { cwd } from 'process';
import { Docs } from 'utils/models/docs';

interface DocsListPageProps {
    docsList: Docs[]
}

const DocsListPage: NextPage<DocsListPageProps> = ({ docsList }) => {

    return (
        <div>
            {JSON.stringify(docsList)}
        </div>
    )
}

DocsListPage.getInitialProps = async (context) => {
    const docsFiles: Array<string> = await fs.promises.readdir(cwd() + '/docs');
    const docsContent = docsFiles.map(async root => {
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

    return { docsList: await Promise.all(docsContent) };
}

export default DocsListPage
