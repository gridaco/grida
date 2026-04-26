use pulldown_cmark::{html, Options, Parser};

/// based on Canvas-compatible spec.
/// e.g. we wont support jsx, very likely not.
pub fn markdown_to_html(markdown: &str) -> String {
    // Enable GitHub Flavored Markdown (GFM) features
    let options = Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TABLES
        | Options::ENABLE_MATH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_HEADING_ATTRIBUTES;

    let parser = Parser::new_ext(markdown, options);
    let mut html = String::new();
    html::push_html(&mut html, parser);
    html
}
