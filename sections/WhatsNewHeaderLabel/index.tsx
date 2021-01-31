import { Router } from 'next/router';
import React from 'react'
// @ts-ignore
import styles from './index.module.scss';

type WhatsNewHeaderLabelProps = {
    label: string | undefined | string[]
    installUrl: string
}

function capitalize(str: string) {
    return str !== undefined && str.charAt(0).toUpperCase() + str.slice(1);
}

const WhatsNewHeaderLabel = ({ label, installUrl }: WhatsNewHeaderLabelProps) => {

    return (
        <div className={styles.title_box}>
            <h1>{capitalize(label as string)}</h1>
            <small>Install latest version on <a href={installUrl}>Github</a></small>
        </div>
    )
}

export default WhatsNewHeaderLabel
