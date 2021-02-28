import React, { useEffect } from 'react'
import { useRouter } from 'next/router';

const DocsInnerContent = () => {
    const router = useRouter();
    useEffect(() => {
        console.log(router)
    }, [router])

    return (
        <div>

        </div>
    )
}

export default DocsInnerContent
