import fs from "fs";
import { join, resolve } from "path";
import matter from "gray-matter";
const { readdir } = require("fs").promises;
import { DocsPost } from "./model";
const docsDir = join(process.cwd(), "../docs");

async function getFiles(dir) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(dirent => {
      const res = resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    }),
  );
  return Array.prototype.concat(...files);
}

export async function getPostPaths() {
  const all = await getFiles(docsDir);
  const allMdxPaths = all.filter(f => f.includes(".md") || f.includes(".mdx"));

  const final = [];
  for (const mp of allMdxPaths) {
    const sp = mp.split("/");
    const filenamewithext = sp[sp.length - 1];
    const filename = filenamewithext.replace(".mdx", "");
    if (filename == "index") {
      final.push(mp.replace("index.mdx", ""));
    }
    final.push(mp);
  }
  return final;
}

export function getPostByPath(path: string | string[], fields = []): DocsPost {
  if (Array.isArray(path)) {
    let builtPath = "";
    path.map(p => {
      builtPath = builtPath + "/" + p;
    });
    path = builtPath;
  }

  path = path.replace(docsDir, "");
  path = path.replace(/\.mdx$/, "");
  const splits = path.split("/").filter(Boolean);
  const realSlug = splits[splits.length - 1];

  let fullPath = `${path}`;
  if (!fullPath.includes(docsDir)) {
    fullPath = join(docsDir, `${path}`);
  }

  let fileContents;
  if (fs.existsSync(`${fullPath}.mdx`)) {
    fileContents = fs.readFileSync(`${fullPath}.mdx`, "utf8");
  } else if (fs.existsSync(`${fullPath}/index.mdx`)) {
    fileContents = fs.readFileSync(`${fullPath}/index.mdx`, "utf8");
  }

  const { data, content } = matter(fileContents);

  const items: DocsPost = {
    slug: realSlug,
    path: splits,
  };

  // Ensure only the minimal needed data is exposed
  fields.forEach(field => {
    if (field === "slug") {
      items[field] = realSlug;
    }
    if (field === "content") {
      items[field] = content;
    }
    if (data[field]) {
      items[field] = data[field];
    }
  });

  return items;
}

export async function getAllPosts(fields = []) {
  const paths = await getPostPaths();
  const posts = paths.map(slug => getPostByPath(slug, fields));

  return posts;
}
