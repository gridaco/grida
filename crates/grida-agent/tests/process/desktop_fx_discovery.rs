//! GRIDA-SEC-007 — skills contribute domain guidance under the Desktop turn’s captured grants.

use super::approvals::{Fixture, Stdio as Client};
use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use std::fs;

const FX_GUIDANCE: &str = "grida-fx plan <workflow> --check --register --json";
const DESKTOP_TOOLS: &str = "co.grida/session/desktop-tools";
const EDITOR_SURFACES: &str = "co.grida/session/editor-surfaces";

#[tokio::test]
#[ignore = "requires the current native helper and configured OS confinement"]
async fn a_desktop_workspace_discovers_fx_without_an_editor_endpoint() {
    exercise(false).await;
}

#[tokio::test]
#[ignore = "requires the current native helper and configured OS confinement"]
async fn slides_and_fx_share_the_workbench_presentation_policy() {
    exercise(true).await;
}

async fn exercise(presentation: bool) {
    let fixture = Fixture::new(true);
    let mut profile: Value = serde_json::from_slice(&fs::read(&fixture.profile).unwrap()).unwrap();
    profile["command"]["bundledSkills"] = json!(["desktop-fx"]);
    fs::write(&fixture.profile, serde_json::to_vec(&profile).unwrap()).unwrap();
    let child = fixture
        .process("http://127.0.0.1:43172/v1", "serve")
        .args([
            "--stdio",
            "--supervised-provider",
            "--provider",
            "responses",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut client = Client::from_child(child);
    let mut initialize = extension_initialize();
    let meta = &mut initialize["clientCapabilities"]["_meta"];
    for capability in ["co.grida/provider/egress", EDITOR_SURFACES, DESKTOP_TOOLS] {
        meta[capability] = 1.into();
    }
    if presentation {
        for capability in [
            "co.grida/session/editor-surface-open",
            "co.grida/session/browser-tools",
            "co.grida/session/desktop-browser-mcp",
            "co.grida/session/desktop-tool-sources",
        ] {
            meta[capability] = 1.into();
        }
    }
    let ready = client.request("initialize", initialize).await;
    let advertised = &ready["result"]["agentCapabilities"]["_meta"];
    assert_eq!(advertised[EDITOR_SURFACES], 1, "{ready}");
    assert_eq!(advertised[DESKTOP_TOOLS], 1, "{ready}");

    let created = client
        .request(
            "session/new",
            json!({"cwd": fixture.primary, "mcpServers": []}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let mut submission = json!({
        "sessionId": session, "inputId": "deck-and-workflow", "operatingRegime": "act",
        "prompt": [{"type":"text","text":"Prepare a new slide deck and an FX plan for its artwork."}]
    });
    if presentation {
        submission["editorEndpointId"] = "6f9619ff-8b86-4011-b42d-00c04fc964ff".into();
        submission["editorPresentation"] = true.into();
        submission["editorBrowserTools"] = true.into();
    }
    let submitted = client.send("_co.grida/session/submit", submission).await;
    let mut accepted = false;
    let mut finished = false;
    let mut requests = 0;
    let mut chunk = None;
    while !accepted || !finished {
        let frame = client.read_frame().await;
        if frame["id"] == submitted {
            assert!(frame["result"].is_object(), "{frame}");
            accepted = true;
        }
        let params = &frame["params"];
        match frame["method"].as_str() {
            Some("_co.grida/provider/exchange") => {
                let reply = match params["action"].as_str() {
                    Some("open") => {
                        let bytes = STANDARD
                            .decode(params["initial"].as_str().unwrap())
                            .unwrap();
                        let request: Value = serde_json::from_slice(&bytes).unwrap();
                        let reply = model_reply(requests, &request, presentation);
                        requests += 1;
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
                client.respond(&frame["id"], reply).await;
            }
            Some("_co.grida/provider/cancel") if requests == 4 => finished = true,
            Some("_co.grida/editor/desktop-tools") if presentation => {
                let message = &params["message"];
                assert_eq!(message["method"], "tools/list", "{message}");
                assert_eq!(
                    params["scope"],
                    json!({"presentation":true,"browser":true,"sources":true})
                );
                let mut tool =
                    super::desktop_tools::browser_descriptor("surface_open", "workbench_show");
                tool["_meta"]["co.grida/source"] = json!({"id":"workbench","generation":"workspace-v1","description":"Show the primary artifact."});
                client.respond(&frame["id"], json!({
                    "sessionId":session,"endpointId":params["endpointId"],
                    "message":{"jsonrpc":"2.0","id":message["id"],"result":{"resultType":"complete","tools":[tool]}}
                })).await;
            }
            Some(method) if method.starts_with("_co.grida/editor/") => {
                panic!("an FX-only turn attempted to bind an editor: {frame}");
            }
            _ => {}
        }
    }
    assert_eq!(requests, 4);
    client.close().await;
}

fn model_reply(index: usize, request: &Value, presentation: bool) -> Reply {
    let tools = request["tools"].as_array().unwrap();
    let offered = |name| tools.iter().any(|tool| tool["name"] == name);
    assert!(
        [
            "surface_list_open",
            "surface_open",
            "svg_read_selected_text",
            "browser_open"
        ]
        .into_iter()
        .all(|tool| !offered(tool)),
        "an FX skill granted an editor operation: {tools:?}"
    );
    let instructions = request["instructions"].as_str().unwrap();
    assert_eq!(
        instructions.contains("first meaningful renderable checkpoint"),
        presentation
    );
    assert_eq!(instructions.contains("verified HTTP(S) URL"), presentation);
    let input = request["input"].to_string();
    assert_eq!(
        input.contains("manifest references a valid first slide"),
        index >= 1
    );
    assert!(
        !input.contains("first meaningful renderable checkpoint"),
        "{input}"
    );
    assert!(
        !input.contains("workbench_show"),
        "shared reveal guidance leaked into a skill: {input}"
    );
    let body = request.to_string();
    match index {
        0 => {
            assert!(offered("tool_search"), "{tools:?}");
            assert!(body.contains("You are working in Grida Desktop."));
            assert!(!body.contains(FX_GUIDANCE));
            assert!(offered("read_skill"), "{tools:?}");
            Reply::Tool("read_skill", r#"{"name":"slides"}"#)
        }
        1 => {
            assert_eq!(tool_output(request)["status"], "succeeded");
            Reply::Tool(
                "tool_search",
                r#"{"query":"plan an FX workflow","source":"desktop-fx"}"#,
            )
        }
        2 => {
            let found = tool_output(request);
            assert_eq!(found["status"], "succeeded", "{found}");
            let matches = found["structured"]["matches"].as_array().unwrap();
            assert_eq!(matches.len(), 1, "{matches:?}");
            assert_eq!(matches[0]["kind"], "skill");
            assert_eq!(matches[0]["source"], "desktop-fx");
            assert_eq!(matches[0]["name"], "desktop-fx/desktop-fx");
            assert!(
                matches[0]["description"]
                    .as_str()
                    .unwrap()
                    .contains("Grida FX")
            );
            assert!(!body.contains(FX_GUIDANCE));
            assert!(offered("read_skill"), "{tools:?}");
            Reply::Tool("read_skill", r#"{"name":"desktop-fx/desktop-fx"}"#)
        }
        3 => {
            let read = tool_output(request);
            assert_eq!(read["status"], "succeeded", "{read}");
            assert!(read.to_string().contains(FX_GUIDANCE), "{read}");
            Reply::Finished("Found the Desktop FX workflow guidance.")
        }
        _ => panic!("unexpected model request: {request}"),
    }
}

fn tool_output(request: &Value) -> Value {
    let output = request["input"]
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .find(|entry| entry["type"] == "function_call_output")
        .unwrap();
    serde_json::from_str(output["output"].as_str().unwrap()).unwrap()
}
