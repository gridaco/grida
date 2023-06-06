# Notes

## 1. Note: the build works fine with static props, the on vercel deployment, it will fail while dploying after successful build. - revisit this later. (use server side props for now, - with custom sitemap gen.)

Use below snippet to bring back ssg

```ts
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";
import { InferGetStaticPropsType } from "next";

type FigmaCommunityFileMeta = InferGetStaticPropsType<typeof getStaticProps>;

// .....

export async function getStaticPaths() {
  const repo = new FigmaCommunityArchiveMetaRepository();

  return {
    paths: repo.ids().map((id) => ({
      params: {
        id,
      },
    })),
    fallback: true,
  };
}

export async function getStaticProps(context) {
  const id = context.params.id;

  const file = new FigmaCommunityArchiveMetaRepository();

  const props = file.getStaticProps(id);

  return {
    props: props,
  };
}
```
