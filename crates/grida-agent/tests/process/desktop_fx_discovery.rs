//! GRIDA-SEC-007 — a launch-granted FX skill participates in Desktop turn discovery.

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
    let submitted = client
        .send(
            "_co.grida/session/submit",
            json!({
                "sessionId": session,
                "inputId": "find-fx-guidance",
                "operatingRegime": "act",
                "prompt": [{"type":"text","text":"Find the FX workflow guidance."}]
            }),
        )
        .await;
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
                        let reply = model_reply(requests, &request);
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
            Some("_co.grida/provider/cancel") if requests == 3 => finished = true,
            Some(method) if method.starts_with("_co.grida/editor/") => {
                panic!("an FX-only turn attempted to bind an editor: {frame}");
            }
            _ => {}
        }
    }
    assert_eq!(requests, 3);
    client.close().await;
}

fn model_reply(index: usize, request: &Value) -> Reply {
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
    let body = request.to_string();
    match index {
        0 => {
            assert!(offered("tool_search"), "{tools:?}");
            assert!(body.contains("You are working in Grida Desktop."));
            assert!(!body.contains(FX_GUIDANCE));
            Reply::Tool("tool_search", r#"{"query":"plan an FX workflow"}"#)
        }
        1 => {
            let found = tool_output(request);
            assert_eq!(found["status"], "succeeded", "{found}");
            let matches = found["structured"]["matches"].as_array().unwrap();
            assert_eq!(matches.len(), 1, "{matches:?}");
            assert_eq!(matches[0]["kind"], "skill");
            assert_eq!(matches[0]["name"], "desktop-fx");
            assert!(
                matches[0]["description"]
                    .as_str()
                    .unwrap()
                    .contains("Grida FX")
            );
            assert!(!body.contains(FX_GUIDANCE));
            assert!(offered("read_skill"), "{tools:?}");
            Reply::Tool("read_skill", r#"{"name":"desktop-fx"}"#)
        }
        2 => {
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
