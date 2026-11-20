//! Bounded selection from tool definitions and skill descriptions captured by the host.

use agent_kit_core::inference::{InputFormat, ToolOffer};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::{Error, ErrorKind, Result, ToolId};
use agent_kit_runtime::{InvokeOutcome, StepToolOutcome};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub const TOOL: &str = "tool_search";
const MAX_QUERY: usize = 256;
const MAX_RESULTS: usize = 5;
const MAX_SOURCE_DESCRIPTION: usize = 240;

/// A source with model-callable operations. Names and descriptions come from
/// trusted host registration. Tool descriptions remain attributed results.
#[derive(Clone, Serialize)]
pub struct ToolSource {
    pub name: String,
    pub description: String,
    pub offers: Vec<ToolOffer>,
}

#[derive(Clone, Serialize)]
pub struct SkillSource {
    pub name: String,
    pub description: String,
}

#[derive(Clone, Serialize)]
pub struct Catalog {
    tools: Vec<ToolSource>,
    skills: Vec<SkillSource>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Search {
    query: String,
    source: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Match {
    Extension {
        name: String,
        description: String,
    },
    Tool {
        source: String,
        name: ToolId,
        revision: u32,
        description: String,
    },
    Skill {
        name: String,
        description: String,
    },
}

#[derive(Deserialize, Serialize)]
struct Matches {
    matches: Vec<Match>,
}

impl Match {
    fn source(&self) -> &str {
        match self {
            Self::Tool { source, .. } => source,
            Self::Extension { name, .. } | Self::Skill { name, .. } => name,
        }
    }
}

impl Catalog {
    pub fn new(tools: Vec<ToolSource>, skills: Vec<SkillSource>) -> Self {
        Self { tools, skills }
    }

    pub fn definition() -> Result<ToolDefinition> {
        Ok(ToolDefinition {
            id: ToolId::new(TOOL)?,
            version: 1,
            description: "Find a Desktop extension for a task. If results list extensions, choose one and search again with its name in source. A selected extension or exact operation can return deferred tools for the next model request, or a skill to open with read_skill.".into(),
            input: InputFormat::Json(json!({
                "type": "object",
                "properties": {
                    "query": {"type": "string", "minLength": 1, "maxLength": MAX_QUERY},
                    "source": {"type": "string", "minLength": 1, "maxLength": 64}
                },
                "required": ["query"],
                "additionalProperties": false
            })),
            max_input_bytes: 2048,
            max_output_bytes: 8192,
            recovery: RecoveryKind::Unavailable,
        })
    }

    pub fn validate(arguments: &Value) -> Result<()> {
        Search::parse(arguments).map(|_| ())
    }

    pub fn search(&self, arguments: &Value) -> ToolOutcome {
        let request = match Search::parse(arguments) {
            Ok(request) => request,
            Err(error) => return ToolOutcome::failed(&error.code),
        };
        let query = words(&request.query);
        let mut matches = Vec::new();
        for source in &self.tools {
            if !request.includes(&source.name) {
                continue;
            }
            let source_score = score(&query, &[&source.name, &source.description]);
            for tool in &source.offers {
                let name = tool.id.as_str();
                let exact = request.matches_name(name);
                let relevance = named_score(&query, name, &tool.description).max(source_score);
                if exact || relevance > 0 {
                    matches.push((
                        (exact, relevance),
                        name,
                        Match::Tool {
                            source: source.name.clone(),
                            name: tool.id.clone(),
                            revision: tool.version,
                            description: tool
                                .description
                                .chars()
                                .take(MAX_SOURCE_DESCRIPTION)
                                .collect(),
                        },
                    ));
                }
            }
        }
        for skill in &self.skills {
            if request.includes(&skill.name) {
                let exact = request.matches_name(&skill.name);
                let relevance = named_score(&query, &skill.name, &skill.description);
                if exact || relevance > 0 {
                    matches.push((
                        (exact, relevance),
                        skill.name.as_str(),
                        Match::Skill {
                            name: skill.name.clone(),
                            description: skill
                                .description
                                .chars()
                                .take(MAX_SOURCE_DESCRIPTION)
                                .collect(),
                        },
                    ));
                }
            }
        }
        matches.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| left.1.cmp(right.1)));
        let exact = matches.first().is_some_and(|((exact, _), _, _)| *exact);
        if !exact && request.source.is_none() {
            let sources: BTreeSet<_> = matches.iter().map(|(_, _, entry)| entry.source()).collect();
            if sources.len() > 1 {
                let summaries = self.summaries();
                // Rank the extension summaries independently of operation
                // matches, so a large catalog cannot improve the source rank.
                let mut sources: Vec<_> = sources
                    .into_iter()
                    .map(|name| {
                        let description: String = summaries[name]
                            .chars()
                            .take(MAX_SOURCE_DESCRIPTION)
                            .collect();
                        let score = named_score(&query, name, &description);
                        (name, description, score)
                    })
                    .collect();
                sources.sort_by_key(|(name, _, score)| (std::cmp::Reverse(*score), *name));
                return outcome(
                    sources
                        .into_iter()
                        .take(MAX_RESULTS)
                        .map(|(name, description, _)| Match::Extension {
                            name: name.to_owned(),
                            description,
                        })
                        .collect(),
                );
            }
        }
        outcome(
            matches
                .into_iter()
                .take_while(|((matched, _), _, _)| *matched == exact)
                .take(MAX_RESULTS)
                .map(|(_, _, entry)| entry)
                .collect(),
        )
    }

    pub(crate) fn instructions(&self) -> String {
        let mut instructions = String::from(
            "Use tool_search to discover operations for the task. If the user names an available extension, search with its name in source. If the search lists extensions, choose the best match for the task and search again with its name in source. Wait for the next model request before calling a discovered tool. Call only tools offered on the current request, even if you know another tool's name. Use the named skill when its workflow is relevant.",
        );
        let summaries = self.summaries();
        if !summaries.is_empty() {
            instructions.push_str(" Available extensions:");
        }
        for (name, description) in summaries {
            let description: String = description.chars().take(MAX_SOURCE_DESCRIPTION).collect();
            instructions.push_str(&format!("\n- {name}: {description}"));
        }
        instructions
    }

    fn summaries(&self) -> BTreeMap<&str, &str> {
        self.skills
            .iter()
            .map(|source| (source.name.as_str(), source.description.as_str()))
            .chain(
                self.tools
                    .iter()
                    .map(|source| (source.name.as_str(), source.description.as_str())),
            )
            .collect()
    }

    pub(crate) fn deferred(&self, id: &ToolId) -> bool {
        self.tools
            .iter()
            .flat_map(|source| &source.offers)
            .any(|offer| &offer.id == id)
    }

    pub(crate) fn activate(&self, results: &[StepToolOutcome], active: &mut BTreeSet<ToolId>) {
        for result in results {
            if result.call.tool.as_str() != TOOL {
                continue;
            }
            let InvokeOutcome::Complete(outcome) = &result.outcome else {
                continue;
            };
            if outcome.status != OutcomeStatus::Succeeded {
                continue;
            }
            let Some(Matches { matches }) = outcome
                .structured
                .as_ref()
                .and_then(|value| Matches::deserialize(value).ok())
            else {
                continue;
            };
            for entry in matches {
                if let Match::Tool {
                    source,
                    name,
                    revision,
                    ..
                } = entry
                    && self.tools.iter().any(|catalog| {
                        catalog.name == source
                            && catalog
                                .offers
                                .iter()
                                .any(|offer| offer.id == name && offer.version == revision)
                    })
                {
                    active.insert(name);
                }
            }
        }
    }
}

fn outcome(matches: Vec<Match>) -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Succeeded,
        content: Vec::new(),
        structured: Some(json!(Matches { matches })),
        receipt: None,
        truncated: false,
    }
}

impl Search {
    fn parse(arguments: &Value) -> Result<Self> {
        let invalid = || Error::new(ErrorKind::InvalidInput, "tool_search_arguments_invalid");
        let search: Self = serde_json::from_value(arguments.clone()).map_err(|_| invalid())?;
        if search.query.trim().is_empty()
            || search.query.chars().count() > MAX_QUERY
            || search
                .source
                .as_ref()
                .is_some_and(|source| source.trim().is_empty() || source.chars().count() > 64)
        {
            return Err(invalid());
        }
        Ok(search)
    }

    fn includes(&self, name: &str) -> bool {
        self.source
            .as_deref()
            .is_none_or(|source| source.trim().eq_ignore_ascii_case(name))
    }

    fn matches_name(&self, name: &str) -> bool {
        self.query.trim().eq_ignore_ascii_case(name)
    }
}

fn words(text: &str) -> BTreeSet<String> {
    text.split(|value: char| !value.is_alphanumeric())
        .filter(|word| word.len() > 1)
        .map(str::to_lowercase)
        .filter(|word| {
            !matches!(
                word.as_str(),
                "the" | "and" | "to" | "in" | "of" | "for" | "an"
            )
        })
        .map(|word| match word.as_str() {
            "screenshot" | "screenshots" => "capture".into(),
            _ => word,
        })
        .collect()
}

fn named_score(query: &BTreeSet<String>, name: &str, description: &str) -> usize {
    2 * score(query, &[name]) + score(query, &[description])
}

fn score(query: &BTreeSet<String>, fields: &[&str]) -> usize {
    let terms: BTreeSet<_> = fields.iter().flat_map(|text| words(text)).collect();
    terms.intersection(query).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offer(name: &str, description: &str) -> ToolOffer {
        let mut tool = Catalog::definition().unwrap();
        tool.id = ToolId::new(name).unwrap();
        tool.version = 2;
        tool.description = description.into();
        tool.offer().unwrap()
    }

    fn catalog() -> Catalog {
        Catalog::new(
            vec![ToolSource {
                name: "workbench".into(),
                description: "Inspect open workbench tabs.".into(),
                offers: vec![offer(
                    "surface_list_open",
                    "Read the active file and open files.",
                )],
            }],
            vec![SkillSource {
                name: "desktop-fx".into(),
                description: "Plan and run FX workflows.".into(),
            }],
        )
    }

    #[test]
    fn initial_extension_summaries_share_order_and_budget() {
        let catalog = Catalog::new(
            vec![ToolSource {
                name: "browser".into(),
                description: "Inspect pages.".into(),
                offers: vec![offer("browser_snapshot", "Read the loaded page.")],
            }],
            vec![
                SkillSource {
                    name: "desktop-fx".into(),
                    description: "界".repeat(MAX_SOURCE_DESCRIPTION + 1),
                },
                SkillSource {
                    name: "browser".into(),
                    description: "Read browser workflow instructions.".into(),
                },
            ],
        );
        let instructions = catalog.instructions();
        assert_eq!(
            instructions.lines().skip(1).collect::<Vec<_>>(),
            [
                "- browser: Inspect pages.".to_owned(),
                format!("- desktop-fx: {}", "界".repeat(MAX_SOURCE_DESCRIPTION)),
            ]
        );
        assert!(!instructions.contains("browser_snapshot"));
    }

    #[test]
    fn chooses_a_source_before_revealing_its_operations_or_skill() {
        for count in [1, 12] {
            let catalog = Catalog::new(
                vec![ToolSource {
                    name: "zeta".into(),
                    description: "Inspect status.".into(),
                    offers: (0..count)
                        .map(|index| offer(&format!("inspect_status_{index}"), "Inspect status."))
                        .collect(),
                }],
                vec![SkillSource {
                    name: "alpha".into(),
                    description: "Inspect status.".into(),
                }],
            );
            let outcome = catalog.search(&json!({"query": "inspect status"}));
            let outcome = outcome.structured.unwrap();
            assert_eq!(outcome["matches"][0]["kind"], "extension");
            assert_eq!(outcome["matches"][0]["name"], "alpha");
            assert_eq!(outcome["matches"][1]["kind"], "extension");
            assert_eq!(outcome["matches"][1]["name"], "zeta");
            let tool = catalog.search(&json!({"query": "inspect status", "source": "zeta"}));
            assert_eq!(tool.structured.unwrap()["matches"][0]["kind"], "tool");
            let skill = catalog.search(&json!({"query": "inspect status", "source": "alpha"}));
            assert_eq!(skill.structured.unwrap()["matches"][0]["kind"], "skill");
        }
    }

    #[test]
    fn searches_tool_and_skill_sources_without_inventing_a_skill_tool() {
        let catalog = catalog();
        let inventory = catalog.search(&json!({"query": "list open workbench tabs"}));
        assert_eq!(
            inventory.structured.unwrap()["matches"][0]["name"],
            "surface_list_open"
        );
        let fx = catalog.search(&json!({"query": "plan FX workflow"}));
        assert_eq!(
            fx.structured.unwrap()["matches"],
            json!([{"kind":"skill","name":"desktop-fx","description":"Plan and run FX workflows."}])
        );
        let scoped = catalog.search(&json!({"query": "workbench", "source": "desktop-fx"}));
        assert_eq!(scoped.structured.unwrap()["matches"], json!([]));
        assert!(Catalog::validate(&json!({"query": "x".repeat(MAX_QUERY + 1)})).is_err());
    }

    #[test]
    fn an_exact_name_only_activates_that_definition() {
        let catalog = Catalog::new(
            vec![ToolSource {
                name: "workbench".into(),
                description: "Inspect pages and files.".into(),
                offers: vec![
                    offer(
                        "browser_action",
                        "Use the document ID from browser_snapshot.",
                    ),
                    offer("browser_snapshot", "Read the page's current document."),
                ],
            }],
            vec![],
        );
        let result = catalog.search(&json!({
            "query": " BROWSER_SNAPSHOT ", "source": " Workbench "
        }));
        let structured = result.structured.unwrap();
        let matches = structured["matches"].as_array().unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0]["name"], "browser_snapshot");
    }

    #[test]
    fn ordinary_screenshot_wording_finds_browser_capture() {
        let catalog = Catalog::new(
            vec![ToolSource {
                name: "workbench".into(),
                description: "Inspect pages and files.".into(),
                offers: vec![
                    offer(
                        "browser_action",
                        "Use the document ID from browser_snapshot.",
                    ),
                    offer("browser_capture", "Return bounded pixels for the page."),
                    offer(
                        "browser_snapshot",
                        "Capture the page structure and element IDs.",
                    ),
                ],
            }],
            vec![],
        );
        let result = catalog.search(&json!({"query": "Take a screenshot"}));
        assert_eq!(
            result.structured.unwrap()["matches"][0]["name"],
            "browser_capture"
        );
    }
}
