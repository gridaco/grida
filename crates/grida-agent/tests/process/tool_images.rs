//! GRIDA-SEC-004 — captured tool images are observable without source or inference.

use super::*;
use std::fs;
use std::os::unix::fs::PermissionsExt;

const CAPABILITY: &str = "co.grida/session/tool-images";
const WINDOW: &str = "co.grida/session/transcript-window";
const READ: &str = "_co.grida/session/read-tool-image-chunk";

fn initialize() -> Value {
    let mut request = extension_initialize();
    request["clientCapabilities"]["_meta"][CAPABILITY] = 1.into();
    request["clientCapabilities"]["_meta"][WINDOW] = 1.into();
    request
}

async fn replay(client: &mut StdioClient, session: &str, cwd: &Path) -> Vec<Value> {
    let id = client
        .send(
            "session/load",
            json!({
                "sessionId":session,"cwd":cwd,"mcpServers":[],
                "_meta":{WINDOW:{"kind":"read","requestId":"tool-image-page"}}
            }),
        )
        .await;
    let mut activity = Vec::new();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == id {
            assert!(frame["result"].is_object(), "{frame}");
            return activity;
        }
        if frame["params"]["update"]["sessionUpdate"] == "tool_call" {
            activity.push(frame["params"].clone());
        }
    }
}

#[tokio::test]
async fn retained_tool_images_read_exact_prepared_pixels_after_source_deletion_and_restart() {
    let root = TempDir::new().unwrap();
    let base = root.path().canonicalize().unwrap();
    fs::set_permissions(&base, fs::Permissions::from_mode(0o700)).unwrap();
    let state = base.join("state");
    let project = base.join("project");
    fs::create_dir(&project).unwrap();
    let profile = base.join("permissions.json");
    fs::write(&profile, serde_json::to_vec(&json!({
        "version":1,"workspace":"project","revision":"selected","primary":"primary",
        "directories":[{"id":"primary","name":"Project","path":project,"generation":"first","read":"allow"}]
    })).unwrap()).unwrap();
    fs::set_permissions(&profile, fs::Permissions::from_mode(0o600)).unwrap();
    // JPEG source guarantees that the retained tool PNG is the frozen prepared
    // result, rather than bytes recovered by reopening the original path.
    let source = project.join("captured.jpg");
    let mut jpeg = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image::ImageBuffer::from_pixel(
        30,
        20,
        image::Rgb([17, 42, 99]),
    ))
    .write_to(&mut jpeg, image::ImageFormat::Jpeg)
    .unwrap();
    fs::write(&source, jpeg.into_inner()).unwrap();
    let (complete, held) = tokio::sync::oneshot::channel();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Tool("view_image", r#"{"path":"captured.jpg"}"#),
            Reply::Tool("view_image", r#"{"path":"missing.png"}"#),
            Reply::Release(
                "Observed the captured view; the missing image failed.",
                held,
            ),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let url = endpoint.url.clone();
    let launch = || {
        StdioClient::from_child(
            server(&state, &url, IMAGE_MODEL)
                .arg("--permission-profile")
                .arg(&profile)
                .arg("--stdio")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap(),
        )
    };
    let mut client = launch();
    let ready = client.request("initialize", initialize()).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][CAPABILITY], 1);
    let created = client
        .request("session/new", json!({"cwd":project,"mcpServers":[]}))
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap().to_owned();
    let prompt = client.send("session/prompt", json!({"sessionId":session,"prompt":[{"type":"text","text":"Inspect the captured image and missing image."}]})).await;
    let mut live = None;
    let mut failed = None;
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == prompt {
            assert!(frame["result"].is_object(), "{frame}");
            break;
        }
        let params = &frame["params"];
        if params["update"]["rawOutput"]["images"].is_array() {
            live = Some(params.clone());
        }
        if params["_meta"]["co.grida/session/updates"]["outcome"] == "failed" {
            failed = Some(params.clone());
            break;
        }
    }
    let live = live.expect("successful live result carries retained image metadata");
    let failed = failed.expect("failed view remains readable");
    assert!(
        failed["update"]["rawOutput"]["text"]
            .as_str()
            .is_some_and(|text| !text.is_empty())
    );
    assert!(failed["update"]["rawOutput"].get("images").is_none());
    endpoint.request().await;
    let with_pixels = endpoint.request().await;
    endpoint.request().await;
    let expected = with_pixels["input"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|part| part["output"].as_array().into_iter().flatten())
        .find_map(|part| {
            part["image_url"]
                .as_str()
                .and_then(|url| url.strip_prefix("data:image/png;base64,"))
        })
        .map(|data| STANDARD.decode(data).unwrap())
        .expect("captured model pixels");
    let images = &live["update"]["rawOutput"]["images"];
    assert_eq!(images.as_array().unwrap().len(), 1);
    assert_eq!(images[0]["totalBytes"], expected.len());
    let turn = live["_meta"]["co.grida/session/updates"]["turnId"].clone();
    let call = live["update"]["toolCallId"].clone();
    let request = json!({"sessionId":session,"turnId":turn,"toolCallId":call,
        "mediaId":images[0]["mediaId"],"contentIndex":images[0]["contentIndex"],"offset":0});
    let read = client.request(READ, request.clone()).await;
    assert_eq!(
        STANDARD
            .decode(read["result"]["data"].as_str().unwrap())
            .unwrap(),
        expected
    );
    assert_eq!(read["result"]["sessionId"], session);
    assert_eq!(read["result"]["turnId"], turn);
    assert_eq!(read["result"]["toolCallId"], call);
    assert_eq!(read["result"]["mediaId"], images[0]["mediaId"]);
    assert!(read["result"]["nextOffset"].is_null());
    let state_before_completion = snapshot(&mut client, &session).await;
    assert_eq!(state_before_completion["current"]["turnId"], turn);
    fs::write(
        &source,
        b"The source has changed and is no longer an image.",
    )
    .unwrap();
    assert_eq!(
        client.request(READ, request.clone()).await["result"],
        read["result"]
    );
    fs::remove_file(&source).unwrap();
    complete.send(()).unwrap();
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == prompt {
            assert!(frame["result"].is_object(), "{frame}");
            break;
        }
    }
    assert!(client.finish().await.status.success());

    let mut client = launch();
    client.request("initialize", initialize()).await;
    let attached = client.request("session/load", json!({"sessionId":session,"cwd":project,"mcpServers":[],"_meta":{WINDOW:{"kind":"attach"}}})).await;
    assert!(attached["result"].is_object(), "{attached}");
    let replayed = replay(&mut client, &session, &project).await;
    let replayed_image = replayed
        .iter()
        .find(|params| params["update"]["toolCallId"] == call)
        .unwrap();
    assert_eq!(replayed_image["update"]["rawOutput"]["images"], *images);
    let read = client.request(READ, request.clone()).await;
    assert_eq!(
        STANDARD
            .decode(read["result"]["data"].as_str().unwrap())
            .unwrap(),
        expected
    );
    for (field, value) in [
        ("turnId", json!("foreign-turn")),
        ("toolCallId", json!("foreign-call")),
        ("mediaId", json!("workspace-view/fabricated")),
        ("mediaId", json!("input/image")),
        ("contentIndex", json!(0)),
        ("contentIndex", json!(1024)),
        ("offset", json!(1)),
        ("offset", json!(262144)),
        ("toolCallId", failed["update"]["toolCallId"].clone()),
    ] {
        let mut wrong = request.clone();
        wrong[field] = value;
        let denied = client.request(READ, wrong).await;
        assert_eq!(
            denied["error"]["data"], "tool_image_unavailable",
            "{field}: {denied}"
        );
    }
    let other = client
        .request("session/new", json!({"cwd":project,"mcpServers":[]}))
        .await;
    let mut foreign = request.clone();
    foreign["sessionId"] = other["result"]["sessionId"].clone();
    assert_eq!(
        client.request(READ, foreign).await["error"]["data"],
        "tool_image_unavailable"
    );
    // Retained assets include their own integrity header. Removing the sole
    // captured source tests honest unavailability without corrupting journals.
    let owner = fs::read_dir(state.join("retained-inputs"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let blob = fs::read_dir(owner.join("sources"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    fs::remove_file(blob).unwrap();
    assert_eq!(
        client.request(READ, request.clone()).await["error"]["data"],
        "tool_image_unavailable"
    );
    assert_eq!(
        replay(&mut client, &session, &project)
            .await
            .iter()
            .find(|params| params["update"]["toolCallId"] == call)
            .unwrap()["update"]["rawOutput"]["images"],
        *images
    );
    assert!(client.finish().await.status.success());

    let mut older = launch();
    let mut unsupported = initialize();
    unsupported["clientCapabilities"]["_meta"][CAPABILITY] = 2.into();
    older.request("initialize", unsupported).await;
    older.request("session/load", json!({"sessionId":session,"cwd":project,"mcpServers":[],"_meta":{WINDOW:{"kind":"attach"}}})).await;
    assert!(
        replay(&mut older, &session, &project)
            .await
            .iter()
            .all(|params| params["update"]["rawOutput"].get("images").is_none())
    );
    assert!(older.request(READ, request).await.get("error").is_some());
    assert!(older.finish().await.status.success());
    endpoint.done().await;
}

#[tokio::test]
async fn native_browser_capture_requires_act_and_projects_correlated_pixels() {
    const EDITOR: &str = "co.grida/session/editor-surfaces";
    const PRESENTATION: &str = "co.grida/session/editor-surface-open";
    const BROWSER: &str = "co.grida/session/browser-tools";
    const EDITOR_CONTEXT: &str = "co.grida/session/editor-context";
    const ENDPOINT: &str = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
    let root = TempDir::new().unwrap();
    let base = root.path().canonicalize().unwrap();
    fs::set_permissions(&base, fs::Permissions::from_mode(0o700)).unwrap();
    let workspace = base.join("workspace");
    fs::create_dir(&workspace).unwrap();
    let child = server(
        &base.join("state"),
        "http://127.0.0.1:43172/v1",
        IMAGE_MODEL,
    )
    .args(["--stdio", "--supervised-provider"])
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .unwrap();
    let mut client = StdioClient::from_child(child);
    let mut offer = initialize();
    offer["clientCapabilities"]["_meta"][EDITOR] = 1.into();
    offer["clientCapabilities"]["_meta"][PRESENTATION] = 1.into();
    offer["clientCapabilities"]["_meta"][BROWSER] = 1.into();
    offer["clientCapabilities"]["_meta"][EDITOR_CONTEXT] = 1.into();
    offer["clientCapabilities"]["_meta"]["co.grida/provider/egress"] = 1.into();
    offer["clientCapabilities"]["_meta"]["co.grida/session/updates"] = 1.into();
    let ready = client.request("initialize", offer).await;
    assert_eq!(
        ready["result"]["agentCapabilities"]["_meta"][BROWSER], 1,
        "{ready}"
    );
    let created = client
        .request("session/new", json!({"cwd":workspace,"mcpServers":[]}))
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let submission = |id: &str, regime: &str| {
        json!({
            "sessionId": session,
            "inputId": id,
            "prompt": [{"type":"text","text":"Capture the fixture."}],
            "editorContext": {"kind":"selection","surface":"workflow-viewer","sampledAt":1700000000123_u64,
                "payload":{"selection":"selected-step"}},
            "operatingRegime": regime,
            "editorEndpointId": ENDPOINT,
            "editorPresentation": true,
            "editorBrowserTools": true
        })
    };
    let refused = client
        .request(
            "_co.grida/session/submit",
            submission("plan-capture", "plan"),
        )
        .await;
    assert!(refused["error"].is_object(), "{refused}");

    let id = client
        .send("_co.grida/session/submit", submission("act-capture", "act"))
        .await;
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new(&mut jpeg)
        .encode(&[121, 18, 96], 1, 1, image::ExtendedColorType::Rgb8)
        .unwrap();
    let mut replies = [
        Reply::Tool(
            "surface_open",
            r#"{"target":{"kind":"file","path":"/poster.canvas"}}"#,
        ),
        Reply::Tool(
            "browser_capture",
            r#"{"target":{"kind":"background","pageId":"page"},"documentId":"document"}"#,
        ),
        Reply::Finished("Captured the fixture."),
    ]
    .into_iter();
    let mut chunk = None;
    let mut requests = Vec::new();
    let mut completed = 0;
    let mut accepted = false;
    let mut file_revealed = false;
    let mut image_update = None;
    while !accepted || image_update.is_none() || completed < 3 {
        let frame = client.read_frame().await;
        let params = &frame["params"];
        if frame["id"] == id {
            assert!(frame["result"].is_object(), "{frame}");
            accepted = true;
        }
        match frame["method"].as_str() {
            Some("_co.grida/provider/exchange") => {
                let result = match params["action"].as_str() {
                    Some("open") => {
                        let body = STANDARD
                            .decode(params["initial"].as_str().unwrap())
                            .unwrap();
                        requests.push(serde_json::from_slice::<Value>(&body).unwrap());
                        chunk = Some(STANDARD.encode(fixture_body(
                            replies.next().expect("one fixture reply per request"),
                            ProviderProtocol::Responses,
                        )));
                        json!({"status":"accepted"})
                    }
                    Some("dispatch") => json!({"status":"ready","httpStatus":200}),
                    Some("read") => match chunk.take() {
                        Some(data) => json!({"status":"chunk","data":data}),
                        None => json!({"status":"end"}),
                    },
                    _ => panic!("unexpected fixture exchange: {frame}"),
                };
                client.respond(&frame["id"], result).await;
            }
            Some("_co.grida/provider/cancel") => completed += 1,
            Some("_co.grida/editor/browser-tool") => {
                assert_eq!(params["sessionId"], session);
                assert_eq!(params["endpointId"], ENDPOINT);
                if params["operation"] == "surface_open" {
                    assert_eq!(
                        params["arguments"]["target"],
                        json!({"kind":"file","path":"/poster.canvas"})
                    );
                    file_revealed = true;
                    client
                        .respond(
                            &frame["id"],
                            json!({
                                "sessionId":session,"endpointId":ENDPOINT,"callId":params["callId"],
                                "result":{"disposition":"unknown"}
                            }),
                        )
                        .await;
                    continue;
                }
                assert_eq!(params["operation"], "browser_capture");
                assert_eq!(params["arguments"]["documentId"], "document");
                assert!(
                    params["timeoutMs"]
                        .as_u64()
                        .is_some_and(|ms| ms > 0 && ms < 8000)
                );
                client.respond(&frame["id"], json!({
                    "sessionId":session,"endpointId":ENDPOINT,"callId":params["callId"],
                    "result":{"disposition":"dispatched_verified","data":{"documentId":"document"},
                        "image":{"mimeType":"image/jpeg","base64":STANDARD.encode(&jpeg)}}
                })).await;
            }
            _ => {}
        }
        if params["update"]["rawOutput"]["images"].is_array() {
            image_update = Some(params.clone());
        }
    }
    assert!(file_revealed);
    assert_eq!(requests.len(), 3);
    let instructions = requests[0]["instructions"].as_str().unwrap();
    assert!(instructions.contains("first meaningful renderable checkpoint"));
    assert!(instructions.contains("For new browser work, use browser_open"));
    assert!(requests[0]["input"].to_string().contains("selected-step"));
    assert!(
        requests[0]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tool| tool["name"] == "browser_capture")
    );
    let inputs = requests[1]["input"].as_array().unwrap();
    let reveal_call = inputs
        .iter()
        .find(|item| item["type"] == "function_call" && item["name"] == "surface_open")
        .expect("recorded file reveal");
    let reveal_output = inputs
        .iter()
        .find(|item| {
            item["type"] == "function_call_output" && item["call_id"] == reveal_call["call_id"]
        })
        .expect("correlated file reveal result");
    let reveal_result: Value =
        serde_json::from_str(reveal_output["output"].as_str().unwrap()).unwrap();
    assert_eq!(reveal_result["status"], "uncertain");
    assert_eq!(reveal_result["structured"]["disposition"], "unknown");
    let pixels = requests[2]["input"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|part| part["output"].as_array().into_iter().flatten())
        .find_map(|part| {
            part["image_url"]
                .as_str()
                .and_then(|url| url.strip_prefix("data:image/png;base64,"))
        })
        .map(|data| STANDARD.decode(data).unwrap())
        .expect("retained PNG capture");
    let live = image_update.unwrap();
    let media = &live["update"]["rawOutput"]["images"][0];
    let namespace = media["mediaId"]
        .as_str()
        .unwrap()
        .strip_prefix("browser-capture/")
        .unwrap();
    assert!(uuid::Uuid::parse_str(namespace).is_ok());
    let read = client
        .request(
            READ,
            json!({
                "sessionId":session,
                "turnId":live["_meta"]["co.grida/session/updates"]["turnId"],
                "toolCallId":live["update"]["toolCallId"],
                "mediaId":media["mediaId"],"contentIndex":media["contentIndex"],"offset":0
            }),
        )
        .await;
    assert_eq!(
        STANDARD
            .decode(read["result"]["data"].as_str().unwrap())
            .unwrap(),
        pixels
    );
    let turn = live["_meta"]["co.grida/session/updates"]["turnId"]
        .as_str()
        .unwrap();
    let final_state = settled(&mut client, session).await;
    assert_eq!(final_state["latest"]["turnId"], turn);
    assert_eq!(final_state["latest"]["status"], "succeeded");
    for method in ["_co.grida/session/submit", "_co.grida/session/enqueue"] {
        let exact = submission("act-capture", "act");
        let retained = client.request(method, exact.clone()).await;
        assert_eq!(retained["result"]["turnId"], turn, "{retained}");
        assert_eq!(retained["result"]["disposition"], "completed", "{retained}");
        let mut changed = exact;
        changed["editorBrowserTools"] = false.into();
        let rejected = client.request(method, changed).await;
        assert_eq!(
            rejected["error"]["data"], "submission_browser_tools_changed",
            "{rejected}"
        );
    }
    assert!(client.finish().await.status.success());
}
