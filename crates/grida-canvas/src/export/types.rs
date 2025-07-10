use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum ExportConstraints {
    #[serde(rename = "SCALE")]
    Scale(f32),
    #[serde(rename = "WIDTH")]
    ScaleToWidth(f32),
    #[serde(rename = "HEIGHT")]
    ScaleToHeight(f32),
}

#[derive(Clone, Deserialize)]
pub struct ExportAsPNG {
    pub(crate) constraints: ExportConstraints,
}

impl Default for ExportAsPNG {
    fn default() -> Self {
        Self {
            constraints: ExportConstraints::Scale(1.0),
        }
    }
}

#[derive(Clone, Deserialize)]
pub struct ExportAsJPEG {
    pub(crate) constraints: ExportConstraints,
}

#[derive(Clone, Deserialize)]
pub struct ExportAsWEBP {
    pub(crate) constraints: ExportConstraints,
}

#[derive(Clone, Deserialize)]
pub struct ExportAsBMP {
    pub(crate) constraints: ExportConstraints,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "format")]
pub enum ExportAs {
    #[serde(rename = "PNG")]
    PNG(ExportAsPNG),
    #[serde(rename = "JPEG")]
    JPEG(ExportAsJPEG),
    #[serde(rename = "WEBP")]
    WEBP(ExportAsWEBP),
    #[serde(rename = "BMP")]
    BMP(ExportAsBMP),
}

impl ExportAs {
    pub fn png() -> Self {
        Self::PNG(ExportAsPNG::default())
    }

    pub fn jpeg(constraints: ExportConstraints) -> Self {
        Self::JPEG(ExportAsJPEG { constraints })
    }
}

impl ExportAs {
    pub fn get_constraints(&self) -> &ExportConstraints {
        match self {
            ExportAs::PNG(config) => &config.constraints,
            ExportAs::JPEG(config) => &config.constraints,
            ExportAs::WEBP(config) => &config.constraints,
            ExportAs::BMP(config) => &config.constraints,
        }
    }
}
