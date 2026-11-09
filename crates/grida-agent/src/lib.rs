//! Native Grida Agent composition and process adapters.

pub mod acp;
pub mod configuration;
mod custody;
pub mod host;
mod http;

pub use http::{ProviderOptions, ProviderProtocol};
