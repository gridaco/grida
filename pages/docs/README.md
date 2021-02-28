# TODO

- Fix getInitialProps file system issue ( fs ) : can not load docs file struct.

**ISSUE LOGIC**

```ts
const docsFiles: Array<string> = await fs.promises?.readdir(cwd() + "/docs");
const docsContent = docsFiles?.map(async root => {
  if (root.includes(".md")) {
    return {
      type: "file",
      fileName: root,
    };
  } else {
    const innerFiles = await fs.promises.readdir(cwd() + `/docs/${root}`);
    return {
      type: "dir",
      fileName: root,
      child: innerFiles.map(file => ({ type: "file", fileName: file })),
    };
  }
});
return { docsList: await Promise.all(docsContent), mdxSource };
```

# REFERNCE

https://nextjs.org/blog/markdown

https://www.pullrequest.com/blog/build-a-blog-with-nextjs-and-markdown/
