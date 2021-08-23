import Head from "next/head";
import styles from "../styles/Home.module.css";

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Grida.site</title>
        <meta name="description" content="Host your grida websites" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          grida.site is{" "}
          <a href="https://github.com/gridaco/grida/issues/26">
            under development
          </a>
        </h1>

        <p className={styles.description}>
          Get started by creating your{" "}
          <code className={styles.code}>grida workspace</code>
        </p>

        <div className={styles.grid}>
          <a href="https://grida.co/docs" className={styles.card}>
            <h2>Documentation &rarr;</h2>
            <p>Learn more about using grida</p>
          </a>

          <a href="https://github.com/gridaco/examples" className={styles.card}>
            <h2>Examples &rarr;</h2>
            <p>Discover and deploy boilerplate Grida projects.</p>
          </a>

          <a
            href="https://github.com/gridaco/grida/issues/26"
            className={styles.card}
          >
            <h2>Contribute &rarr;</h2>
            <p>
              Grida is an opensource project. Contribute to grida.site
              development
            </p>
          </a>
        </div>
      </main>

      <footer className={styles.footer}>Powered by Grida © 2021</footer>
    </div>
  );
}
