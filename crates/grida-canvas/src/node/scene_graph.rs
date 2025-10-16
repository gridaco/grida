use super::repository::NodeRepository;
use super::schema::{Node, NodeId};
use std::collections::HashMap;

/// Parent reference in the scene graph
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Parent {
    /// Root-level node (direct child of the scene)
    Root,
    /// Child of another node
    NodeId(NodeId),
}

/// Error type for SceneGraph operations
#[derive(Debug, Clone)]
pub enum SceneGraphError {
    NodeNotFound(NodeId),
    ParentNotFound(NodeId),
    ChildNotFound(NodeId),
    IndexOutOfBounds {
        parent: NodeId,
        index: usize,
        len: usize,
    },
}

impl std::fmt::Display for SceneGraphError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SceneGraphError::NodeNotFound(id) => write!(f, "Node not found: {}", id),
            SceneGraphError::ParentNotFound(id) => write!(f, "Parent not found: {}", id),
            SceneGraphError::ChildNotFound(id) => write!(f, "Child not found: {}", id),
            SceneGraphError::IndexOutOfBounds { parent, index, len } => {
                write!(
                    f,
                    "Index out of bounds for parent {}: index {} but length is {}",
                    parent, index, len
                )
            }
        }
    }
}

impl std::error::Error for SceneGraphError {}

pub type SceneGraphResult<T> = Result<T, SceneGraphError>;

/// A scene graph that manages both the tree structure and node data.
///
/// The SceneGraph maintains:
/// - Root node IDs (direct children of the scene)
/// - An adjacency list (parent->children) for the tree structure
/// - A node repository for storing actual node data
///
/// This provides a centralized, efficient way to manage scene hierarchy
/// separate from node attributes.
#[derive(Debug, Clone)]
pub struct SceneGraph {
    /// Root node IDs - direct children of the scene
    roots: Vec<NodeId>,
    /// Parent to children adjacency list
    links: HashMap<NodeId, Vec<NodeId>>,
    /// Node data repository
    nodes: NodeRepository,
}

impl SceneGraph {
    /// Creates a new empty scene graph
    pub fn new() -> Self {
        Self {
            roots: Vec::new(),
            links: HashMap::new(),
            nodes: NodeRepository::new(),
        }
    }

    /// Create a SceneGraph from a complete snapshot (typical IO loader use case).
    ///
    /// This is optimized for deserializing complete scene data where nodes and links
    /// are provided as separate collections.
    ///
    /// # Arguments
    /// * `nodes` - Iterator of nodes to add to the repository
    /// * `links` - HashMap of parent->children relationships
    /// * `roots` - Root node IDs (direct children of the scene)
    pub fn new_from_snapshot(
        node_pairs: impl IntoIterator<Item = (NodeId, Node)>,
        links: HashMap<NodeId, Vec<NodeId>>,
        roots: Vec<NodeId>,
    ) -> Self {
        let mut graph = Self::new();

        // Add all nodes to the repository with their explicit IDs
        for (id, node) in node_pairs {
            graph.nodes.insert_with_id(id, node);
        }

        // Set up all links
        graph.links = links;

        // Set roots
        graph.roots = roots;

        graph
    }

    // -------------------------------------------------------------------------
    // Graph Structure Methods
    // -------------------------------------------------------------------------

    /// Add a node to the graph and link it to a parent in one operation.
    ///
    /// Returns the node's ID.
    pub fn append_child(&mut self, node: Node, parent: Parent) -> NodeId {
        let id = self.nodes.insert(node);

        match parent {
            Parent::Root => {
                self.roots.push(id.clone());
            }
            Parent::NodeId(parent_id) => {
                self.links
                    .entry(parent_id)
                    .or_insert_with(Vec::new)
                    .push(id.clone());
            }
        }

        id
    }

    /// Add multiple nodes to the graph and link them all to a parent in one operation.
    /// This is a bulk convenience method for adding multiple children to the same parent.
    ///
    /// Returns the node IDs in the same order as the input nodes.
    pub fn append_children(&mut self, nodes: Vec<Node>, parent: Parent) -> Vec<NodeId> {
        let mut ids = Vec::new();
        for node in nodes {
            let id = self.append_child(node, parent.clone());
            ids.push(id);
        }
        ids
    }

    /// Get children of a node, if any exist
    pub fn get_children(&self, id: &NodeId) -> Option<&Vec<NodeId>> {
        self.links.get(id)
    }

    /// Add a child to a parent's children list
    pub fn add_child(&mut self, parent: &NodeId, child: NodeId) -> SceneGraphResult<()> {
        let children = self
            .links
            .get_mut(parent)
            .ok_or_else(|| SceneGraphError::ParentNotFound(parent.clone()))?;
        children.push(child);
        Ok(())
    }

    /// Insert a child at a specific index in the parent's children list
    pub fn add_child_at(
        &mut self,
        parent: &NodeId,
        child: NodeId,
        index: usize,
    ) -> SceneGraphResult<()> {
        let children = self
            .links
            .get_mut(parent)
            .ok_or_else(|| SceneGraphError::ParentNotFound(parent.clone()))?;

        if index > children.len() {
            return Err(SceneGraphError::IndexOutOfBounds {
                parent: parent.clone(),
                index,
                len: children.len(),
            });
        }

        children.insert(index, child);
        Ok(())
    }

    /// Remove a child from a parent's children list
    pub fn remove_child(&mut self, parent: &NodeId, child: &NodeId) -> SceneGraphResult<()> {
        let children = self
            .links
            .get_mut(parent)
            .ok_or_else(|| SceneGraphError::ParentNotFound(parent.clone()))?;

        let pos = children
            .iter()
            .position(|id| id == child)
            .ok_or_else(|| SceneGraphError::ChildNotFound(child.clone()))?;

        children.remove(pos);
        Ok(())
    }

    /// Iterate over all parent->children pairs
    pub fn iter(&self) -> impl Iterator<Item = (&NodeId, &Vec<NodeId>)> {
        self.links.iter()
    }

    /// Get the root nodes (direct children of the scene)
    pub fn roots(&self) -> &[NodeId] {
        &self.roots
    }

    // -------------------------------------------------------------------------
    // Node Data Methods
    // -------------------------------------------------------------------------

    /// Get a reference to a node by ID
    pub fn get_node(&self, id: &NodeId) -> SceneGraphResult<&Node> {
        self.nodes
            .get(id)
            .ok_or_else(|| SceneGraphError::NodeNotFound(id.clone()))
    }

    /// Get a mutable reference to a node by ID
    pub fn get_node_mut(&mut self, id: &NodeId) -> SceneGraphResult<&mut Node> {
        self.nodes
            .get_mut(id)
            .ok_or_else(|| SceneGraphError::NodeNotFound(id.clone()))
    }

    /// Remove a node from the repository and return it
    pub fn remove_node(&mut self, id: &NodeId) -> SceneGraphResult<Node> {
        self.nodes
            .remove(id)
            .ok_or_else(|| SceneGraphError::NodeNotFound(id.clone()))
    }

    /// Check if a node exists in the repository
    pub fn has_node(&self, id: &NodeId) -> bool {
        self.nodes.get(id).is_some()
    }

    /// Get the number of nodes in the graph
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Check if the graph is empty
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    // -------------------------------------------------------------------------
    // Tree Traversal Methods
    // -------------------------------------------------------------------------

    /// Walk the tree in pre-order (parent before children)
    pub fn walk_preorder(
        &self,
        root: &NodeId,
        visitor: &mut impl FnMut(&NodeId),
    ) -> SceneGraphResult<()> {
        if !self.has_node(root) {
            return Err(SceneGraphError::NodeNotFound(root.clone()));
        }

        visitor(root);

        if let Some(children) = self.get_children(root) {
            for child in children {
                self.walk_preorder(child, visitor)?;
            }
        }

        Ok(())
    }

    /// Walk the tree in post-order (children before parent)
    pub fn walk_postorder(
        &self,
        root: &NodeId,
        visitor: &mut impl FnMut(&NodeId),
    ) -> SceneGraphResult<()> {
        if !self.has_node(root) {
            return Err(SceneGraphError::NodeNotFound(root.clone()));
        }

        if let Some(children) = self.get_children(root) {
            for child in children {
                self.walk_postorder(child, visitor)?;
            }
        }

        visitor(root);

        Ok(())
    }

    /// Get all ancestors of a node (path to root)
    pub fn ancestors(&self, id: &NodeId) -> SceneGraphResult<Vec<NodeId>> {
        if !self.has_node(id) {
            return Err(SceneGraphError::NodeNotFound(id.clone()));
        }

        let mut result = Vec::new();
        let mut current = id.clone();

        // Find parent by searching all links
        loop {
            let mut found_parent = false;
            for (parent_id, children) in &self.links {
                if children.contains(&current) {
                    result.push(parent_id.clone());
                    current = parent_id.clone();
                    found_parent = true;
                    break;
                }
            }

            if !found_parent {
                break;
            }
        }

        Ok(result)
    }

    /// Get all descendants of a node (all children recursively)
    pub fn descendants(&self, id: &NodeId) -> SceneGraphResult<Vec<NodeId>> {
        if !self.has_node(id) {
            return Err(SceneGraphError::NodeNotFound(id.clone()));
        }

        let mut result = Vec::new();

        self.walk_preorder(id, &mut |node_id| {
            if node_id != id {
                result.push(node_id.clone());
            }
        })?;

        Ok(result)
    }
}

impl Default for SceneGraph {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::schema::{ErrorNodeRec, NodeTrait, Size};
    use math2::transform::AffineTransform;

    fn create_test_node(id: u64) -> Node {
        Node::Error(ErrorNodeRec {
            active: true,
            transform: AffineTransform::identity(),
            size: Size {
                width: 10.0,
                height: 10.0,
            },
            error: "test".to_string(),
            opacity: 1.0,
        })
    }

    #[test]
    fn test_scene_graph_basic() {
        let mut graph = SceneGraph::new();

        let node_a = create_test_node(1);
        let node_b = create_test_node(2);
        let node_c = create_test_node(3);

        let id_a = graph.append_child(node_a, Parent::Root);
        let id_b = graph.append_child(node_b, Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(node_c, Parent::NodeId(id_a.clone()));

        assert_eq!(graph.node_count(), 3);
        assert_eq!(graph.get_children(&id_a).unwrap().len(), 2);
        assert_eq!(graph.get_children(&id_a).unwrap(), &vec![id_b, id_c]);
    }

    #[test]
    fn test_add_child() {
        let mut graph = SceneGraph::new();

        let node_a = create_test_node(1);
        let node_b = create_test_node(2);
        let node_c = create_test_node(3);

        // Create parent with one child first
        let id_a = graph.append_child(node_a, Parent::Root);
        let id_b = graph.append_child(node_b, Parent::NodeId(id_a.clone()));

        // Now add another child dynamically using add_child
        let id_c = graph.append_child(node_c, Parent::Root);
        graph.add_child(&id_a, id_c.clone()).unwrap();

        assert_eq!(graph.get_children(&id_a).unwrap().len(), 2);
        assert_eq!(graph.get_children(&id_a).unwrap()[0], id_b);
        assert_eq!(graph.get_children(&id_a).unwrap()[1], id_c);
    }

    #[test]
    fn test_add_child_at() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(1), Parent::Root);
        let id_b = graph.append_child(create_test_node(2), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(3), Parent::NodeId(id_a.clone()));
        let id_d = graph.append_child(create_test_node(4), Parent::Root);

        // Insert id_d at index 1 in id_a's children (between id_b and id_c)
        graph.add_child_at(&id_a, id_d.clone(), 1).unwrap();

        let children = graph.get_children(&id_a).unwrap();
        assert_eq!(children.len(), 3);
        assert_eq!(children[0], id_b);
        assert_eq!(children[1], id_d);
        assert_eq!(children[2], id_c);
    }

    #[test]
    fn test_remove_child() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(1), Parent::Root);
        let id_b = graph.append_child(create_test_node(2), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(3), Parent::NodeId(id_a.clone()));

        graph.remove_child(&id_a, &id_b).unwrap();

        let children = graph.get_children(&id_a).unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0], id_c);
    }

    #[test]
    fn test_roots() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(1), Parent::Root);
        let id_b = graph.append_child(create_test_node(2), Parent::NodeId(id_a.clone()));
        let _id_c = graph.append_child(create_test_node(3), Parent::NodeId(id_b.clone()));

        let roots = graph.roots();
        assert_eq!(roots.len(), 1);
        assert!(roots.contains(&id_a));
    }

    #[test]
    fn test_walk_preorder() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(1), Parent::Root);
        let id_b = graph.append_child(create_test_node(2), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(3), Parent::NodeId(id_a.clone()));

        let mut visited = Vec::new();
        graph
            .walk_preorder(&id_a, &mut |id| visited.push(id.clone()))
            .unwrap();

        assert_eq!(visited, vec![id_a.clone(), id_b, id_c]);
    }

    #[test]
    fn test_walk_postorder() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(1), Parent::Root);
        let id_b = graph.append_child(create_test_node(2), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(3), Parent::NodeId(id_a.clone()));

        let mut visited = Vec::new();
        graph
            .walk_postorder(&id_a, &mut |id| visited.push(id.clone()))
            .unwrap();

        assert_eq!(visited, vec![id_b, id_c, id_a]);
    }

    #[test]
    fn test_ancestors() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(1), Parent::Root);
        let id_b = graph.append_child(create_test_node(2), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(3), Parent::NodeId(id_b.clone()));

        let ancestors = graph.ancestors(&id_c).unwrap();
        assert_eq!(ancestors, vec![id_b, id_a]);
    }

    #[test]
    fn test_descendants() {
        let mut graph = SceneGraph::new();

        let id_a = graph.append_child(create_test_node(1), Parent::Root);
        let id_b = graph.append_child(create_test_node(2), Parent::NodeId(id_a.clone()));
        let id_c = graph.append_child(create_test_node(3), Parent::NodeId(id_b.clone()));

        let descendants = graph.descendants(&id_a).unwrap();
        assert_eq!(descendants.len(), 2);
        assert!(descendants.contains(&id_b));
        assert!(descendants.contains(&id_c));
    }

    #[test]
    fn test_error_node_not_found() {
        let graph = SceneGraph::new();
        let result = graph.get_node(&9999);
        assert!(matches!(result, Err(SceneGraphError::NodeNotFound(_))));
    }

    #[test]
    fn test_error_parent_not_found() {
        let mut graph = SceneGraph::new();
        let id_b = graph.append_child(create_test_node(2), Parent::Root);
        let result = graph.add_child(&9999, id_b);
        assert!(matches!(result, Err(SceneGraphError::ParentNotFound(_))));
    }

    #[test]
    fn test_append_child_to_root() {
        let mut graph = SceneGraph::new();
        let node_a = create_test_node(1);
        let id_a = graph.append_child(node_a, Parent::Root);

        assert_eq!(graph.roots().len(), 1);
        assert!(graph.roots().contains(&id_a));
        assert!(graph.has_node(&id_a));
    }

    #[test]
    fn test_append_child_to_parent() {
        let mut graph = SceneGraph::new();
        let parent = create_test_node(10);
        let child = create_test_node(11);

        let parent_id = graph.append_child(parent, Parent::Root);
        let child_id = graph.append_child(child, Parent::NodeId(parent_id.clone()));

        assert_eq!(graph.get_children(&parent_id).unwrap().len(), 1);
        assert_eq!(graph.get_children(&parent_id).unwrap()[0], child_id);
    }

    #[test]
    fn test_append_multiple_children() {
        let mut graph = SceneGraph::new();
        let parent = create_test_node(10);
        let child1 = create_test_node(21);
        let child2 = create_test_node(22);

        let parent_id = graph.append_child(parent, Parent::Root);
        let child1_id = graph.append_child(child1, Parent::NodeId(parent_id.clone()));
        let child2_id = graph.append_child(child2, Parent::NodeId(parent_id.clone()));

        let children = graph.get_children(&parent_id).unwrap();
        assert_eq!(children.len(), 2);
        assert_eq!(children[0], child1_id);
        assert_eq!(children[1], child2_id);
    }

    #[test]
    fn test_append_children_to_root() {
        let mut graph = SceneGraph::new();
        let nodes = vec![
            create_test_node(1),
            create_test_node(2),
            create_test_node(3),
        ];
        let ids = graph.append_children(nodes, Parent::Root);

        assert_eq!(graph.roots().len(), 3);
        assert_eq!(ids.len(), 3);
        assert!(graph.roots().contains(&ids[0]));
        assert!(graph.roots().contains(&ids[1]));
        assert!(graph.roots().contains(&ids[2]));
    }

    #[test]
    fn test_append_children_to_parent() {
        let mut graph = SceneGraph::new();
        let parent = create_test_node(10);
        let parent_id = graph.append_child(parent, Parent::Root);

        let children_nodes = vec![
            create_test_node(21),
            create_test_node(22),
            create_test_node(23),
        ];
        let child_ids = graph.append_children(children_nodes, Parent::NodeId(parent_id.clone()));

        assert_eq!(child_ids.len(), 3);
        let children = graph.get_children(&parent_id).unwrap();
        assert_eq!(children.len(), 3);
        assert_eq!(children[0], child_ids[0]);
        assert_eq!(children[1], child_ids[1]);
        assert_eq!(children[2], child_ids[2]);
    }

    #[test]
    fn test_append_children_empty() {
        let mut graph = SceneGraph::new();
        let ids = graph.append_children(vec![], Parent::Root);

        assert_eq!(ids.len(), 0);
        assert_eq!(graph.roots().len(), 0);
    }

    #[test]
    fn test_new_from_snapshot() {
        let id_a = 1;
        let id_b = 2;
        let id_c = 3;

        let node_a = create_test_node(id_a);
        let node_b = create_test_node(id_b);
        let node_c = create_test_node(id_c);

        let node_pairs = vec![(id_a, node_a), (id_b, node_b), (id_c, node_c)];
        let mut links = HashMap::new();
        links.insert(id_a, vec![id_b, id_c]);
        let roots = vec![id_a];

        let graph = SceneGraph::new_from_snapshot(node_pairs, links, roots);

        assert_eq!(graph.node_count(), 3);
        assert_eq!(graph.roots().len(), 1);
        assert_eq!(graph.get_children(&id_a).unwrap().len(), 2);
    }

    #[test]
    fn test_new_from_snapshot_empty() {
        let graph = SceneGraph::new_from_snapshot(vec![], HashMap::new(), vec![]);

        assert_eq!(graph.node_count(), 0);
        assert_eq!(graph.roots().len(), 0);
        assert!(graph.is_empty());
    }

    #[test]
    fn test_new_from_snapshot_complex_hierarchy() {
        let id_root = 100;
        let id_a = 1;
        let id_b = 2;
        let id_c = 3;

        let node_root = create_test_node(id_root);
        let node_a = create_test_node(id_a);
        let node_b = create_test_node(id_b);
        let node_c = create_test_node(id_c);

        let node_pairs = vec![
            (id_root, node_root),
            (id_a, node_a),
            (id_b, node_b),
            (id_c, node_c),
        ];
        let mut links = HashMap::new();
        links.insert(id_root, vec![id_a, id_b]);
        links.insert(id_b, vec![id_c]);
        let roots = vec![id_root];

        let graph = SceneGraph::new_from_snapshot(node_pairs, links, roots);

        assert_eq!(graph.node_count(), 4);
        assert_eq!(graph.roots().len(), 1);
        assert_eq!(graph.roots()[0], id_root);
        assert_eq!(graph.get_children(&id_root).unwrap().len(), 2);
        assert_eq!(graph.get_children(&id_b).unwrap().len(), 1);
    }
}
