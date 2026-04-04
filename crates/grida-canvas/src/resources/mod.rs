mod byte_store;
mod index;

use seahash::SeaHasher;
use std::{
    hash::Hasher,
    sync::{Arc, Mutex},
};

pub use byte_store::ByteStore;
pub use index::ResourceIndex;

use crate::cg::types::{Paint, ResourceRef};
use crate::node::schema::Scene;
#[cfg(not(target_arch = "wasm32"))]
use crate::window::application::{HostEvent, HostEventCallback};
#[cfg(not(target_arch = "wasm32"))]
use futures::channel::mpsc;

#[derive(Default)]
pub struct Resources {
    bytes: Arc<Mutex<ByteStore>>,
    index: ResourceIndex,
}

impl Resources {
    /// Create a new empty resource store.
    pub fn new() -> Self {
        Self {
            bytes: Arc::new(Mutex::new(ByteStore::new())),
            index: ResourceIndex::new(),
        }
    }

    /// Create resources backed by an existing [`ByteStore`].
    pub fn with_store(store: Arc<Mutex<ByteStore>>) -> Self {
        Self {
            bytes: store,
            index: ResourceIndex::new(),
        }
    }

    /// Get a reference to the underlying [`ByteStore`].
    pub fn byte_store(&self) -> Arc<Mutex<ByteStore>> {
        Arc::clone(&self.bytes)
    }

    /// Insert bytes under a logical RID returning a `mem://` URL.
    pub fn insert(&mut self, rid: &str, bytes: Vec<u8>) -> String {
        let hash = hash_bytes(&bytes);
        self.bytes.lock().unwrap().insert(hash, bytes);
        self.index.insert(rid.to_string(), hash);
        mem_url(hash)
    }

    /// Store bytes and return a `mem://` URL without associating a RID.
    pub fn create_mem(&mut self, bytes: Vec<u8>) -> String {
        let hash = hash_bytes(&bytes);
        self.bytes.lock().unwrap().insert(hash, bytes);
        mem_url(hash)
    }

    /// Get bytes by logical RID.
    pub fn get(&self, rid: &str) -> Option<Vec<u8>> {
        self.index
            .get(rid)
            .and_then(|h| self.bytes.lock().unwrap().get(h).cloned())
    }

    /// Get bytes directly by `mem://` URL.
    pub fn get_mem(&self, url: &str) -> Option<Vec<u8>> {
        parse_mem_url(url).and_then(|h| self.bytes.lock().unwrap().get(h).cloned())
    }

    /// Remove bytes by RID returning them if present.
    pub fn remove(&mut self, rid: &str) -> Option<Vec<u8>> {
        self.index
            .remove(rid)
            .and_then(|h| self.bytes.lock().unwrap().remove(h))
    }

    /// Number of resources stored.
    pub fn len(&self) -> usize {
        self.index.len()
    }

    /// Whether the resource store is empty.
    pub fn is_empty(&self) -> bool {
        self.index.is_empty()
    }
}

pub fn hash_bytes(bytes: &[u8]) -> u64 {
    let mut hasher = SeaHasher::new();
    hasher.write(bytes);
    hasher.finish()
}

fn mem_url(hash: u64) -> String {
    format!("mem://{:016x}", hash)
}

fn parse_mem_url(url: &str) -> Option<u64> {
    url.strip_prefix("mem://")
        .and_then(|hex| u64::from_str_radix(hex, 16).ok())
}

#[derive(Debug, Clone)]
pub struct ImageMessage {
    pub src: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct FontMessage {
    pub family: String,
    pub style: Option<String>,
    pub data: Vec<u8>,
}

/// Collect the URL string from a [`ResourceRef`].
#[allow(dead_code)]
fn resource_ref_url(r: &ResourceRef) -> &str {
    match r {
        ResourceRef::RID(s) | ResourceRef::HASH(s) => s,
    }
}

/// Push any image URLs found in a paint slice.
#[allow(dead_code)]
fn collect_image_urls_from_paints(paints: &[Paint], out: &mut Vec<String>) {
    for paint in paints {
        if let Paint::Image(img) = paint {
            let url = resource_ref_url(&img.image);
            if !url.is_empty() {
                out.push(url.to_owned());
            }
        }
    }
}

/// Extract all image URLs from a scene by inspecting every node's fills,
/// strokes, and dedicated image references.
// TODO: consider a dedicated paints store or iterator so this doesn't need
// to match every node variant individually.
#[allow(dead_code)]
fn extract_image_urls(scene: &Scene) -> Vec<String> {
    use crate::node::schema::Node;
    let mut urls = Vec::new();
    for (id, _) in scene.graph.iter() {
        let Ok(node) = scene.graph.get_node(&id) else {
            continue;
        };

        match node {
            Node::Image(n) => {
                let url = resource_ref_url(&n.fill.image);
                if !url.is_empty() {
                    urls.push(url.to_owned());
                }
            }
            Node::Rectangle(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::Ellipse(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::Container(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::Vector(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::Polygon(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::RegularPolygon(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::RegularStarPolygon(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::Path(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::BooleanOperation(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::TextSpan(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::Line(n) => {
                // LineNodeRec has strokes only, no fills.
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::AttributedText(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
                for run in &n.attributed_string.runs {
                    if let Some(ref fills) = run.fills {
                        collect_image_urls_from_paints(fills, &mut urls);
                    }
                    if let Some(ref strokes) = run.strokes {
                        collect_image_urls_from_paints(strokes, &mut urls);
                    }
                }
            }
            Node::Tray(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
                collect_image_urls_from_paints(&n.strokes, &mut urls);
            }
            Node::MarkdownEmbed(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
            }
            Node::HTMLEmbed(n) => {
                collect_image_urls_from_paints(&n.fills, &mut urls);
            }
            // Group, InitialContainer, and Error nodes have no paint data.
            Node::Group(_) | Node::InitialContainer(_) | Node::Error(_) => {}
        }
    }
    urls
}

/// Load all images in a scene and send events for each loaded image.
#[cfg(not(target_arch = "wasm32"))]
pub async fn load_scene_images(
    scene: &Scene,
    tx: mpsc::UnboundedSender<ImageMessage>,
    event_cb: HostEventCallback,
) {
    for url in extract_image_urls(scene) {
        if let Ok(data) = load_image(&url).await {
            let msg = ImageMessage {
                src: url.clone(),
                data,
            };
            let _ = tx.unbounded_send(msg.clone());
            (event_cb)(HostEvent::ImageLoaded(msg));
        }
    }
}

/// Load an image from a URL or file path.
#[cfg(not(target_arch = "wasm32"))]
pub async fn load_image(path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    if path.starts_with("http") {
        let res = reqwest::get(path).await?;
        Ok(res.bytes().await?.to_vec())
    } else {
        Ok(std::fs::read(path)?)
    }
}

#[cfg(target_arch = "wasm32")]
pub async fn load_image(_path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    Err("Image loading not supported in wasm".into())
}

/// Load a font from a URL or file path.
#[cfg(not(target_arch = "wasm32"))]
pub async fn load_font(path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    if path.starts_with("http") {
        let res = reqwest::get(path).await?;
        Ok(res.bytes().await?.to_vec())
    } else {
        Ok(std::fs::read(path)?)
    }
}

#[cfg(target_arch = "wasm32")]
pub async fn load_font(_path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    Err("Font loading not supported in wasm".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resources_len_and_is_empty() {
        let mut resources = Resources::new();

        // Initially empty
        assert_eq!(resources.len(), 0);
        assert!(resources.is_empty());

        // Add a resource
        resources.insert("test1", vec![1, 2, 3]);
        assert_eq!(resources.len(), 1);
        assert!(!resources.is_empty());

        // Add another resource
        resources.insert("test2", vec![4, 5, 6]);
        assert_eq!(resources.len(), 2);
        assert!(!resources.is_empty());

        // Remove a resource
        resources.remove("test1");
        assert_eq!(resources.len(), 1);
        assert!(!resources.is_empty());

        // Remove the last resource
        resources.remove("test2");
        assert_eq!(resources.len(), 0);
        assert!(resources.is_empty());
    }
}
