import fs from "fs";
import { join } from "path";
import matter from "gray-matter";

const docsDir = join(process.cwd(), "../docs");

export function getPostSlugs() {
  return fs
    .readdirSync(docsDir)
    .filter(f => f.includes(".md") || f.includes(".mdx"));
}

interface Post {
  content;
  date;
  slug;
}

export function getPostBySlug(slug, fields = []): Post {
  const realSlug = slug.replace(/\.md$/, "");
  const fullPath = join(docsDir, `${realSlug}.md`);
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  const items = {};

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

  return items as any;
}

export function getAllPosts(fields = []) {
  const slugs = getPostSlugs();
  const posts = slugs
    .map(slug => getPostBySlug(slug, fields))
    // sort posts by date in descending order
    .sort((post1, post2) =>
      (post1 as any).date > (post2 as any).date ? -1 : 1,
    );
  return posts;
}
