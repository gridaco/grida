import React from 'react'
import { GithubReleaseNote } from '../../utils/getGithubReleaseNote'
import ReactMarkdown from 'react-markdown';
//@ts-ignore
import style from './index.module.scss';

interface WhatsNewReleaseNoteProps {
    release: GithubReleaseNote
}

const WhatsNewReleaseNote = ({ release }: WhatsNewReleaseNoteProps) => {
    return (
        <div className={style.content_box}>
            <h3>{release.name}</h3>
            <p>
                <ReactMarkdown className={style.markdown}>{release.body}</ReactMarkdown>
            </p>
        </div>
    )
}

export default WhatsNewReleaseNote
