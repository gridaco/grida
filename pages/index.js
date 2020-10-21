import Head from 'next/head';
import styles from '../styles/Home.module.css';
import { sections } from '../common/toolkit';
import { Header } from '../sections';

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title> bridged.xyz </title> <link rel="icon" href="/favicon.ico " />{' '}
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
