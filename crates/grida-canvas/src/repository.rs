use crate::node::schema::{Node, NodeId};
use skia_safe::{
    FontMgr, Image,
    textlayout::{FontCollection, TypefaceFontProvider},
};
use std::collections::HashMap;

/// Generic repository trait for storing resources keyed by an identifier.
pub trait ResourceRepository<T> {
    type Id;

    /// Insert a resource with an identifier.
    fn insert(&mut self, id: Self::Id, item: T);

    /// Get a reference to a resource by id.
    fn get(&self, id: &Self::Id) -> Option<&T>;

    /// Get a mutable reference to a resource by id.
    fn get_mut(&mut self, id: &Self::Id) -> Option<&mut T>;

    /// Remove a resource, returning it if present.
    fn remove(&mut self, id: &Self::Id) -> Option<T>;

    /// Iterator over the resources.
    type Iter<'a>: Iterator<Item = (&'a Self::Id, &'a T)>
    where
        Self: 'a,
        T: 'a;

    fn iter(&self) -> Self::Iter<'_>;

    /// Number of stored resources.
    fn len(&self) -> usize;

    /// Whether repository is empty.
    fn is_empty(&self) -> bool;
}

/// A repository for managing nodes with automatic ID indexing.
#[derive(Debug, Clone)]
pub struct NodeRepository {
    /// The map of all nodes indexed by their IDs
    nodes: HashMap<NodeId, Node>,
}

impl NodeRepository {
    /// Creates a new empty node repository
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
        }
    }

    /// Inserts a node into the repository, automatically indexing it by its ID.
    /// Returns the node's ID.
    pub fn insert(&mut self, node: Node) -> NodeId {
        let id = match &node {
            Node::Error(n) => n.base.id.clone(),
            Node::Group(n) => n.base.id.clone(),
            Node::Container(n) => n.base.id.clone(),
            Node::Rectangle(n) => n.base.id.clone(),
            Node::Ellipse(n) => n.base.id.clone(),
            Node::Polygon(n) => n.base.id.clone(),
            Node::RegularPolygon(n) => n.base.id.clone(),
            Node::RegularStarPolygon(n) => n.base.id.clone(),
            Node::Line(n) => n.base.id.clone(),
            Node::TextSpan(n) => n.base.id.clone(),
            Node::Path(n) => n.base.id.clone(),
            Node::BooleanOperation(n) => n.base.id.clone(),
            Node::Image(n) => n.base.id.clone(),
        };
        self.nodes.insert(id.clone(), node);
        id
    }

    /// Gets a reference to a node by its ID
    pub fn get(&self, id: &NodeId) -> Option<&Node> {
        self.nodes.get(id)
    }

    /// Gets a mutable reference to a node by its ID
    pub fn get_mut(&mut self, id: &NodeId) -> Option<&mut Node> {
        self.nodes.get_mut(id)
    }

    /// Removes a node from the repository by its ID
    pub fn remove(&mut self, id: &NodeId) -> Option<Node> {
        self.nodes.remove(id)
    }

    /// Returns an iterator over all nodes in the repository
    pub fn iter(&self) -> impl Iterator<Item = (&NodeId, &Node)> {
        self.nodes.iter()
    }

    /// Returns the number of nodes in the repository
    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    /// Returns true if the repository is empty
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
}

impl Default for NodeRepository {
    fn default() -> Self {
        Self::new()
    }
}

impl FromIterator<(NodeId, Node)> for NodeRepository {
    fn from_iter<T: IntoIterator<Item = (NodeId, Node)>>(iter: T) -> Self {
        let mut repo = Self::new();
        for (_, node) in iter {
            repo.insert(node);
        }
        repo
    }
}

/// A repository for managing images with automatic ID indexing.
#[derive(Debug, Clone)]
pub struct ImageRepository {
    /// The map of all images indexed by their source URLs
    images: HashMap<String, Image>,
}

impl ImageRepository {
    /// Creates a new empty image repository
    pub fn new() -> Self {
        Self {
            images: HashMap::new(),
        }
    }

    /// Adds an image to the repository
    pub fn insert(&mut self, src: String, image: Image) {
        self.images.insert(src, image);
    }

    /// Gets a reference to an image by its source URL
    pub fn get(&self, src: &str) -> Option<&Image> {
        self.images.get(src)
    }

    /// Removes an image from the repository by its source URL
    pub fn remove(&mut self, src: &str) -> Option<Image> {
        self.images.remove(src)
    }
}

impl ResourceRepository<Image> for ImageRepository {
    type Id = String;
    type Iter<'a> = std::collections::hash_map::Iter<'a, String, Image>;

    fn insert(&mut self, id: Self::Id, item: Image) {
        self.images.insert(id, item);
    }

    fn get(&self, id: &Self::Id) -> Option<&Image> {
        self.images.get(id)
    }

    fn get_mut(&mut self, id: &Self::Id) -> Option<&mut Image> {
        self.images.get_mut(id)
    }

    fn remove(&mut self, id: &Self::Id) -> Option<Image> {
        self.images.remove(id)
    }

    fn iter(&self) -> Self::Iter<'_> {
        self.images.iter()
    }

    fn len(&self) -> usize {
        self.images.len()
    }

    fn is_empty(&self) -> bool {
        self.images.is_empty()
    }
}

/// A repository for managing fonts.
pub struct FontRepository {
    provider: TypefaceFontProvider,
    fonts: HashMap<String, Vec<u8>>,
}

impl FontRepository {
    pub fn new() -> Self {
        Self {
            provider: TypefaceFontProvider::new(),
            fonts: HashMap::new(),
        }
    }

    pub fn insert(&mut self, family: String, bytes: Vec<u8>) {
        if let Some(tf) = FontMgr::new().new_from_data(&bytes, None) {
            self.provider.register_typeface(tf, Some(family.as_str()));
        }
        self.fonts.insert(family, bytes);
    }

    pub fn add(&mut self, bytes: &[u8], family: &str) {
        if let Some(tf) = FontMgr::new().new_from_data(bytes, None) {
            self.provider.register_typeface(tf, Some(family));
        }
    }

    pub fn font_collection(&self) -> FontCollection {
        let mut collection = FontCollection::new();
        collection.set_asset_font_manager(Some(self.provider.clone().into()));
        collection
    }
}

impl ResourceRepository<Vec<u8>> for FontRepository {
    type Id = String;
    type Iter<'a> = std::collections::hash_map::Iter<'a, String, Vec<u8>>;

    fn insert(&mut self, id: Self::Id, item: Vec<u8>) {
        if let Some(tf) = FontMgr::new().new_from_data(&item, None) {
            self.provider.register_typeface(tf, Some(id.as_str()));
        }
        self.fonts.insert(id, item);
    }

    fn get(&self, id: &Self::Id) -> Option<&Vec<u8>> {
        self.fonts.get(id)
    }

    fn get_mut(&mut self, id: &Self::Id) -> Option<&mut Vec<u8>> {
        self.fonts.get_mut(id)
    }

    fn remove(&mut self, id: &Self::Id) -> Option<Vec<u8>> {
        self.fonts.remove(id)
    }

    fn iter(&self) -> Self::Iter<'_> {
        self.fonts.iter()
    }

    fn len(&self) -> usize {
        self.fonts.len()
    }

    fn is_empty(&self) -> bool {
        self.fonts.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::schema::{BaseNode, ErrorNode, Size};
    use skia_safe::surfaces;

    #[test]
    fn node_repository_basic() {
        let mut repo = NodeRepository::new();
        let node = Node::Error(ErrorNode {
            base: BaseNode {
                id: "1".to_string(),
                name: "err".to_string(),
                active: true,
            },
            transform: math2::transform::AffineTransform::identity(),
            size: Size {
                width: 10.0,
                height: 10.0,
            },
            error: "err".to_string(),
            opacity: 1.0,
        });

        let id = repo.insert(node.clone());
        assert!(repo.get(&id).is_some());
        assert_eq!(repo.len(), 1);
        assert!(!repo.is_empty());
        repo.remove(&id);
        assert!(repo.is_empty());
    }

    #[test]
    fn image_repository_basic() {
        let mut repo = ImageRepository::new();
        let mut surface = surfaces::raster_n32_premul((1, 1)).unwrap();
        let image = surface.image_snapshot();
        repo.insert("img".to_string(), image.clone());
        assert!(repo.get("img").is_some());
        assert_eq!(repo.len(), 1);
        repo.remove("img");
        assert!(repo.is_empty());
    }

    #[test]
    fn font_repository_basic() {
        let mut repo = FontRepository::new();
        repo.insert("f1".to_string(), vec![0u8; 4]);
        assert!(repo.get(&"f1".to_string()).is_some());
        assert_eq!(repo.len(), 1);
        repo.remove(&"f1".to_string());
        assert!(repo.is_empty());
    }
}
