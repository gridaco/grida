//! JSON wire format for [`VectorNetwork`], used by the WASM
//! `_to_vector_network` export to return flattened shape geometry to JS.

use crate::vectornetwork::{VectorNetwork, VectorNetworkSegment};
use serde::{Deserialize, Serialize};

pub type JSONVectorNetworkVertex = (f32, f32);

#[derive(Debug, Deserialize, Serialize)]
pub struct JSONVectorNetworkSegment {
    pub a: usize,
    pub b: usize,
    #[serde(default)]
    pub ta: (f32, f32),
    #[serde(default)]
    pub tb: (f32, f32),
}

#[derive(Debug, Deserialize, Serialize)]
pub struct JSONVectorNetwork {
    #[serde(default)]
    pub vertices: Vec<JSONVectorNetworkVertex>,
    #[serde(default)]
    pub segments: Vec<JSONVectorNetworkSegment>,
}

impl From<JSONVectorNetwork> for VectorNetwork {
    fn from(network: JSONVectorNetwork) -> Self {
        VectorNetwork {
            vertices: network.vertices.into_iter().map(|v| (v.0, v.1)).collect(),
            segments: network
                .segments
                .into_iter()
                .map(|s| VectorNetworkSegment {
                    a: s.a,
                    b: s.b,
                    ta: s.ta,
                    tb: s.tb,
                })
                .collect(),
            regions: vec![],
        }
    }
}

impl From<&VectorNetwork> for JSONVectorNetwork {
    fn from(network: &VectorNetwork) -> Self {
        JSONVectorNetwork {
            vertices: network.vertices.iter().map(|v| (v.0, v.1)).collect(),
            segments: network
                .segments
                .iter()
                .map(|s| JSONVectorNetworkSegment {
                    a: s.a,
                    b: s.b,
                    ta: s.ta,
                    tb: s.tb,
                })
                .collect(),
        }
    }
}

impl From<VectorNetwork> for JSONVectorNetwork {
    fn from(network: VectorNetwork) -> Self {
        (&network).into()
    }
}

/// Result of flattening a shape to a vector network.
///
/// When `corner_radius` is `Some`, the vector network contains straight
/// segments and the corner radius should be applied as a rendering effect
/// (e.g. polygon, star). These shapes use `corner_path` PathEffect for
/// rendering, so the effect is preserved.
///
/// When `corner_radius` is `None`, the corner geometry is already baked
/// into the vector network as Bézier curves (e.g. rectangle, ellipse).
/// Rectangles always bake because their native rrect rendering uses conic
/// arcs, which differ from the `corner_path` PathEffect. See
/// [`crate::shape::build_corner_radius_path`] for details.
#[derive(Debug, Serialize)]
pub struct JSONFlattenResult {
    #[serde(flatten)]
    pub vector_network: JSONVectorNetwork,
    /// Uniform corner radius to apply as a rendering effect, if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f32>,
}
