use serde_json::Value;

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct FontInfo {
    pub family: String,
    pub postscript_names: std::collections::HashSet<String>,
    pub styles: std::collections::HashSet<String>,
}

#[derive(Debug, Default)]
pub struct FontUsageStore {
    fonts: std::collections::HashMap<String, FontInfo>,
}

impl FontUsageStore {
    pub fn new() -> Self {
        Self {
            fonts: std::collections::HashMap::new(),
        }
    }

    pub fn register_font(
        &mut self,
        family: String,
        postscript_name: Option<String>,
        style: Option<String>,
    ) {
        let font_info = self.fonts.entry(family.clone()).or_insert(FontInfo {
            family,
            postscript_names: std::collections::HashSet::new(),
            styles: std::collections::HashSet::new(),
        });

        if let Some(postscript) = postscript_name {
            font_info.postscript_names.insert(postscript);
        }

        if let Some(style) = style {
            font_info.styles.insert(style);
        }
    }

    pub fn get_discovered_fonts(&self) -> Vec<FontInfo> {
        self.fonts.values().cloned().collect()
    }

    pub fn clear(&mut self) {
        self.fonts.clear();
    }
}

#[derive(Debug, Clone)]
pub struct FontFileInfo {
    pub family: String,
    pub postscript_name: String,
    pub style: String,
    pub url: String,
}

pub async fn load_webfonts_metadata() -> Result<Value, String> {
    let url = "https://raw.githubusercontent.com/gridaco/google.fonts/refs/heads/main/metadata/webfonts.metadata.json";
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to fetch webfonts metadata: {}", e))?;

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read webfonts metadata response: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse webfonts metadata: {}", e))
}

pub fn find_font_files(metadata: &Value, discovered_fonts: &[FontInfo]) -> Vec<FontFileInfo> {
    let mut font_files = Vec::new();

    for font in discovered_fonts {
        // Try to find the font family in metadata (case-insensitive)
        let font_data = metadata.as_object().and_then(|obj| {
            obj.iter()
                .find(|(key, _)| key.to_lowercase() == font.family.to_lowercase())
                .map(|(_, value)| value)
        });

        if let Some(font_data) = font_data {
            if let Some(postscript_names) = font_data
                .get("post_script_names")
                .and_then(|v| v.as_object())
            {
                if let Some(files) = font_data.get("files").and_then(|v| v.as_object()) {
                    for postscript_name in &font.postscript_names {
                        // Try to find the postscript name in metadata (case-insensitive)
                        let style = postscript_names
                            .iter()
                            .find(|(key, _)| key.to_lowercase() == postscript_name.to_lowercase())
                            .and_then(|(_, value)| value.as_str());

                        if let Some(style) = style {
                            if let Some(url) = files.get(style).and_then(|v| v.as_str()) {
                                font_files.push(FontFileInfo {
                                    family: font.family.clone(),
                                    postscript_name: postscript_name.clone(),
                                    style: style.to_string(),
                                    url: url.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    font_files
}
