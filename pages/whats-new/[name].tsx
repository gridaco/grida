import React, { useState } from 'react';
import { useRouter } from 'next/router';
import useAsyncEffect from '../../utils/useAsyncEffect';
import axios from 'axios';
import Head from 'next/head';
import { Header, WhatsNewHeaderLabel, WhatsNewReleaseNote } from '../../sections';
import { ThemeProvider } from '@material-ui/core';
import theme from '../../common/theme';
//@ts-ignore
import style from './whats-new.module.scss';
import { GithubReleaseNote, getGithubReleaseNote } from '../../utils/getGithubReleaseNote';
const githubName = 'bridgedxyz';

const UpdateNoteDetail = () => {
  const {
    query: { name },
  } = useRouter();
  const [releases, setReleases] = useState<Array<GithubReleaseNote>>([]);

  useAsyncEffect(async () => {
    name !== undefined && setReleases(await getGithubReleaseNote(githubName, name as string))
  }, [name]);

  console.log(releases)

  return (
    <div className={style.conatiner}>
      <Head>
        <title> What 's new in Bridged {name}</title>
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
      <ThemeProvider theme={theme}>
        <Header />
        <main className={style.main}>
          <div className={style.section_container}>
            <WhatsNewHeaderLabel installUrl={releases[0]?.html_url} label={name} />
            {releases.map(i => <WhatsNewReleaseNote release={i} />)}
          </div>
        </main>
      </ThemeProvider>
    </div>
  );
};

export default UpdateNoteDetail;
