use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum ExportConstraints {
    #[serde(rename = "NONE")]
    None,
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
    #[serde(default)]
    pub(crate) quality: Option<u32>, // 0-100, None means use Skia default
}

#[derive(Clone, Deserialize)]
pub struct ExportAsWEBP {
    pub(crate) constraints: ExportConstraints,
    #[serde(default)]
    pub(crate) quality: Option<u32>, // 0-100, None means use Skia default
}

#[derive(Clone, Deserialize)]
pub struct ExportAsBMP {
    pub(crate) constraints: ExportConstraints,
}

#[derive(Clone, Deserialize)]
pub struct ExportAsPDF {
    // pdf export does not support constraints
}

#[derive(Clone, Deserialize)]
pub struct ExportAsSVG {
    // svg export does not support constraints
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
    #[serde(rename = "PDF")]
    PDF(ExportAsPDF),
    #[serde(rename = "SVG")]
    SVG(ExportAsSVG),
}

#[derive(Clone)]
pub enum ExportAsImage {
    PNG(ExportAsPNG),
    JPEG(ExportAsJPEG),
    WEBP(ExportAsWEBP),
    BMP(ExportAsBMP),
}

impl ExportAsImage {
    pub fn get_constraints(&self) -> &ExportConstraints {
        match self {
            ExportAsImage::PNG(config) => &config.constraints,
            ExportAsImage::JPEG(config) => &config.constraints,
            ExportAsImage::WEBP(config) => &config.constraints,
            ExportAsImage::BMP(config) => &config.constraints,
        }
    }
}

impl TryFrom<ExportAs> for ExportAsImage {
    type Error = ();

    fn try_from(value: ExportAs) -> Result<Self, ()> {
        match value {
            ExportAs::PNG(x) => Ok(Self::PNG(x)),
            ExportAs::JPEG(x) => Ok(Self::JPEG(x)),
            ExportAs::WEBP(x) => Ok(Self::WEBP(x)),
            ExportAs::BMP(x) => Ok(Self::BMP(x)),
            _ => Err(()),
        }
    }
}

impl ExportAs {
    pub fn png() -> Self {
        Self::PNG(ExportAsPNG::default())
    }

    pub fn jpeg(constraints: ExportConstraints, quality: Option<u32>) -> Self {
        Self::JPEG(ExportAsJPEG {
            constraints,
            quality,
        })
    }

    pub fn pdf() -> Self {
        Self::PDF(ExportAsPDF {})
    }

    pub fn svg() -> Self {
        Self::SVG(ExportAsSVG {})
    }

    pub fn is_format_image(&self) -> bool {
        matches!(
            self,
            ExportAs::PNG(_) | ExportAs::JPEG(_) | ExportAs::WEBP(_) | ExportAs::BMP(_)
        )
    }

    pub fn is_format_pdf(&self) -> bool {
        matches!(self, ExportAs::PDF(_))
    }

    pub fn is_format_svg(&self) -> bool {
        matches!(self, ExportAs::SVG(_))
    }
}

impl ExportAs {
    pub fn get_constraints(&self) -> &ExportConstraints {
        match self {
            ExportAs::PNG(config) => &config.constraints,
            ExportAs::JPEG(config) => &config.constraints,
            ExportAs::WEBP(config) => &config.constraints,
            ExportAs::BMP(config) => &config.constraints,
            ExportAs::PDF(_) => &ExportConstraints::None,
            ExportAs::SVG(_) => &ExportConstraints::None,
        }
    }
}
