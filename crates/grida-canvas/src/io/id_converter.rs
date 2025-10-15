use crate::io::io_grida::*;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::*;
use std::collections::HashMap;

/// Converts a JSON canvas file with string IDs into a Scene with internal u64 IDs.
/// Maintains a bidirectional mapping between user-provided string IDs and internal u64 IDs.
pub struct IdConverter {
    id_generator: NodeIdGenerator,
    /// Maps user string IDs to internal u64 IDs
    pub string_to_internal: HashMap<String, NodeId>,
    /// Maps internal u64 IDs to user string IDs
    pub internal_to_string: HashMap<NodeId, String>,
}

impl IdConverter {
    pub fn new() -> Self {
        Self {
            id_generator: NodeIdGenerator::new(),
            string_to_internal: HashMap::new(),
            internal_to_string: HashMap::new(),
        }
    }

    /// Get or create an internal ID for a string ID
    fn get_or_create_internal_id(&mut self, string_id: &str) -> NodeId {
        if let Some(&internal_id) = self.string_to_internal.get(string_id) {
            return internal_id;
        }

        let internal_id = self.id_generator.next();
        self.string_to_internal
            .insert(string_id.to_string(), internal_id);
        self.internal_to_string
            .insert(internal_id, string_id.to_string());
        internal_id
    }

    /// Get internal ID for a string ID if it exists
    pub fn get_internal_id(&self, string_id: &str) -> Option<NodeId> {
        self.string_to_internal.get(string_id).copied()
    }

    /// Get string ID for an internal ID if it exists
    pub fn get_string_id(&self, internal_id: NodeId) -> Option<&str> {
        self.internal_to_string
            .get(&internal_id)
            .map(|s| s.as_str())
    }

    /// Convert a JSONNode into a Node with proper internal ID
    pub fn convert_node(&mut self, string_id: &str, json_node: JSONNode) -> Node {
        let internal_id = self.get_or_create_internal_id(string_id);
        Self::convert_json_node_with_id(json_node, internal_id)
    }

    /// Convert a complete JSON canvas file into a Scene
    pub fn convert_json_canvas_file(&mut self, file: JSONCanvasFile) -> Result<Scene, String> {
        let links = file.document.links;

        // Determine scene_id
        let scene_id = file
            .document
            .entry_scene_id
            .or_else(|| file.document.scenes_ref.first().cloned())
            .unwrap_or_else(|| "scene".to_string());

        // Extract scene metadata from SceneNode
        let (scene_name, bg_color) =
            if let Some(JSONNode::Scene(scene_node)) = file.document.nodes.get(&scene_id) {
                (
                    scene_node.name.clone(),
                    scene_node.background_color.clone().map(Into::into),
                )
            } else {
                (scene_id.clone(), None)
            };

        // Get scene children string IDs from links
        let scene_children_strings = links
            .get(&scene_id)
            .and_then(|c| c.clone())
            .unwrap_or_default();

        // Convert all nodes (skip scene nodes)
        let nodes: Vec<Node> = file
            .document
            .nodes
            .into_iter()
            .filter(|(_, json_node)| !matches!(json_node, JSONNode::Scene(_)))
            .map(|(string_id, json_node)| self.convert_node(&string_id, json_node))
            .collect();

        // Convert links from string IDs to internal IDs
        let internal_links: HashMap<NodeId, Vec<NodeId>> = links
            .into_iter()
            .filter_map(|(parent_string, children_opt)| {
                children_opt.and_then(|children_strings| {
                    // Get internal ID for parent
                    let parent_internal = self.get_internal_id(&parent_string)?;

                    // Convert all children string IDs to internal IDs
                    let children_internal: Vec<NodeId> = children_strings
                        .iter()
                        .filter_map(|child_string| self.get_internal_id(child_string))
                        .collect();

                    if children_internal.is_empty() {
                        None
                    } else {
                        Some((parent_internal, children_internal))
                    }
                })
            })
            .collect();

        // Convert scene children from string IDs to internal IDs
        let scene_children_internal: Vec<NodeId> = scene_children_strings
            .iter()
            .filter_map(|s| self.get_internal_id(s))
            .collect();

        // Build scene graph from snapshot
        let graph = SceneGraph::new_from_snapshot(nodes, internal_links, scene_children_internal);

        Ok(Scene {
            name: scene_name,
            graph,
            background_color: bg_color,
        })
    }

    /// Helper to convert a JSON node with a specific internal ID
    fn convert_json_node_with_id(json_node: JSONNode, internal_id: NodeId) -> Node {
        match json_node {
            JSONNode::Group(mut group) => {
                group.base.id = String::new(); // temp placeholder
                let mut rec = GroupNodeRec::from(group);
                rec.id = internal_id;
                Node::Group(rec)
            }
            JSONNode::Container(mut container) => {
                container.base.id = String::new();
                let mut rec = ContainerNodeRec::from(container);
                rec.id = internal_id;
                Node::Container(rec)
            }
            JSONNode::SVGPath(mut path) => {
                path.base.id = String::new();
                let mut node = Node::from(JSONNode::SVGPath(path));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::Path(mut path) => {
                path.base.id = String::new();
                let mut node = Node::from(JSONNode::Path(path));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::Ellipse(mut ellipse) => {
                ellipse.base.id = String::new();
                let mut node = Node::from(JSONNode::Ellipse(ellipse));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::Rectangle(mut rectangle) => {
                rectangle.base.id = String::new();
                let mut node = Node::from(JSONNode::Rectangle(rectangle));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::RegularPolygon(mut polygon) => {
                polygon.base.id = String::new();
                let mut node = Node::from(JSONNode::RegularPolygon(polygon));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::RegularStarPolygon(mut star) => {
                star.base.id = String::new();
                let mut node = Node::from(JSONNode::RegularStarPolygon(star));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::Line(mut line) => {
                line.base.id = String::new();
                let mut node = Node::from(JSONNode::Line(line));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::Text(mut text) => {
                text.base.id = String::new();
                let mut rec = TextSpanNodeRec::from(text);
                rec.id = internal_id;
                Node::TextSpan(rec)
            }
            JSONNode::BooleanOperation(mut bool_op) => {
                bool_op.base.id = String::new();
                let mut node = Node::from(JSONNode::BooleanOperation(bool_op));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::Image(mut image) => {
                image.base.id = String::new();
                let mut node = Node::from(JSONNode::Image(image));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::Unknown(mut unknown) => {
                unknown.id = String::new();
                let mut node = Node::from(JSONNode::Unknown(unknown));
                Self::set_node_id(&mut node, internal_id);
                node
            }
            JSONNode::Scene(_) => {
                // Scene nodes should not be converted to regular nodes
                panic!("Scene nodes should be filtered out before conversion")
            }
        }
    }

    /// Helper to set the internal ID on a Node
    fn set_node_id(node: &mut Node, id: NodeId) {
        match node {
            Node::Error(n) => n.id = id,
            Node::Group(n) => n.id = id,
            Node::Container(n) => n.id = id,
            Node::Rectangle(n) => n.id = id,
            Node::Ellipse(n) => n.id = id,
            Node::Polygon(n) => n.id = id,
            Node::RegularPolygon(n) => n.id = id,
            Node::RegularStarPolygon(n) => n.id = id,
            Node::Line(n) => n.id = id,
            Node::TextSpan(n) => n.id = id,
            Node::SVGPath(n) => n.id = id,
            Node::Vector(n) => n.id = id,
            Node::BooleanOperation(n) => n.id = id,
            Node::Image(n) => n.id = id,
        }
    }
}

impl Default for IdConverter {
    fn default() -> Self {
        Self::new()
    }
}
