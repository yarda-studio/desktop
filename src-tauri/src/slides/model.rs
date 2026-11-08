use serde::{Deserialize, Serialize};

/// One text box or picture on a slide. Position and size are percentages of the
/// slide, so a slide lays out the same on any output resolution; `font_size` is
/// px on a 1080p frame.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct SlideElement {
    pub id: String,
    /// "text" or "image".
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub text: String,
    pub font_size: f64,
    pub color: String,
    /// "left", "center" or "right".
    pub align: String,
    pub bold: bool,
    /// Text only: shrink the text, never below a readable floor, until it fits
    /// the box. `font_size` is then the largest size it may have. Slides saved
    /// before this existed read as false, so they look exactly as they did.
    pub auto_fit: bool,
    /// A downscaled picture as an image data URL (image elements only).
    pub image: Option<String>,
}

impl Default for SlideElement {
    fn default() -> Self {
        Self {
            id: String::new(),
            kind: "text".into(),
            x: 10.0,
            y: 10.0,
            w: 80.0,
            h: 20.0,
            text: String::new(),
            font_size: 64.0,
            color: "#ffffff".into(),
            align: "center".into(),
            bold: true,
            auto_fit: false,
            image: None,
        }
    }
}

/// One screen of a slide: its own backdrop and its own boxes and pictures.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default)]
pub struct SlidePage {
    /// Unique within the slide; lets the editor keep a page's identity as pages move.
    pub id: String,
    /// "theme" (the active presentation theme's backdrop), "black" or a "#rrggbb" colour.
    pub background: String,
    pub elements: Vec<SlideElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct SlideDoc {
    /// `None` until the slide has been saved once.
    pub id: Option<i64>,
    pub title: String,
    /// "announcement" (a title and a body, always one page) or "freeform"
    /// (any boxes and pictures, one or more pages).
    pub kind: String,
    /// Always at least one page once saved.
    pub pages: Vec<SlidePage>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SlideSummary {
    pub id: i64,
    pub title: String,
    pub kind: String,
    pub updated_at: i64,
}
