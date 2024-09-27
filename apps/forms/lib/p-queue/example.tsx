import QueueProvider, { useQueue } from ".";
import PQueue from "p-queue";

type ImageQuery = { path: string };
type ImageResult = { src: string };

const queue = new PQueue({ concurrency: 1 });

function App() {
  return (
    <QueueProvider<ImageResult, ImageQuery>
      identifier="src"
      config={{
        max_store_size: null,
      }}
      batch={50}
      throttle={100}
      resolver={(...tasks) => {
        return new Promise((resolve) => {
          delay(1000).then(() => {
            resolve({
              data: [
                {
                  src: "" + ".png",
                },
              ],
              error: null,
            });
          });
        });
      }}
    >
      <Consumer />
    </QueueProvider>
  );
}

function Consumer() {
  const { add, clear } = useQueue();
  add({});
  return <></>;
}
