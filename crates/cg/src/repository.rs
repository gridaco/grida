use crate::schema::{Node, NodeId};
use skia_safe::{FontMgr, Image};
use std::collections::HashMap;

/// A repository for managing nodes with automatic ID indexing.
#[derive(Debug, Clone)]
pub struct NodeRepository {
    /// The map of all nodes indexed by their IDs
    nodes: HashMap<NodeId, Node>,
}

/// A repository for managing images with automatic ID indexing.
#[derive(Debug, Clone)]
pub struct ImageRepository {
    /// The map of all images indexed by their source URLs
    images: HashMap<String, Image>,
}

/// A repository for managing fonts.
#[derive(Debug, Clone)]
pub struct FontRepository {
    /// The font manager for handling font data
    font_mgr: FontMgr,
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

impl ImageRepository {
    /// Creates a new empty image repository
    pub fn new() -> Self {
        Self {
            images: HashMap::new(),
        }
    }

    /// Adds an image to the repository
    pub fn add(&mut self, src: String, image: Image) {
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

impl FontRepository {
    /// Creates a new empty font repository
    pub fn new() -> Self {
        Self {
            font_mgr: FontMgr::new(),
        }
    }

    /// Adds a font to the repository
    pub fn add(&mut self, bytes: &[u8]) {
        self.font_mgr.new_from_data(bytes, None);
    }

    /// Gets a reference to the font manager
    pub fn font_mgr(&self) -> &FontMgr {
        &self.font_mgr
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
