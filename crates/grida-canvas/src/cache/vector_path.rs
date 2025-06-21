use crate::node::schema::NodeId;
use skia_safe::Path;
use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::rc::Rc;

#[derive(Clone, Debug)]
pub struct VectorPathCacheEntry {
    pub hash: u64,
    pub path: Rc<Path>,
}

#[derive(Default, Clone, Debug)]
pub struct VectorPathCache {
    entries: HashMap<NodeId, VectorPathCacheEntry>,
}

impl VectorPathCache {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    fn hash(data: &str) -> u64 {
        let mut h = DefaultHasher::new();
        data.hash(&mut h);
        h.finish()
    }

    pub fn get_or_create(&mut self, id: &NodeId, data: &str) -> Rc<Path> {
        let hash = Self::hash(data);
        if let Some(entry) = self.entries.get(id) {
            if entry.hash == hash {
                return entry.path.clone();
            }
        }
        let path = skia_safe::path::Path::from_svg(data).expect("invalid SVG path");
        let rc = Rc::new(path);
        self.entries.insert(
            id.clone(),
            VectorPathCacheEntry {
                hash,
                path: rc.clone(),
            },
        );
        rc
    }

    pub fn invalidate(&mut self) {
        self.entries.clear();
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn get(&self, id: &NodeId) -> Option<&VectorPathCacheEntry> {
        self.entries.get(id)
    }
}
