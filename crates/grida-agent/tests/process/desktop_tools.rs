//! GRIDA-SEC-004 — exercise the built native caller of the Desktop catalog.

use super::approvals::Stdio as StdioClient;
use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};

const CAPABILITY: &str = "co.grida/session/desktop-tools";
const TOOL_CONTEXT: &str = "co.grida/session/editor-tool-context";
const METHOD: &str = "_co.grida/editor/desktop-tools";
const LEGACY_READ: &str = "_co.grida/editor/surface-list-open";
const BROWSER: &str = "co.grida/session/browser-tools";
const BROWSER_METHOD: &str = "_co.grida/editor/browser-tool";
const ENDPOINT: &str = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const TOOL: &str = "surface_list_open";
const TABS: &str = "workbench_list_tabs";
const SHOW: &str = "workbench_show";
const CLOSE_BROWSER_TAB: &str = "workbench_close_browser_tab";
const SVG_TARGET: &str = "8207d29d-23ba-4ac8-9825-abf4e2ba7e04";
const SVG_REPLACE: &str = "svg_replace_selected_text";
const SELECTION_CONTEXT: &str = "af787f84-9ccf-4744-90ee-13231e26ff1b";
const SVG_INSPECT: &str = "svg_inspect_selection";
const DATA: &str = "/poster.svg";

#[derive(Clone, Copy, PartialEq, Eq)]
enum Peer {
    Desktop,
    Reloaded,
    Unavailable,
    Legacy,
    Presentation,
    Svg,
    SvgLost,
    Selection,
    SelectionStale,
    SelectionUnavailable,
    Browser,
    BrowserClose,
    BrowserSvg,
}

impl Peer {
    fn has_selection(self) -> bool {
        matches!(
            self,
            Self::Selection | Self::SelectionStale | Self::SelectionUnavailable
        )
    }
}

#[tokio::test]
async fn private_desktop_inventory_is_captured_and_invoked_through_mcp() {
    check(Peer::Desktop, "submit").await;
}

#[tokio::test]
async fn queued_inventory_keeps_its_original_endpoint_after_reload() {
    check(Peer::Reloaded, "enqueue").await;
}

#[tokio::test]
async fn a_negotiated_but_unavailable_catalog_does_not_enable_legacy_inventory() {
    check(Peer::Unavailable, "submit").await;
}

#[tokio::test]
async fn an_older_supervisor_keeps_its_legacy_inventory_method() {
    check(Peer::Legacy, "submit").await;
}

#[tokio::test]
async fn unconfirmed_private_presentation_keeps_its_trusted_continuation() {
    check(Peer::Presentation, "submit").await;
}

#[tokio::test]
async fn private_svg_edit_preserves_its_captured_target_and_unsaved_result() {
    check(Peer::Svg, "enqueue").await;
}

#[tokio::test]
async fn private_svg_edit_with_lost_reply_stays_uncertain_without_repeating() {
    check(Peer::SvgLost, "submit").await;
}

#[tokio::test]
async fn a_captured_editor_selection_discovers_its_tool_through_the_generic_catalog() {
    check(Peer::Selection, "submit").await;
}

#[tokio::test]
async fn a_queued_editor_selection_keeps_its_stale_target() {
    check(Peer::SelectionStale, "enqueue").await;
}

#[tokio::test]
async fn missing_editor_selection_does_not_hide_the_workbench_inventory() {
    check(Peer::SelectionUnavailable, "enqueue").await;
}

#[tokio::test]
async fn browser_workbench_defers_the_existing_targeted_surface_schema() {
    check(Peer::Browser, "submit").await;
}

#[tokio::test]
async fn closing_a_visible_browser_tab_uses_the_workbench_tool() {
    check(Peer::BrowserClose, "submit").await;
}

#[tokio::test]
async fn browser_workbench_uses_the_private_catalog_for_scoped_svg() {
    check(Peer::BrowserSvg, "submit").await;
}

#[tokio::test]
async fn private_catalog_registers_new_read_and_mutation_without_native_routes() {
    const ADD: &str = "fixture_counter_add";
    const READ: &str = "fixture_counter_read";
    const RETIRED: &str = "fixture_counter_retired";
    const ADD_INPUT: &str = r#"{"amount":4}"#;
    let state = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let (mut client, session) = start(&state, &workspace, Peer::Desktop).await;
    let request = client
        .send(
            "_co.grida/session/submit",
            json!({"sessionId":session,"inputId":"counter-check","operatingRegime":"act",
                "editorEndpointId":ENDPOINT,"prompt":[{"type":"text","text":"Add four and read the counter."}]}),
        )
        .await;
    let add_schema = json!({"type":"object","properties":{"amount":{"type":"integer","minimum":1,"maximum":9}},
        "required":["amount"],"additionalProperties":false});
    let empty_schema = json!({"type":"object","additionalProperties":false});
    let definitions = [
        (
            ADD,
            "Add an amount to the fixture counter.",
            &add_schema,
            false,
            7,
        ),
        (READ, "Read the fixture counter.", &empty_schema, true, 3),
        (
            RETIRED,
            "Read a retired fixture counter.",
            &empty_schema,
            true,
            5,
        ),
    ];
    let mut accepted = false;
    let mut listed = false;
    let mut inference = 0;
    let mut chunk = None;
    let mut count = 7;
    let mut calls = Vec::new();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == request {
            assert!(frame["result"].is_object(), "{frame}");
            assert!(listed, "accepted without capturing the counter definitions");
            accepted = true;
        }
        let params = &frame["params"];
        match frame["method"].as_str() {
            Some(METHOD) => {
                assert_eq!(params["sessionId"], session);
                assert_eq!(params["endpointId"], ENDPOINT);
                let message = &params["message"];
                let id = &message["id"];
                let reply = match message["method"].as_str() {
                    Some("tools/list") => {
                        assert!(!listed && !accepted, "unexpected catalog refresh: {frame}");
                        listed = true;
                        let tools: Vec<_> = definitions
                            .iter()
                            .map(|(name, description, schema, read_only, revision)| {
                                json!({"name":name,"description":description,"inputSchema":schema,
                                    "outputSchema":{"type":"object","properties":{"count":{"type":"integer"}},
                                        "required":["count"],"additionalProperties":false},
                                    "annotations":{"readOnlyHint":read_only},
                                    "_meta":{"co.grida/definitionRevision":revision}})
                            })
                            .collect();
                        json!({"jsonrpc":"2.0","id":id,"result":{"resultType":"complete","tools":tools}})
                    }
                    Some("tools/call") => {
                        let (name, _, _, _, revision) = definitions[calls.len()];
                        assert_eq!(inference, calls.len() + 2, "unexpected dispatch: {frame}");
                        assert_eq!(message["params"]["name"], name);
                        assert_eq!(
                            message["params"]["_meta"]["co.grida/definitionRevision"],
                            revision
                        );
                        let arguments = &message["params"]["arguments"];
                        if name == ADD {
                            assert_eq!(*arguments, json!({"amount":4}));
                            count += arguments["amount"].as_u64().unwrap();
                        } else {
                            assert_eq!(*arguments, json!({}));
                        }
                        calls.push(name);
                        if name == RETIRED {
                            unavailable(id)
                        } else {
                            json!({"jsonrpc":"2.0","id":id,"result":{"resultType":"complete",
                                "isError":false,"content":[],"structuredContent":{"count":count}}})
                        }
                    }
                    _ => panic!("unexpected MCP request: {frame}"),
                };
                client
                    .respond(
                        &frame["id"],
                        json!({"sessionId":session,"endpointId":ENDPOINT,"message":reply}),
                    )
                    .await;
            }
            Some("_co.grida/provider/exchange") => {
                let result = match params["action"].as_str() {
                    Some("open") => {
                        let body = provider_body(params);
                        let reply = match inference {
                            0 => {
                                assert!(offered_tool(&body, "tool_search").is_some());
                                for (name, _, _, _, _) in definitions {
                                    assert!(offered_tool(&body, name).is_none(), "{body}");
                                }
                                Reply::Tool(
                                    "tool_search",
                                    r#"{"query":"fixture counter","source":"workbench"}"#,
                                )
                            }
                            1 => {
                                for (name, description, schema, _, _) in definitions {
                                    let offer = offered_tool(&body, name)
                                        .expect("expected discovered counter tool");
                                    assert_eq!(offer["description"], description);
                                    assert_eq!(&offer["parameters"], schema);
                                }
                                Reply::Tool(ADD, ADD_INPUT)
                            }
                            2 => {
                                assert_counter(tool_outcome(&body, ADD));
                                Reply::Tool(READ, "{}")
                            }
                            3 => {
                                assert_counter(tool_outcome(&body, READ));
                                Reply::Tool(RETIRED, "{}")
                            }
                            4 => {
                                let outcome = tool_outcome(&body, RETIRED);
                                assert_eq!(outcome["status"], "failed");
                                assert!(
                                    outcome
                                        .to_string()
                                        .contains("editor_surface_endpoint_unavailable")
                                );
                                Reply::Finished("The counter is eleven.")
                            }
                            _ => panic!("unexpected inference: {body}"),
                        };
                        inference += 1;
                        chunk =
                            Some(STANDARD.encode(fixture_body(reply, ProviderProtocol::Responses)));
                        json!({"status":"accepted"})
                    }
                    Some("dispatch") => json!({"status":"ready","httpStatus":200}),
                    Some("read") => match chunk.take() {
                        Some(data) => json!({"status":"chunk","data":data}),
                        None => json!({"status":"end"}),
                    },
                    _ => panic!("unexpected provider exchange: {frame}"),
                };
                client.respond(&frame["id"], result).await;
            }
            Some("_co.grida/provider/cancel") if inference == 5 && accepted => break,
            Some(method) if method.starts_with("_co.grida/editor/") => {
                panic!("unexpected fallback: {frame}");
            }
            _ => {}
        }
    }
    assert_eq!(calls, [ADD, READ, RETIRED]);
    assert_eq!(count, 11);
    client.close().await;
}

fn assert_counter(outcome: Value) {
    assert_eq!(outcome["status"], "succeeded");
    assert_eq!(outcome["structured"], json!({"count":11}));
}

async fn start(state: &TempDir, workspace: &TempDir, peer: Peer) -> (StdioClient, String) {
    let mut command = executable();
    command.args([
        "serve",
        "--stdio",
        "--supervised-provider",
        "--provider",
        "responses",
    ]);
    configured(
        &mut command,
        &state.path().canonicalize().unwrap().join("state"),
        "http://127.0.0.1:43172/v1",
    );
    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = StdioClient::from_child(child);
    let mut initialize = extension_initialize();
    initialize["clientCapabilities"]["_meta"]["co.grida/provider/egress"] = 1.into();
    initialize["clientCapabilities"]["_meta"]["co.grida/session/editor-surfaces"] = 1.into();
    if peer != Peer::Legacy {
        initialize["clientCapabilities"]["_meta"][CAPABILITY] = 1.into();
    }
    if peer.has_selection() || peer == Peer::Legacy {
        initialize["clientCapabilities"]["_meta"][TOOL_CONTEXT] = 1.into();
    }
    let presentation = peer == Peer::Presentation;
    let svg = matches!(peer, Peer::Svg | Peer::SvgLost | Peer::BrowserSvg);
    let browser = matches!(peer, Peer::Browser | Peer::BrowserClose | Peer::BrowserSvg);
    if presentation {
        initialize["clientCapabilities"]["_meta"]["co.grida/session/editor-surface-open"] =
            1.into();
    }
    if svg {
        initialize["clientCapabilities"]["_meta"]["co.grida/session/editor-svg-text"] = 1.into();
    }
    if browser {
        initialize["clientCapabilities"]["_meta"][BROWSER] = 1.into();
    }
    let ready = client.request("initialize", initialize).await;
    let capabilities = &ready["result"]["agentCapabilities"]["_meta"];
    assert_eq!(
        capabilities["co.grida/session/editor-surfaces"], 1,
        "{ready}"
    );
    assert_eq!(
        capabilities[CAPABILITY].as_u64(),
        (peer != Peer::Legacy).then_some(1)
    );
    assert_eq!(
        capabilities[TOOL_CONTEXT].as_u64(),
        peer.has_selection().then_some(1)
    );
    let created = client
        .request(
            "session/new",
            json!({"cwd": workspace.path().canonicalize().unwrap(), "mcpServers": []}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
    (client, session)
}

async fn check(peer: Peer, admission: &str) {
    let state = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let (mut client, session) = start(&state, &workspace, peer).await;
    let presentation = peer == Peer::Presentation;
    let svg = matches!(peer, Peer::Svg | Peer::SvgLost | Peer::BrowserSvg);
    let browser = matches!(peer, Peer::Browser | Peer::BrowserClose | Peer::BrowserSvg);
    let mut prompt = json!({
        "sessionId": session,
        "inputId": "workspace-operation",
        "prompt": [{"type": "text", "text": "Use the authorized workbench capability."}],
        "editorEndpointId": ENDPOINT,
        "operatingRegime": "act"
    });
    if presentation {
        prompt["editorPresentation"] = true.into();
    }
    if svg {
        prompt["editorSvgTargetId"] = SVG_TARGET.into();
    }
    if browser {
        prompt["editorBrowserTools"] = true.into();
    }
    if peer.has_selection() {
        prompt["editorToolContextId"] = SELECTION_CONTEXT.into();
    } else if matches!(peer, Peer::Desktop | Peer::Legacy) {
        let mut unnegotiated = prompt.clone();
        unnegotiated["editorToolContextId"] = SELECTION_CONTEXT.into();
        let rejected = client
            .request("_co.grida/session/submit", unnegotiated)
            .await;
        assert_eq!(rejected["error"]["code"], -32601, "{rejected}");
    }
    let request = client
        .send(&format!("_co.grida/session/{admission}"), prompt)
        .await;

    let mut accepted = false;
    let mut calls = 0;
    let mut listed = 0;
    let mut chunk = None;
    let mut searched = false;
    let mut offered = false;
    let mut final_request = false;
    let mut completed = false;
    let (wire_name, wire_args, expected_scope, structured) = match peer {
        Peer::Presentation => (
            "surface_open",
            r#"{"path":"/poster.svg"}"#,
            json!({"presentation": true}),
            Value::Null,
        ),
        Peer::Svg | Peer::SvgLost | Peer::BrowserSvg => (
            SVG_REPLACE,
            r#"{"revision":"8207d29d-23ba-4ac8-9825-abf4e2ba7e04","text":"Revised title"}"#,
            json!({"svgTargetId":SVG_TARGET}),
            json!({"kind":"applied","path":DATA,"saved":false}),
        ),
        Peer::Selection | Peer::SelectionStale => (
            SVG_INSPECT,
            "{}",
            json!({"contextId":SELECTION_CONTEXT}),
            json!({"path":DATA,"entries":[{"kind":"element","path":[0]}]}),
        ),
        Peer::SelectionUnavailable => (
            TOOL,
            "{}",
            json!({"contextId":SELECTION_CONTEXT}),
            json!({"interactive": true, "active": DATA, "open": [DATA], "truncated": false}),
        ),
        Peer::Browser => (
            "surface_open",
            r#"{"target":{"kind":"tab","tabId":"fixture-tab"}}"#,
            Value::Null,
            json!({"disposition":"dispatched_verified","tabId":"fixture-tab"}),
        ),
        Peer::BrowserClose => (
            "browser_close",
            r#"{"target":{"kind":"workbench","tabId":"fixture-tab"}}"#,
            Value::Null,
            json!({"disposition":"dispatched_verified","tabId":"fixture-tab"}),
        ),
        _ => (
            TOOL,
            "{}",
            Value::Null,
            json!({"interactive": true, "active": DATA, "open": [DATA], "truncated": false}),
        ),
    };
    let (name, query, args) = match peer {
        Peer::Presentation => (
            SHOW,
            r#"{"query":"workbench_show"}"#,
            r#"{"target":{"kind":"file","path":"/poster.svg"}}"#,
        ),
        Peer::Browser => (
            SHOW,
            r#"{"query":"workbench_show","source":"workbench"}"#,
            wire_args,
        ),
        Peer::BrowserClose => (
            CLOSE_BROWSER_TAB,
            r#"{"query":"workbench_close_browser_tab","source":"workbench"}"#,
            r#"{"tabId":"fixture-tab"}"#,
        ),
        Peer::Desktop | Peer::Reloaded | Peer::Unavailable | Peer::SelectionUnavailable => {
            (TABS, r#"{"query":"workbench_list_tabs"}"#, wire_args)
        }
        Peer::Svg | Peer::SvgLost | Peer::BrowserSvg => (
            wire_name,
            r#"{"query":"svg_replace_selected_text"}"#,
            wire_args,
        ),
        Peer::Selection | Peer::SelectionStale => {
            (wire_name, r#"{"query":"svg_inspect_selection"}"#, wire_args)
        }
        Peer::Legacy => (wire_name, "{}", wire_args),
    };
    while !accepted || !completed {
        let frame = client.read_frame().await;
        if frame["id"] == request {
            assert!(frame["result"].is_object(), "{frame}");
            accepted = true;
        }
        let params = &frame["params"];
        match frame["method"].as_str() {
            Some(METHOD) => {
                assert!(peer != Peer::Legacy, "legacy peer received MCP: {frame}");
                assert_eq!(params["sessionId"], session);
                assert_eq!(params["endpointId"], ENDPOINT);
                assert_eq!(params["scope"], expected_scope);
                assert!(
                    params["timeoutMs"]
                        .as_u64()
                        .is_some_and(|ms| (1..=2000).contains(&ms))
                );
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                assert!(
                    params["expiresAtMs"]
                        .as_u64()
                        .is_some_and(|expires| expires > 0 && expires <= now_ms + 2_000)
                );
                let message = &params["message"];
                let id = &message["id"];
                assert!(
                    id.as_str()
                        .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
                );
                assert_eq!(
                    message["params"]["_meta"]["io.modelcontextprotocol/protocolVersion"],
                    "2026-07-28"
                );
                let reply = match message["method"].as_str() {
                    Some("tools/list") => {
                        assert!(!accepted, "discovery occurred after durable acceptance");
                        listed += 1;
                        if peer == Peer::Unavailable {
                            unavailable(id)
                        } else {
                            let mut tools = if peer == Peer::BrowserClose {
                                Vec::new()
                            } else {
                                vec![descriptor(wire_name)]
                            };
                            if browser {
                                tools.push(descriptor(TOOL));
                            }
                            json!({"jsonrpc":"2.0","id":id,"result":{"resultType":"complete","tools":tools}})
                        }
                    }
                    Some("tools/call") => {
                        assert!(offered, "a call without an offered definition reached Main");
                        assert!(
                            !matches!(peer, Peer::Browser | Peer::BrowserClose),
                            "the v2 surface replaced the browser-aware binding"
                        );
                        assert_eq!(message["params"]["name"], wire_name);
                        assert_eq!(
                            message["params"]["arguments"],
                            serde_json::from_str::<Value>(wire_args).unwrap()
                        );
                        assert_eq!(
                            message["params"]["_meta"]["co.grida/definitionRevision"],
                            if svg || wire_name == SVG_INSPECT {
                                1
                            } else {
                                2
                            }
                        );
                        calls += 1;
                        match peer {
                            Peer::Reloaded => unavailable(id),
                            Peer::SelectionStale => json!({"jsonrpc":"2.0","id":id,"result":{
                                "resultType":"complete","isError":true,"content":[{"type":"text","text":"svg_selection_stale"}]
                            }}),
                            Peer::Presentation | Peer::SvgLost => {
                                completed = peer == Peer::SvgLost;
                                json!({"jsonrpc":"2.0","id":"unverified","result":{"resultType":"complete","isError":false,"content":[]}})
                            }
                            _ => {
                                json!({"jsonrpc":"2.0","id":id,"result":{"resultType":"complete","isError":false,"content":[],"structuredContent":structured}})
                            }
                        }
                    }
                    _ => panic!("unexpected MCP request: {frame}"),
                };
                client
                    .respond(
                        &frame["id"],
                        json!({"sessionId":session,"endpointId":ENDPOINT,"message":reply}),
                    )
                    .await;
            }
            Some(LEGACY_READ) => {
                assert!(
                    peer == Peer::Legacy,
                    "negotiated MCP must not fall back: {frame}"
                );
                assert_eq!(params["sessionId"], session);
                assert_eq!(params["endpointId"], ENDPOINT);
                calls += 1;
                client
                    .respond(
                        &frame["id"],
                        json!({"sessionId":session,"endpointId":ENDPOINT,
                    "available": true,"active":DATA,"open":[DATA],"truncated":false}),
                    )
                    .await;
            }
            Some(BROWSER_METHOD) => {
                assert!(
                    matches!(peer, Peer::Browser | Peer::BrowserClose) && offered,
                    "unexpected browser call: {frame}"
                );
                assert_eq!(params["sessionId"], session);
                assert_eq!(params["endpointId"], ENDPOINT);
                assert_eq!(params["operation"], wire_name);
                assert_eq!(
                    params["arguments"],
                    serde_json::from_str::<Value>(wire_args).unwrap()
                );
                calls += 1;
                client.respond(&frame["id"], json!({"sessionId":session,"endpointId":ENDPOINT,
                    "callId":params["callId"],"result":{"disposition":"dispatched_verified","data":{"tabId":"fixture-tab"}}})).await;
            }
            Some("_co.grida/provider/exchange") => {
                let result = match params["action"].as_str() {
                    Some("open") => {
                        let body = provider_body(params);
                        let tool = |name| offered_tool(&body, name);
                        if peer.has_selection() {
                            assert!(!body.to_string().contains(SELECTION_CONTEXT));
                            assert!(tool(SVG_REPLACE).is_none());
                        }
                        if peer == Peer::SelectionUnavailable {
                            assert!(tool(SVG_INSPECT).is_none());
                        }
                        let reply = if peer == Peer::Unavailable {
                            assert!(
                                tool(name).is_none() && tool(wire_name).is_none(),
                                "unavailable catalog exposed a legacy tool"
                            );
                            final_request = true;
                            Reply::Finished("The workbench is unavailable.")
                        } else if peer != Peer::Legacy && !searched {
                            assert!(
                                tool("tool_search").is_some(),
                                "private catalog search was unavailable"
                            );
                            assert!(
                                tool(name).is_none(),
                                "private tool schema disclosed before search"
                            );
                            searched = true;
                            Reply::Tool("tool_search", query)
                        } else if !offered {
                            assert!(
                                tool(name).is_some(),
                                "the tool never entered the model request: {body}"
                            );
                            if matches!(peer, Peer::Browser | Peer::Presentation) {
                                let schema = &tool(name).unwrap()["parameters"];
                                assert!(schema["properties"]["target"].is_object(), "{schema}");
                                assert!(schema["properties"]["path"].is_null(), "{schema}");
                            }
                            if name != wire_name {
                                assert!(
                                    tool(wire_name).is_none(),
                                    "duplicated the workbench alias"
                                );
                            }
                            if peer != Peer::Legacy {
                                assert!(body["input"].to_string().contains("tool_search"));
                            }
                            offered = true;
                            Reply::Tool(name, args)
                        } else {
                            let outcome = tool_outcome(&body, name);
                            match peer {
                                Peer::Desktop
                                | Peer::Legacy
                                | Peer::Svg
                                | Peer::Selection
                                | Peer::SelectionUnavailable
                                | Peer::Browser
                                | Peer::BrowserClose
                                | Peer::BrowserSvg => {
                                    assert_eq!(outcome["status"], "succeeded");
                                    assert_eq!(outcome["structured"], structured);
                                }
                                Peer::Reloaded => {
                                    assert_eq!(outcome["status"], "failed");
                                    assert!(
                                        outcome
                                            .to_string()
                                            .contains("editor_surface_endpoint_unavailable")
                                    );
                                }
                                Peer::SelectionStale => {
                                    assert_eq!(outcome["status"], "failed");
                                    assert!(outcome.to_string().contains("svg_selection_stale"));
                                }
                                Peer::Presentation => assert_eq!(outcome["status"], "uncertain"),
                                Peer::Unavailable | Peer::SvgLost => unreachable!(),
                            }
                            final_request = true;
                            Reply::Finished("Finished checking the workbench.")
                        };
                        chunk =
                            Some(STANDARD.encode(fixture_body(reply, ProviderProtocol::Responses)));
                        json!({"status":"accepted"})
                    }
                    Some("dispatch") => json!({"status":"ready","httpStatus":200}),
                    Some("read") => match chunk.take() {
                        Some(data) => json!({"status":"chunk","data":data}),
                        None => json!({"status":"end"}),
                    },
                    _ => panic!("unexpected provider exchange: {frame}"),
                };
                client.respond(&frame["id"], result).await;
            }
            Some("_co.grida/provider/cancel") if final_request => completed = true,
            _ => {}
        }
    }
    assert_eq!(listed, usize::from(peer != Peer::Legacy));
    assert_eq!(calls, usize::from(peer != Peer::Unavailable));
    if peer == Peer::SvgLost {
        timeout(WAIT, async {
            loop {
                let id = client
                    .send("_co.grida/session/snapshot", json!({"sessionId": session}))
                    .await;
                let snapshot = loop {
                    let frame = client.read_frame().await;
                    assert_ne!(
                        frame["method"], "_co.grida/provider/exchange",
                        "mutation with unverified outcome continued inference"
                    );
                    assert_ne!(
                        frame["method"], METHOD,
                        "mutation with unverified outcome was repeated"
                    );
                    if frame["id"] == id {
                        break frame["result"].clone();
                    }
                };
                if snapshot["current"].is_null() && snapshot["latest"].is_object() {
                    assert_eq!(snapshot["latest"]["status"], "uncertain", "{snapshot}");
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
    }
    client.close().await;
}

fn provider_body(params: &Value) -> Value {
    let bytes = STANDARD
        .decode(params["initial"].as_str().unwrap())
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

fn offered_tool<'a>(body: &'a Value, name: &str) -> Option<&'a Value> {
    body["tools"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|tool| tool["name"] == name)
}

fn tool_outcome(body: &Value, name: &str) -> Value {
    let input = body["input"].as_array().unwrap();
    let invocation = input
        .iter()
        .find(|entry| entry["type"] == "function_call" && entry["name"] == name)
        .unwrap();
    let output = input
        .iter()
        .find(|entry| {
            entry["type"] == "function_call_output" && entry["call_id"] == invocation["call_id"]
        })
        .unwrap();
    serde_json::from_str(output["output"].as_str().unwrap()).unwrap()
}

fn descriptor(name: &str) -> Value {
    let (description, input, revision) = match name {
        "surface_open" => (
            "Ask the attached workspace editor to open an existing artifact. Acknowledgment confirms a request was sent, and display is best effort.",
            json!({"type":"object","properties":{"path":{"type":"string","minLength":2,"maxLength":4096}},"required":["path"],"additionalProperties":false}),
            2,
        ),
        SVG_REPLACE => (
            "Replace the captured selected SVG text using the revision from svg_read_selected_text. The live edit is undoable and leaves saving to the editor's normal Save action.",
            json!({"type":"object","properties":{"revision":{"type":"string","maxLength":36},"text":{"type":"string","maxLength":4096}},"required":["revision","text"],"additionalProperties":false}),
            1,
        ),
        SVG_INSPECT => (
            "Inspect the exact captured SVG selection.",
            json!({"type":"object","additionalProperties":false}),
            1,
        ),
        _ => (
            "Read open files in the admitted workbench.",
            json!({"type":"object","additionalProperties":false}),
            2,
        ),
    };
    json!({"name":name,"description":description,"inputSchema":input,"outputSchema":{"type":"object"},"annotations":{"readOnlyHint":matches!(name, TOOL | SVG_INSPECT)},"_meta":{"co.grida/definitionRevision":revision}})
}

fn unavailable(id: &Value) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":-32001,"message":"editor_surface_endpoint_unavailable"}})
}
