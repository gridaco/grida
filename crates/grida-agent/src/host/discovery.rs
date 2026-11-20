//! Bind product tool search to the turn's already admitted catalog.

use super::host_tools::{HostTools, TurnTools};
use crate::skills::SkillListing;
use crate::tool_host::{
    CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityReply,
    ToolHost,
};
use agent_kit_core::inference::ToolOffer;
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{BindingId, BoxFuture, Error, ErrorKind, Result, ToolId};
use grida_agent_master::discovery::{Catalog, SkillSource, TOOL, ToolSource};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::Arc;

struct Search(Catalog);

pub(super) type Sources = BTreeMap<ToolId, (String, String)>;

pub(super) fn bind(
    owners: &[Arc<TurnTools>],
    skills: Option<&SkillListing>,
    turn: &TurnBinding,
    workbench_tools: bool,
    registered_sources: Option<&Sources>,
) -> Result<Option<(Catalog, Arc<TurnTools>)>> {
    let offers = owners
        .iter()
        .map(|owner| owner.desktop_discovery_offers())
        .collect::<Result<Vec<_>>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let skills = skills
        .into_iter()
        .flat_map(SkillListing::extension_skills)
        .map(|(name, description)| SkillSource {
            name: name.into(),
            description: description.into(),
        })
        .collect::<Vec<_>>();
    if offers.is_empty() && skills.is_empty() {
        return Ok(None);
    }
    let tools = match registered_sources {
        Some(sources) => registered_offers(offers, sources)?,
        None => legacy_offers(offers, workbench_tools),
    };
    let catalog = Catalog::new(tools, skills);
    let host = ToolHost::new([(
        CapabilityDefinition {
            tool: Catalog::definition()?,
            output_schema: json!({"type": "object"}),
            effect: CapabilityEffect::Read,
        },
        Arc::new(Search(catalog.clone())) as Arc<dyn CapabilityExecutor>,
    )])?;
    let lease = BindingId::new(format!("tool-search/{}", turn.turn))?;
    let owner = Arc::new(HostTools::local(host, lease, "grida-tool-search", &[TOOL])?);
    Ok(Some((catalog, owner.bind(turn)?)))
}

fn registered_offers(offers: Vec<ToolOffer>, sources: &Sources) -> Result<Vec<ToolSource>> {
    let mut groups = BTreeMap::new();
    for offer in offers {
        let (name, description) = sources
            .get(&offer.id)
            .ok_or_else(|| Error::new(ErrorKind::InvalidState, "missing_desktop_tool_source"))?;
        groups
            .entry(name)
            .or_insert_with(|| ToolSource {
                name: name.clone(),
                description: description.clone(),
                offers: Vec::new(),
            })
            .offers
            .push(offer);
    }
    Ok(groups.into_values().collect())
}

fn legacy_offers(offers: Vec<ToolOffer>, workbench_tools: bool) -> Vec<ToolSource> {
    let (browser, workbench) = offers.into_iter().partition::<Vec<_>, _>(|offer| {
        workbench_tools && offer.id.as_str().starts_with("browser_")
    });
    [
        ToolSource {
            name: "workbench".into(),
            description: if workbench_tools {
                "List and show tabs or files in the attached Desktop workbench and operate on eligible editor selections."
            } else {
                "Inspect the attached Desktop workbench and operate on its eligible files, selections, or pages."
            }
            .into(),
            offers: workbench,
        },
        ToolSource {
            name: "browser".into(),
            description: "Open background pages and inspect, navigate, or interact with an exact authorized web page.".into(),
            offers: browser,
        },
    ]
    .into_iter()
    .filter(|source| !source.offers.is_empty())
    .collect()
}

impl CapabilityExecutor for Search {
    fn validate(&self, arguments: &Value) -> Result<()> {
        Catalog::validate(arguments)
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            let outcome = self.0.search(&call.arguments);
            CapabilityReply {
                binding: call.binding,
                outcome,
            }
        })
    }
}
