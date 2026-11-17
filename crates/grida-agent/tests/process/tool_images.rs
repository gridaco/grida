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
