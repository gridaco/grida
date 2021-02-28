import React, { useEffect } from 'react'
import { NextPage } from 'next';
import fs from 'fs';
import { cwd } from 'process';

type Docs = {
    type: "file" | "dir" | string;
    fileName: string;
    child?: Docs[];
}

interface DocsListPageProps {
    docsList: Docs[]
}

const DocsMainPAge: NextPage<DocsListPageProps> = ({ docsList }) => {

    return (
        <div>
            {JSON.stringify(docsList)}
        </div>
    )
}

DocsMainPAge.getInitialProps = async (context) => {
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

export default DocsMainPAge
