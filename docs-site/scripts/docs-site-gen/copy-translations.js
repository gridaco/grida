// Translations transformations

const fse = require("fs-extra");
const marked = require("marked");
const path = require("path");

const docs_site_root = path.join(__dirname, "../../");
const docs_site_docs_root = path.join(__dirname, "../../docs");

/**
 * Loop through the docs directory.
 *
 * If the directory starts with character "@", it means this is a docs-package root.
 *
 * If the directory name is "translations", and contains the meta.json, it means it is a translation directory.
 *
 * The translations directory contains meta.json, and the field "translations" contains provided translated locale codes.
 *
 * Based on this codes, we have to copy the content for docusaurus i18n, which the directory is named in `i18n/<locale-code>`.
 *
 * For example, if the locale code is "fr", the directory is "i18n/fr".
 *
 * This process must be recursive. e.g. the docs-package `@eaxample2` can be located under `@example1`.
 *
 * The final directory (with no versioning) will be "i18n/fr/docusaurus-plugin-content-docs/current".
 *
 * To explain in more details,
 *
 * original directory:
 *  - docs/
 *    - @package1/
 *      - translations/
 *        - fr/
 *          - intro.md
 *        - meta.json
 *      - intro.md
 *
 *
 * final directory, under docs-site root:
 * - docs/
 *  - @package1/
 *    - intro.md
 * - i18n/fr/docusaurus-plugin-content-docs/current/
 *  - intro.md
 */
function handle_translations() {
  handle_dir(docs_site_docs_root);
}

function is_valid_translations_dir(dir_path) {
  const meta_json_path = path.join(dir_path, "meta.json");
  const meta_json_exists = fse.pathExistsSync(meta_json_path);

  // if dirname is not "translations", it is not a translation dir.
  if (path.basename(dir_path) !== "translations") {
    return false;
  }

  if (!meta_json_exists) {
    return false;
  }

  const meta_json = fse.readJsonSync(meta_json_path);

  if (!meta_json.translations) {
    return false;
  }

  return true;
}

/**
 * Allowed extensions
 * - .md
 * - .mdx
 * - .jpg
 * - .jpeg
 * - .png
 * - .gif
 * - .mp4
 * - .webm
 * - .webp
 * - .mov
 *
 */
function is_valid_document_related_file_ext(file_ext) {
  if (
    file_ext === ".md" ||
    file_ext === ".mdx" ||
    file_ext === ".jpg" ||
    file_ext === ".jpeg" ||
    file_ext === ".png" ||
    file_ext === ".gif" ||
    file_ext === ".mp4" ||
    file_ext === ".webm" ||
    file_ext === ".webp" ||
    file_ext === ".mov"
  ) {
    return true;
  }

  return false;
}

function handle_dir(dir_path) {
  const package_dirs = fse.readdirSync(dir_path);

  for (const package_dir of package_dirs) {
    const sub_dir_path = path.join(dir_path, package_dir);

    if (is_valid_translations_dir(sub_dir_path)) {
      handle_translations_dir(sub_dir_path);
    } else if (fse.statSync(sub_dir_path).isDirectory()) {
      handle_dir(sub_dir_path);
    }
  }
}

function handle_translations_dir(dir_path) {
  const translations = fse.readJsonSync(path.join(dir_path, "meta.json"))
    .translations;

  for (const locale of translations) {
    handle_translation_dir(dir_path, locale);
  }

  // remove translations dir after handled
  fse.removeSync(dir_path);
  // log result
  console.log(`translations dir ${dir_path} removed`);
}

/**
 * Handles the single translation directory.
 */
function handle_translation_dir(dir_path, locale) {
  const translation_dir_path = path.join(dir_path, locale);
  const translation_dir_stat = fse.statSync(translation_dir_path);

  if (translation_dir_stat.isDirectory()) {
    const translation_dir_files = fse.readdirSync(translation_dir_path);

    for (const translation_dir_file of translation_dir_files) {
      const translation_dir_file_path = path.join(
        translation_dir_path,
        translation_dir_file,
      );
      const translation_dir_file_stat = fse.statSync(translation_dir_file_path);

      if (translation_dir_file_stat.isFile()) {
        const translation_dir_file_ext = path.extname(
          translation_dir_file_path,
        );

        if (is_valid_document_related_file_ext(translation_dir_file_ext)) {
          const origin_root_path_witout_translations_dir = path.join(
            dir_path,
            "..",
          );
          const rel = path.relative(
            docs_site_docs_root,
            origin_root_path_witout_translations_dir,
          );

          const translation_dir_file_content_translated_path = path.join(
            docs_site_root,
            "i18n",
            locale,
            "docusaurus-plugin-content-docs",
            "current",
            rel,
            translation_dir_file,
          );

          // before copying the file, check if asset is being used, we need to support them.
          // const translation_dir_file_content = fse.readFileSync(
          //   translation_dir_file_path,
          //   "utf8",
          // );

          // transform_translated_doc_content_with_asset_path(
          //   translation_dir_file_content,
          //   path.join(
          //     origin_root_path_witout_translations_dir,
          //     translation_dir_file,
          //   ),
          //   translation_dir_file_content_translated_path,
          // );

          // copy origin file to targetted locale directory
          fse.copySync(
            translation_dir_file_path,
            translation_dir_file_content_translated_path,
          );

          // log
          console.log(
            `[copy-translations] ${locale}: ${path.relative(
              docs_site_docs_root,
              translation_dir_file_path,
            )} -> ${path.relative(
              docs_site_docs_root,
              translation_dir_file_content_translated_path,
            )}`,
          );
        }
      }
    }
  }
}

/**
 * origin_rel_asset_path is relative path to the asset file. from origin file.
 * origin_path is the origin file path.
 * target_path is the path to the translated file.
 * the output should be new_rel_asset_path. which is relative path to the asset file. from translated file.
 *
 * for example,
 * - the origin_path is "./docs/bar.md"
 * - the origin_rel_asset_path is "./assets/image.png"
 * - the target_path is "../i18n/ko/bar.md"
 * - the new_rel_asset_path is "../../docs/assets/image.png"
 * @param {*} origin_rel_asset_path
 * @param {*} target_path
 */
function transform_relative_asset_path(
  origin_rel_asset_path,
  origin_path,
  target_path,
) {
  const abs_path_to_asset = path.join(
    path.dirname(origin_path),
    origin_rel_asset_path,
  );
  const rel_doc_to_root = path.relative(origin_path, docs_site_docs_root);
  const rel_root_to_asset = path.relative(
    docs_site_docs_root,
    abs_path_to_asset,
  );
  // console.log("rel", rel_doc_to_root);
  // console.log("rel2", rel_root_to_asset);

  // const rel = path.relative(docs_site_docs_root, origin_path);
}

function transform_translated_doc_content_with_asset_path(
  content,
  origin_path,
  target_path,
) {
  // parse markdown content with marked.
  const _parsed = marked.lexer(content);

  const _is_remote_url = url => {
    return url.startsWith("http://") || url.startsWith("https://");
  };

  const mapper = item => {
    const { type, tokens, items, raw, href } = item;
    const children = items || tokens;

    if (children) {
      children.map(mapper);
    }

    switch (type) {
      case "image":
        if (_is_remote_url(href)) {
          break;
        }
        // transform_relative_asset_path();
        console.log("image", item, raw, href);
        console.log(
          "new path",
          `"${transform_relative_asset_path(href, origin_path, target_path)}"`,
        );
        break;
    }
  };

  // console.log("lexer", _parsed);
  _parsed.map(mapper);
}

function main() {
  handle_translations();
}

module.exports = main;

// for dev
if (require.main === module) {
  main();
}
