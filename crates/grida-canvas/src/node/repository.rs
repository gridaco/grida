use crate::node::schema::{Node, NodeId};
use std::collections::HashMap;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::schema::{BaseNode, ErrorNode, Size};

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
}
