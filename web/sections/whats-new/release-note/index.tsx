import React, { useState } from 'react'
import { GithubReleaseNote } from 'utils/methods/getGithubReleaseNote'
import useAsyncEffect from 'utils/methods/useAsyncEffect';
import markdownToHtml from 'utils/docs/md-to-html';
import styled from '@emotion/styled';


interface WhatsNewReleaseNoteProps {
  release: GithubReleaseNote
}

const WhatsNewReleaseNote = ({ release }: WhatsNewReleaseNoteProps) => {
  const [innerContent, setInnerContent] = useState("");

  useAsyncEffect(async () => {
    const content = await markdownToHtml(release.body || "");
    setInnerContent(content)
  })

  return (
    <div>
      <h3>{release.name}</h3>
      <p>
        <HTMLRender
          dangerouslySetInnerHTML={{ __html: innerContent }}
        />
      </p>
    </div>
  )
}

export default WhatsNewReleaseNote

const HTMLRender = styled.div`
  img {
    width: 100%;
  }
`