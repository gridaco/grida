import Head from 'next/head';
import styles from '../styles/Home.module.css';
import { sections } from '../common/toolkit';
import { Header } from '../sections';

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        {/* region seo optimizations */}
        <title> bridged.xyz </title>
        <meta name="description" content="designs that are meant to be implemented. automate your frontend development process. no more boring."></meta>
        <meta name="keywords" content="flutter, design to code, figma to code, flutter code generation, design handoff, design linting, code generation"></meta>
        <meta name="author" content="bridged.xyz team and community collaborators"></meta>
        {/* region seo optimizations */}
        <link rel="icon" href="/favicon.ico " />{' '}
      </Head>
      <main className={styles.main}>
        <Header />
        {sections.map((item) => {
          return <div style={{ marginTop: '300px' }}>{item.content}</div>;
        })}
      </main>
    </div>
  );
}
