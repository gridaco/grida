import React, { useState } from 'react';
import { useRouter } from 'next/router';
import useAsyncEffect from 'utils/hooks/use-async-effect';
import axios from 'axios';
import Head from 'next/head';
import { GithubReleaseNote, getGithubReleaseNote } from 'utils/methods/getGithubReleaseNote';
import { Flex } from 'rebass';
import WhatsNewHeaderLabel from 'sections/whats-new/header-label';
import WhatsNewReleaseNote from 'sections/whats-new/release-note';
import { center } from 'utils/styled/styles';
const githubName = 'bridgedxyz';

const UpdateNoteDetail = () => {
  const {
    query: { name },
  } = useRouter();
  const [releases, setReleases] = useState<Array<GithubReleaseNote>>([]);

  useAsyncEffect(async () => {
    name !== undefined && setReleases(await getGithubReleaseNote(githubName, name as string))
  }, [name]);

  return (
    <React.Fragment>
      <Head>
        <title>Bridged {name} Release Notes</title>
        <meta
          name="description"
          content="designs that are meant to be implemented. automate your frontend development process. no more boring."
        />
        <meta
          name="keywords"
          content="flutter, design to code, figma to code, flutter code generation, design handoff, design linting, code generation"
        />
        <meta
          name="author"
          content="bridged.xyz team and community collaborators"
        />
        <link rel="icon" href="/favicon.png" />
        <link
          href="https://fonts.googleapis.com/css?family=Roboto:400,100,300,100italic,300italic,400italic,500italic,500,700,700italic,900,900italic"
          rel="stylesheet"
          type="text/css"
        />
      </Head>
      <Flex style={center}>
        <Flex width={["320px", "730px", "985px", "1040px"]} flexDirection="column" mx="20px" mb="20px">
          <WhatsNewHeaderLabel installUrl={releases[0]?.html_url} label={name} />
          {releases.map(i => <WhatsNewReleaseNote release={i} key={i.id} />)}
        </Flex>
      </Flex>
    </React.Fragment>
  );
};

export default UpdateNoteDetail;