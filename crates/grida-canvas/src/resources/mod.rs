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

/// Extract all image URLs from a scene.
pub fn extract_image_urls(scene: &Scene) -> Vec<String> {
    // FIXME: this should either iterate the fills / strokes (all paints) rather then iterating the nodes. - the below implementation is legacy.
    let mut urls = Vec::new();
    for (id, _) in scene.graph.iter() {
        if let Ok(n) = scene.graph.get_node(id) {
            if let crate::node::schema::Node::Rectangle(rect) = n {
                for fill in &rect.fills {
                    if let Paint::Image(img) = fill {
                        match &img.image {
                            ResourceRef::RID(r) | ResourceRef::HASH(r) => urls.push(r.clone()),
                        }
                    }
                }
                for stroke in &rect.strokes {
                    if let Paint::Image(img) = stroke {
                        match &img.image {
                            ResourceRef::RID(r) | ResourceRef::HASH(r) => urls.push(r.clone()),
                        }
                    }
                }
            }
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
