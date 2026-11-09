//! Native Grida Agent composition and process adapters.

pub mod acp;
pub mod command;
pub mod configuration;
mod custody;
pub mod host;
mod http;

pub use http::{CompatibleOutputLimitField, ProviderOptions, ProviderProtocol};
