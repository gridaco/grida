//! GRIDA-SEC-004 — exercise the built native caller of the Desktop catalog.

use super::approvals::Stdio as StdioClient;
use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};

const CAPABILITY: &str = "co.grida/session/desktop-tools";
const TOOL_CONTEXT: &str = "co.grida/session/editor-tool-context";
const TOOL_SOURCES: &str = "co.grida/session/desktop-tool-sources";
const WORKBENCH_PATHS: &str = "co.grida/session/workbench-file-paths";
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
    WorkbenchPaths,
    WorkbenchPathsBrowser,
}

impl Peer {
    fn workbench_paths(self) -> bool {
        matches!(self, Self::WorkbenchPaths | Self::WorkbenchPathsBrowser)
    }

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
async fn a_shell_path_reveals_a_workbench_bundle_without_waiting_for_display() {
    check_workbench_paths(Peer::WorkbenchPaths).await;
}

#[tokio::test]
async fn the_same_workbench_bundle_and_inventory_contract_works_with_browser() {
    check_workbench_paths(Peer::WorkbenchPathsBrowser).await;
}

async fn check_workbench_paths(peer: Peer) {
    const PATH: &str = "decks/New Slides.canvas";
    const SHOW_ARGS: &str = r#"{"target":{"kind":"file","path":"./decks/New Slides.canvas"}}"#;
    let state = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let bundle = workspace.path().join(PATH);
    std::fs::create_dir_all(&bundle).unwrap();
    std::fs::write(
        bundle.join(".canvas.json"),
        r#"{"editor":"slides","files":["*.svg"],"documents":[{"src":"001.svg","id":"cover"}]}"#,
    )
    .unwrap();
    std::fs::write(
        bundle.join("001.svg"),
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="navy"/><text x="50" y="80" fill="white">Welcome</text></svg>"#,
    )
    .unwrap();
    let browser = peer == Peer::WorkbenchPathsBrowser;
    let (mut client, session) = start_with_sources(&state, &workspace, peer, true).await;
    let mut input = json!({
        "sessionId":session,"inputId":"slides","operatingRegime":"act",
        "editorEndpointId":ENDPOINT,"editorPresentation":true,
        "prompt":[{"type":"text","text":"Show my new slides."}]
    });
    let mut scope = json!({"sources":true,"workbenchPaths":true,"presentation":true});
    if browser {
        input["editorBrowserTools"] = true.into();
        scope["browser"] = true.into();
    }
    let request = client.send("_co.grida/session/submit", input).await;
    let inventory = json!({
        "activeTabId":"slide-tab",
        "tabs":[{"kind":"file","tabId":"slide-tab","path":PATH}],
        "truncated":false
    });
    let mut accepted = false;
    let mut chunk = None;
    let mut step = 0;
    let mut calls = Vec::new();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == request {
            assert!(frame["result"].is_object(), "{frame}");
            accepted = true;
        }
        let params = &frame["params"];
        match frame["method"].as_str() {
            Some(METHOD) => {
                assert_eq!(params["sessionId"], session);
                assert_eq!(params["endpointId"], ENDPOINT);
                assert_eq!(params["scope"], scope);
                let message = &params["message"];
                let id = &message["id"];
                let result = match message["method"].as_str() {
                    Some("tools/list") => {
                        assert!(!accepted);
                        json!({"jsonrpc":"2.0","id":id,"result":{"resultType":"complete","tools":workbench_paths_descriptors(browser)}})
                    }
                    Some("tools/call") => {
                        let args = &message["params"]["arguments"];
                        assert_eq!(message["params"]["_meta"]["co.grida/definitionRevision"], 4);
                        assert_eq!(
                            message["params"]["_meta"]["co.grida/source"],
                            json!({"id":"workbench","generation":"fixture-workbench"})
                        );
                        let name = message["params"]["name"].as_str().unwrap();
                        calls.push(name.to_owned());
                        match name {
                            SHOW => {
                                assert_eq!(
                                    args,
                                    &serde_json::from_str::<Value>(SHOW_ARGS).unwrap()
                                );
                                assert!(bundle.join(".canvas.json").is_file());
                                // A lost acknowledgement does not block the next step.
                                json!({"jsonrpc":"2.0","id":"unverified","result":{"resultType":"complete","content":[]}})
                            }
                            TABS => {
                                assert_eq!(args, &json!({}));
                                json!({"jsonrpc":"2.0","id":id,"result":{
                                    "resultType":"complete","content":[],"structuredContent":inventory
                                }})
                            }
                            _ => panic!("unexpected Workbench action: {message}"),
                        }
                    }
                    _ => panic!("unexpected Desktop request: {frame}"),
                };
                client
                    .respond(
                        &frame["id"],
                        json!({"sessionId":session,"endpointId":ENDPOINT,"message":result}),
                    )
                    .await;
            }
            Some("_co.grida/provider/exchange") => {
                let result = match params["action"].as_str() {
                    Some("open") => {
                        let body = provider_body(params);
                        let reply = match step {
                            0 => {
                                assert!(body["instructions"].as_str().unwrap().contains(
                                    "workspace-relative or in-workspace absolute file path"
                                ));
                                assert!(offered_tool(&body, SHOW).is_none());
                                Reply::Tool(
                                    "tool_search",
                                    r#"{"query":"workbench","source":"workbench"}"#,
                                )
                            }
                            1 => {
                                assert!(offered_tool(&body, SHOW).is_some(), "{body}");
                                assert!(offered_tool(&body, TABS).is_some(), "{body}");
                                Reply::Tool(SHOW, SHOW_ARGS)
                            }
                            2 => {
                                assert_eq!(tool_outcome(&body, SHOW)["status"], "uncertain");
                                Reply::Tool(TABS, "{}")
                            }
                            3 => {
                                let result = tool_outcome(&body, TABS);
                                assert_eq!(result["status"], "succeeded");
                                assert_eq!(result["structured"], inventory);
                                Reply::Finished("The slides are ready.")
                            }
                            _ => panic!("unexpected inference: {body}"),
                        };
                        step += 1;
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
            Some("_co.grida/provider/cancel") if step == 4 && accepted => break,
            Some(method) if method.starts_with("_co.grida/editor/") => {
                panic!("the Workbench call used a compatibility route: {frame}");
            }
            _ => {}
        }
    }
    assert_eq!(calls, [SHOW, TABS]);
    client.close().await;
}

fn workbench_paths_descriptors(browser: bool) -> [Value; 2] {
    let descriptors: Value = serde_json::from_str(include_str!(
        "../../../../desktop/src/main/desktop-workbench-tools.json"
    ))
    .unwrap();
    ["list", "show"].map(|operation| {
        let tool = &descriptors[operation];
        let mut input = tool["inputSchema"].clone();
        if operation == "show" && !browser {
            let targets = input["properties"]["target"]["oneOf"]
                .as_array_mut()
                .unwrap();
            targets.retain(|target| target["properties"]["kind"]["const"] != "url");
            input["properties"]["presentation"] = json!({"const":"reveal"});
        }
        let mut wire = json!({
            "name": tool["name"], "description": tool["description"],
            "inputSchema": input, "outputSchema": tool["outputSchema"],
            "_meta": {
                "co.grida/definitionRevision": tool["version"],
                "co.grida/source": {
                    "id":"workbench","generation":"fixture-workbench","description":"Show and list files."
                }
            }
        });
        if operation == "show" {
            wire["_meta"]["co.grida/resultDisposition"] = true.into();
        } else {
            wire["annotations"] = json!({"readOnlyHint":true});
        }
        wire
    })
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
async fn explicit_browser_skill_requires_a_captured_browser_grant_and_pins_queued_work() {
    let state = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let (mut client, session) = start_with_sources(&state, &workspace, Peer::Browser, true).await;
    let mut request = json!({
        "sessionId": session, "inputId":"chosen-browser", "operatingRegime":"act",
        "prompt":[{"type":"text","text":"Inspect the page."},
                  {"type":"resource_link","name":"browser","uri":"grida-skill:browser/browser"}]
    });
    let absent = client
        .request("_co.grida/session/submit", request.clone())
        .await;
    assert!(
        absent["error"]
            .to_string()
            .contains("selected_skill_unavailable"),
        "{absent}"
    );
    request["editorEndpointId"] = ENDPOINT.into();
    request["editorBrowserTools"] = true.into();

    // Negotiation and the client's request alone cannot activate the package.
    let mut provider_request = None;
    for grant in [false, true] {
        let admission = client
            .send("_co.grida/session/enqueue", request.clone())
            .await;
        let mut answered = false;
        while !answered || (grant && provider_request.is_none()) {
            let frame = client.read_reply().await;
            if frame["id"] == admission {
                if grant {
                    assert!(frame["result"].is_object(), "{frame}");
                } else {
                    assert!(
                        frame["error"]
                            .to_string()
                            .contains("selected_skill_unavailable"),
                        "{frame}"
                    );
                }
                answered = true;
                continue;
            }
            if frame["method"] == "_co.grida/provider/exchange" {
                assert!(grant);
                let params = &frame["params"];
                assert_eq!(params["action"], "open");
                let body = provider_body(params);
                assert!(
                    body["input"]
                        .to_string()
                        .contains("Element references belong to that document.")
                );
                assert!(offered_tool(&body, "browser_snapshot").is_none());
                // Hold the model request while inspecting and retrying the same input.
                provider_request = Some(frame["id"].clone());
                continue;
            }
            assert_eq!(frame["method"], METHOD, "{frame}");
            let params = &frame["params"];
            assert_eq!(params["scope"], json!({"browser":true,"sources":true}));
            let message = &params["message"];
            assert_eq!(message["method"], "tools/list");
            let mut tools = vec![];
            if grant {
                let mut browser = browser_descriptor("browser_snapshot", "browser_snapshot");
                browser["_meta"]["co.grida/source"] = json!({"id":"browser","generation":"browser-v1","description":"Inspect pages."});
                tools.push(browser);
            }
            client.respond(&frame["id"], json!({
                "sessionId": session, "endpointId": ENDPOINT,
                "message":{"jsonrpc":"2.0","id":message["id"],"result":{"resultType":"complete","tools":tools}}
            })).await;
        }
    }

    // Idempotent enqueue succeeds without another catalog exchange.
    let retry = client.request("_co.grida/session/enqueue", request).await;
    assert!(retry["result"].is_object(), "{retry}");
    let inspected = client
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session, "inputId":"chosen-browser"}),
        )
        .await;
    let selection = &inspected["result"]["settings"]["skills"][0];
    assert_eq!(selection["extension"], "browser", "{inspected}");
    assert_eq!(
        selection["uri"],
        format!(
            "grida-skill:browser/browser@{}",
            selection["revision"].as_str().unwrap()
        )
    );
    assert_eq!(inspected["result"]["prompt"][1]["uri"], selection["uri"]);
    client
        .respond(&provider_request.unwrap(), json!({"status":"unavailable"}))
        .await;
    client.close().await;
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

#[tokio::test]
async fn queued_tool_calls_keep_their_source_generation_despite_identical_replacement() {
    const RED: &str = "desktop_red_lens__inspect";
    const BLUE: &str = "desktop_blue_lens__inspect";
    const RED_GENERATION: &str = "red-first-generation";
    const BLUE_GENERATION: &str = "blue-first-generation";
    let state = TempDir::new().unwrap();
    let workspace = TempDir::new().unwrap();
    let (mut client, session) = start_with_sources(&state, &workspace, Peer::Desktop, true).await;
    let blocking = client
        .send(
            "_co.grida/session/submit",
            json!({
                "sessionId":session,"inputId":"blocking","operatingRegime":"act",
                "prompt":[{"type":"text","text":"Finish this first."}]
            }),
        )
        .await;
    let descriptor = |name: &str, source: &str, generation: &str| {
        json!({"name":name,"description":"Inspect a fixture.","inputSchema":{"type":"object"},
            "annotations":{"readOnlyHint":true},"_meta":{"co.grida/definitionRevision":7,
                "co.grida/resultDisposition":true,
                "co.grida/source":{"id":source,"generation":generation,"description":"Inspect fixture documents."}}})
    };
    let mut queued = None;
    let mut held_read = None;
    let mut accepted = false;
    let mut listed = false;
    let mut chunk = None;
    let mut next_model_request = 0;
    let mut red_generation = RED_GENERATION;
    let mut calls = Vec::new();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == blocking {
            assert!(frame["result"].is_object(), "{frame}");
        }
        if queued.is_some_and(|id| frame["id"] == id) {
            assert!(listed, "queue must capture its catalog before admission");
            assert_eq!(frame["result"]["disposition"], "queued", "{frame}");
            accepted = true;
            // Only the registration generation changes. The alias, schema,
            // and revision of the newly installed provider are identical.
            red_generation = "red-replacement-generation";
            client
                .respond(
                    &held_read.take().unwrap(),
                    json!({"status":"chunk","data":chunk.take().unwrap()}),
                )
                .await;
        }
        let params = &frame["params"];
        match frame["method"].as_str() {
            Some(METHOD) => {
                assert_eq!(params["sessionId"], session);
                assert_eq!(params["endpointId"], ENDPOINT);
                assert_eq!(params["scope"], json!({"sources":true}));
                let message = &params["message"];
                let id = &message["id"];
                let reply = match message["method"].as_str() {
                    Some("tools/list") => {
                        assert!(!listed && !accepted, "{frame}");
                        listed = true;
                        json!({"jsonrpc":"2.0","id":id,"result":{"resultType":"complete","tools":[
                            descriptor(RED,"red-lens",red_generation),
                            descriptor(BLUE,"blue-lens",BLUE_GENERATION)
                        ]}})
                    }
                    Some("tools/call") => {
                        assert!(accepted, "{frame}");
                        let name = message["params"]["name"].as_str().unwrap();
                        let metadata = &message["params"]["_meta"];
                        assert_eq!(metadata["co.grida/definitionRevision"], 7);
                        assert_eq!(message["params"]["arguments"], json!({}));
                        calls.push(name.to_owned());
                        match name {
                            RED => {
                                assert_eq!(
                                    metadata["co.grida/source"],
                                    json!({"id":"red-lens","generation":RED_GENERATION})
                                );
                                assert_ne!(
                                    metadata["co.grida/source"]["generation"],
                                    red_generation
                                );
                                unavailable(id)
                            }
                            BLUE => {
                                assert_eq!(
                                    metadata["co.grida/source"],
                                    json!({"id":"blue-lens","generation":BLUE_GENERATION})
                                );
                                json!({"jsonrpc":"2.0","id":id,"result":{"resultType":"complete","content":[],
                                    "_meta":{"co.grida/disposition":"not_dispatched"},
                                    "structuredContent":{"disposition":"not_dispatched","owner":"blue-lens"}}})
                            }
                            _ => panic!("unexpected wire name: {frame}"),
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
                        let response = if queued.is_none() {
                            Reply::Finished("The first turn finished.")
                        } else {
                            let response = match next_model_request {
                                0 => {
                                    assert!(offered_tool(&body, RED).is_none());
                                    assert!(offered_tool(&body, BLUE).is_none());
                                    Reply::Tool("tool_search", r#"{"query":"inspect fixture"}"#)
                                }
                                1 => {
                                    let found = tool_outcome(&body, "tool_search");
                                    let matches =
                                        found["structured"]["matches"].as_array().unwrap();
                                    assert_eq!(matches.len(), 2);
                                    assert_eq!(matches[0]["kind"], "extension");
                                    assert_eq!(matches[0]["name"], "blue-lens");
                                    assert_eq!(matches[1]["name"], "red-lens");
                                    assert!(offered_tool(&body, RED).is_none());
                                    assert!(offered_tool(&body, BLUE).is_none());
                                    Reply::Tool(
                                        "tool_search",
                                        r#"{"query":"inspect","source":"red-lens"}"#,
                                    )
                                }
                                2 => {
                                    assert!(offered_tool(&body, RED).is_some());
                                    assert!(offered_tool(&body, BLUE).is_none());
                                    Reply::Tool(RED, "{}")
                                }
                                3 => {
                                    let outcome = tool_outcome(&body, RED);
                                    assert_eq!(outcome["status"], "failed");
                                    assert!(
                                        outcome
                                            .to_string()
                                            .contains("editor_surface_endpoint_unavailable")
                                    );
                                    Reply::Tool(
                                        "tool_search",
                                        r#"{"query":"inspect","source":"blue-lens"}"#,
                                    )
                                }
                                4 => {
                                    assert!(offered_tool(&body, BLUE).is_some());
                                    Reply::Tool(BLUE, "{}")
                                }
                                5 => {
                                    let outcome = tool_outcome(&body, BLUE);
                                    assert_eq!(outcome["status"], "succeeded");
                                    assert_eq!(outcome["structured"]["owner"], "blue-lens");
                                    Reply::Finished("Only blue could inspect the fixture.")
                                }
                                _ => panic!("unexpected inference: {body}"),
                            };
                            next_model_request += 1;
                            response
                        };
                        chunk = Some(
                            STANDARD.encode(fixture_body(response, ProviderProtocol::Responses)),
                        );
                        json!({"status":"accepted"})
                    }
                    Some("dispatch") => json!({"status":"ready","httpStatus":200}),
                    Some("read") if queued.is_none() => {
                        held_read = Some(frame["id"].clone());
                        queued = Some(client.send("_co.grida/session/enqueue", json!({
                            "sessionId":session,"inputId":"inspect-queued","operatingRegime":"act",
                            "editorEndpointId":ENDPOINT,
                            "prompt":[{"type":"text","text":"Inspect both sources."}]
                        })).await);
                        continue;
                    }
                    Some("read") => match chunk.take() {
                        Some(data) => json!({"status":"chunk","data":data}),
                        None => json!({"status":"end"}),
                    },
                    _ => panic!("unexpected provider exchange: {frame}"),
                };
                client.respond(&frame["id"], result).await;
            }
            Some("_co.grida/provider/cancel") if next_model_request == 6 => break,
            Some(method) if method.starts_with("_co.grida/editor/") => {
                panic!("unexpected fallback: {frame}");
            }
            _ => {}
        }
    }
    assert_eq!(calls, [RED, BLUE]);
    client.close().await;
}

async fn start(state: &TempDir, workspace: &TempDir, peer: Peer) -> (StdioClient, String) {
    start_with_sources(state, workspace, peer, false).await
}

async fn start_with_sources(
    state: &TempDir,
    workspace: &TempDir,
    peer: Peer,
    tool_sources: bool,
) -> (StdioClient, String) {
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
    if tool_sources {
        initialize["clientCapabilities"]["_meta"][TOOL_SOURCES] = 1.into();
    }
    if peer.workbench_paths() {
        initialize["clientCapabilities"]["_meta"][WORKBENCH_PATHS] = 1.into();
    }
    if peer.has_selection() || peer == Peer::Legacy {
        initialize["clientCapabilities"]["_meta"][TOOL_CONTEXT] = 1.into();
    }
    let presentation = peer == Peer::Presentation || peer.workbench_paths();
    let svg = matches!(peer, Peer::Svg | Peer::SvgLost | Peer::BrowserSvg);
    let browser = matches!(
        peer,
        Peer::Browser | Peer::BrowserClose | Peer::BrowserSvg | Peer::WorkbenchPathsBrowser
    );
    if presentation {
        initialize["clientCapabilities"]["_meta"]["co.grida/session/editor-surface-open"] =
            1.into();
    }
    if svg {
        initialize["clientCapabilities"]["_meta"]["co.grida/session/editor-svg-text"] = 1.into();
    }
    if browser {
        initialize["clientCapabilities"]["_meta"][BROWSER] = 1.into();
        if tool_sources {
            initialize["clientCapabilities"]["_meta"]["co.grida/session/desktop-browser-mcp"] =
                1.into();
        }
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
        capabilities[TOOL_SOURCES].as_u64(),
        tool_sources.then_some(1)
    );
    assert_eq!(
        capabilities[TOOL_CONTEXT].as_u64(),
        peer.has_selection().then_some(1)
    );
    assert_eq!(
        capabilities[WORKBENCH_PATHS].as_u64(),
        peer.workbench_paths().then_some(1)
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
        Peer::WorkbenchPaths | Peer::WorkbenchPathsBrowser => unreachable!(),
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
                        let instructions = body["instructions"].as_str().unwrap();
                        assert_eq!(
                            instructions.contains("first meaningful renderable checkpoint"),
                            presentation
                        );
                        assert!(!instructions.contains("verified HTTP(S) URL"));
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
                                Peer::Unavailable
                                | Peer::SvgLost
                                | Peer::WorkbenchPaths
                                | Peer::WorkbenchPathsBrowser => {
                                    unreachable!()
                                }
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

/// Project one of Desktop's shipped Browser descriptors onto its MCP registration.
pub(super) fn browser_descriptor(wire_name: &str, name: &str) -> Value {
    let descriptors: Vec<Value> =
        serde_json::from_str(include_str!("../../../../extensions/browser/tools.json")).unwrap();
    let descriptor = descriptors
        .iter()
        .find(|entry| entry["name"] == wire_name)
        .unwrap();
    let description = if name == SHOW {
        "Ask the attached workbench to show a workspace file, HTTP(S) URL, or exact tab. The workbench chooses the viewer. Window focus requires an explicit request. Use browser_open for background browser work."
    } else {
        descriptor["description"].as_str().unwrap()
    };
    let mut tool = json!({
        "name": name, "description": description,
        "inputSchema":descriptor["inputSchema"], "outputSchema":descriptor["outputSchema"],
        "annotations":{"readOnlyHint":descriptor["effect"] == "read"},
        "_meta":{"co.grida/definitionRevision":descriptor["version"],
            "co.grida/maxInputBytes":40960,"co.grida/maxOutputBytes":458752}
    });
    if wire_name == "browser_capture" {
        tool["_meta"]["co.grida/resultMimeType"] = "image/jpeg".into();
    }
    tool
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
