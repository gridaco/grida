export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
        <h1>
          grida.site is{" "}
          <a href="https://github.com/gridaco/grida/issues/26">
            under development
          </a>
        </h1>

        <p>
          Get started by creating your{" "}
          <code >grida workspace</code>
        </p>

        <div >
          <a href="https://grida.co/docs" >
            <h2>Documentation &rarr;</h2>
            <p>Learn more about using grida</p>
          </a>

          <a href="https://github.com/gridaco/examples" >
            <h2>Examples &rarr;</h2>
            <p>Discover and deploy boilerplate Grida projects.</p>
          </a>

          <a
            href="https://github.com/gridaco/grida/issues/26"
          >
            <h2>Contribute &rarr;</h2>
            <p>
              Grida is an opensource project. Contribute to grida.site
              development
            </p>
          </a>
        </div>
    </main>
  )
}
