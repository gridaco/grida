import remark from "remark";

export default async function markdownToHtml(markdown) {
  const result = await remark().process(markdown);
  return result.toString();
}
