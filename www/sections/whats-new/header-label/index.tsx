import React from 'react'

type WhatsNewHeaderLabelProps = {
    label: string | undefined | string[]
    installUrl: string
}

function capitalize(str: string) {
    return str !== undefined && str.charAt(0).toUpperCase() + str.slice(1);
}

const WhatsNewHeaderLabel = ({ label, installUrl }: WhatsNewHeaderLabelProps) => {

    return (
        <div>
            <h1>{capitalize(label as string)}</h1>
            <small>Install latest version on <a href={installUrl}>Github</a></small>
        </div>
    )
}

export default WhatsNewHeaderLabel