import Head from 'next/head';
import styles from '../styles/Home.module.scss';
import { sections } from '../common/toolkit';
import { Header } from '../sections';
import { ThemeProvider } from '@material-ui/core';
import theme from '../common/theme';

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        {/* region seo optimizations */}
        <title> bridged.xyz </title>
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
        {/* region seo optimizations */}
        <link rel="icon" href="/favicon.png" />
      </Head>
      <ThemeProvider theme={theme}>
        <main className={styles.main}>
          <Header />
          {sections.map((item) => {
            return (
              <div
                style={{
                  marginTop: '300px',
                }}
              >
                {item.content}
              </div>
            );
          })}
        </main>
      </ThemeProvider>
    </div>
  );
}
