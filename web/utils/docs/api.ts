import fs from "fs";
import { join, resolve } from "path";
import matter from "gray-matter";
const { readdir } = require("fs").promises;
import { DocsPost, DocsConfig } from "./model";

const DOCS_ROOT_DIR = join(process.cwd(), "../docs");
const MDX_EXT = ".mdx";

async function getFilesIn(dir: string): Promise<readonly string[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(dirent => {
      const res = resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFilesIn(res) : res;
    }),
  );
  return Array.prototype.concat(...files);
}

let DOCS_CONFIG: DocsConfig;

export async function makeDocsConfig(): Promise<DocsConfig> {
  if (DOCS_CONFIG) {
    return DOCS_CONFIG;
  }
  const allFiles = await getFilesIn(DOCS_ROOT_DIR);
  const allMdxPaths = allFiles
    .filter(f => f.includes(MDX_EXT))
    .map(f => f.replace(DOCS_ROOT_DIR, ""));

  const routes = [];
  for (const mp of allMdxPaths) {
    const sp = mp.split("/");
    const filenamewithext = sp[sp.length - 1];
    const filename = filenamewithext.replace(MDX_EXT, "");
    if (filename == "index") {
      routes.push(mp.replace("index.mdx", ""));
    }
    routes.push(mp);
  }

  const routesWithoutIndex = routes.filter(r => {
    const sp = r.split("/");
    return sp[sp.length - 1] !== "index";
  });

  DOCS_CONFIG = {
    files: allMdxPaths,
    routes: routes,
    routesWithoutIndex: routesWithoutIndex,
  };

  return DOCS_CONFIG;
}

export function getPostByPath(path: string | string[]): DocsPost {
  // make ['a', b] as 'a/b'
  if (Array.isArray(path)) {
    path = path.join("/");
  }

  path = path.replace(DOCS_ROOT_DIR, "");
  path = path.replace(MDX_EXT, "");
  const splits = path.split("/").filter(Boolean);
  const realSlug = splits[splits.length - 1];

  // make ful path
  let fullPath;
  if (!path.includes(DOCS_ROOT_DIR)) {
    fullPath = join(DOCS_ROOT_DIR, `${path}`);
  }

  let fileContents;
  if (fs.existsSync(`${fullPath}${MDX_EXT}`)) {
    fileContents = fs.readFileSync(`${fullPath}${MDX_EXT}`, "utf8");
  } else if (fs.existsSync(`${fullPath}/index.mdx`)) {
    fileContents = fs.readFileSync(`${fullPath}/index.mdx`, "utf8");
  }

  const { data, content } = matter(fileContents);

  const item: DocsPost = {
    slug: realSlug,
    route: splits,
    content: content,
  };

  return item;
}

export async function getAllPosts() {
  const paths = await makeDocsConfig();
  const posts = paths.routes.map(slug => getPostByPath(slug));

  return posts;
}
