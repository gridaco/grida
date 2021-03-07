# TODO

- Fix issues that fail to load docs file tree

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

**ISSUE DESCRIPTION**

Nextjs is SSR Framework, so the server side can create and send the initial props.

In this case, We are using the logic above because I can list up the documents on the sidebar only if I know the file tree of docs.

The problematic part is the fs of nodejs. fs library is cannot be used by clients.

So after adding logic to the server for use in webpack, we added above code to getInitaiProps in nextjs.

However, it does not run in a product environment while it does well in a development environment.

# REFERNCE

https://nextjs.org/blog/markdown

https://www.pullrequest.com/blog/build-a-blog-with-nextjs-and-markdown/
