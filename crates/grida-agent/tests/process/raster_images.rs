//! Explicit raster inputs retain their original independently from perception.

use super::*;
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
use sha2::{Digest, Sha256};
use std::io::Cursor;

const SELECTED: &str = "co.grida/session/selected-image";
const CHUNKS: &str = "co.grida/session/input-image-chunks";
const QUEUED: &str = "co.grida/session/queued-input-image-chunks";

fn initialize() -> Value {
    let mut value = input_image_initialize();
    value["clientCapabilities"]["_meta"][SELECTED] = 1.into();
    value["clientCapabilities"]["_meta"][CHUNKS] = 1.into();
    value["clientCapabilities"]["_meta"][QUEUED] = 1.into();
    value
}

fn source(format: ImageFormat) -> Vec<u8> {
    let image = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(30, 20, Rgb([196, 52, 18])));
    let mut bytes = Cursor::new(Vec::new());
    image.write_to(&mut bytes, format).unwrap();
    bytes.into_inner()
}

async fn queued_message(
    client: &mut StdioClient,
    session: &str,
    input: &str,
    view: &Value,
) -> Value {
    client.request("_co.grida/session/queued-message", json!({
        "sessionId":session,"inputId":input,"expectedSessionRevision":view["sessionRevision"]
    })).await
}

async fn queued_image(
    client: &mut StdioClient,
    session: &str,
    input: &str,
    uri: &str,
    view: &Value,
    offset: usize,
) -> Value {
    client.request("_co.grida/session/read-queued-input-image-chunk", json!({
        "sessionId":session,"inputId":input,"expectedSessionRevision":view["sessionRevision"],
        "attachmentUri":uri,"offset":offset
    })).await
}

#[tokio::test]
async fn queued_original_reads_require_the_exact_waiting_input_and_revision_without_starting_work()
{
    let workspace = TempDir::new().unwrap();
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Hold("Holding existing work."),
            Reply::Hold("Claimed the queued image."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    let ready = client.request("initialize", initialize()).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][QUEUED], 1);
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    client
        .request(
            "_co.grida/session/submit",
            super::super::lifecycle::prompt_request(session, "active", "Wait."),
        )
        .await;
    endpoint.request().await;
    let mut originals = Vec::new();
    for (input, format, mime) in [
        ("png", ImageFormat::Png, "image/png"),
        ("jpeg", ImageFormat::Jpeg, "image/jpeg"),
        ("webp", ImageFormat::WebP, "image/webp"),
    ] {
        let path = workspace.path().join(input);
        let bytes = if input == "png" {
            let image = DynamicImage::ImageRgb8(ImageBuffer::from_fn(700, 600, |x, y| {
                Rgb([(x % 251) as u8, (y % 253) as u8, ((x * y) % 255) as u8])
            }));
            let mut bytes = Cursor::new(Vec::new());
            image.write_to(&mut bytes, format).unwrap();
            bytes.into_inner()
        } else {
            source(format)
        };
        if input == "png" {
            assert!(bytes.len() > 256 * 1024);
        }
        std::fs::write(&path, &bytes).unwrap();
        let mut supplied = request(session, input, &path, &bytes, "disk");
        supplied["prompt"] =
            json!([{"type":"text","text":"First line.\nSecond line.\nThird line."}]);
        let accepted = client.request("_co.grida/session/enqueue", supplied).await;
        assert_eq!(accepted["result"]["disposition"], "queued", "{accepted}");
        std::fs::remove_file(path).unwrap();
        originals.push((input, bytes, mime));
    }
    let path = workspace.path().join("image-only.png");
    let bytes = source(ImageFormat::Png);
    std::fs::write(&path, &bytes).unwrap();
    let mut only_image = request(session, "image-only", &path, &bytes, "disk");
    only_image["prompt"] = json!([]);
    let accepted = client
        .request("_co.grida/session/enqueue", only_image)
        .await;
    assert_eq!(accepted["result"]["disposition"], "queued", "{accepted}");
    let inspected = client
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"image-only"}),
        )
        .await;
    assert_eq!(inspected["result"]["prompt"].as_array().unwrap().len(), 1);
    assert_eq!(inspected["result"]["textOnly"], false);
    let text = client
        .request(
            "_co.grida/session/input",
            json!({"sessionId":session,"inputId":"active"}),
        )
        .await;
    assert_eq!(text["result"]["textOnly"], true);
    client
        .request(
            "_co.grida/session/enqueue",
            super::super::lifecycle::prompt_request(
                session,
                "plain-text",
                "A plain queued message.",
            ),
        )
        .await;
    let basis = snapshot(&mut client, session).await;
    let inspected = queued_message(&mut client, session, "image-only", &basis).await;
    assert_eq!(inspected["result"]["textOnly"], false);
    let inspected = queued_message(&mut client, session, "plain-text", &basis).await;
    assert_eq!(inspected["result"]["textOnly"], true);
    assert_eq!(
        inspected["result"]["prompt"][0]["text"],
        "A plain queued message."
    );
    client.request("_co.grida/session/withdraw", json!({"queue":queue_basis(&basis,session,"withdraw-image-only"),"inputId":"image-only"})).await;
    let basis = snapshot(&mut client, session).await;
    client.request("_co.grida/session/withdraw", json!({"queue":queue_basis(&basis,session,"withdraw-plain-text"),"inputId":"plain-text"})).await;
    let before = snapshot(&mut client, session).await;
    let mut uris = Vec::new();
    for (input, original, mime) in &originals {
        let inspected = queued_message(&mut client, session, input, &before).await;
        assert_eq!(inspected["result"]["inputId"], *input, "{inspected}");
        assert_eq!(inspected["result"]["textOnly"], false);
        let prompt = inspected["result"]["prompt"].as_array().unwrap();
        assert_eq!(prompt[0]["text"], "First line.\nSecond line.\nThird line.");
        assert_eq!(prompt[1]["type"], "resource_link");
        assert_eq!(prompt[1]["mimeType"], *mime);
        assert_eq!(prompt[1]["size"], original.len());
        assert!(prompt[1]["_meta"].is_null());
        assert!(
            !inspected
                .to_string()
                .contains(workspace.path().to_str().unwrap())
        );
        let uri = prompt[1]["uri"].as_str().unwrap().to_owned();
        let mut actual = Vec::new();
        loop {
            let read = queued_image(&mut client, session, input, &uri, &before, actual.len()).await;
            assert!(
                read["result"].is_object(),
                "queued original read refused: {read}"
            );
            assert_eq!(read["result"]["inputId"], *input, "{read}");
            assert_eq!(read["result"]["mimeType"], *mime);
            assert_eq!(read["result"]["totalBytes"], original.len());
            let bytes = STANDARD
                .decode(read["result"]["data"].as_str().unwrap())
                .unwrap();
            assert!(bytes.len() <= 256 * 1024);
            actual.extend(bytes);
            if read["result"]["nextOffset"].is_null() {
                break;
            }
            assert_eq!(read["result"]["nextOffset"], actual.len());
        }
        assert_eq!(&actual, original);
        let legacy = client
            .request(
                "_co.grida/session/input",
                json!({"sessionId":session,"inputId":input}),
            )
            .await;
        assert_eq!(legacy["result"]["textOnly"], false);
        uris.push(uri);
    }
    assert_eq!(snapshot(&mut client, session).await, before);
    assert!(endpoint.requests.try_recv().is_err());
    let owner = std::fs::read_dir(state.join("retained-inputs"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let webp_source = std::fs::read_dir(owner.join("sources"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| std::fs::read(path).is_ok_and(|bytes| bytes.ends_with(&originals[2].1)))
        .unwrap();
    let hidden = webp_source.with_extension("preview-fixture-moved");
    std::fs::rename(&webp_source, &hidden).unwrap();
    assert_eq!(
        queued_image(&mut client, session, "webp", &uris[2], &before, 0).await["error"]["data"],
        "queued_input_image_unavailable"
    );
    std::fs::rename(hidden, webp_source).unwrap();
    assert_eq!(
        queued_image(&mut client, session, "jpeg", &uris[0], &before, 0).await["error"]["data"],
        "queued_input_image_unavailable"
    );
    assert_eq!(
        queued_image(&mut client, session, "png", &uris[0], &before, 1).await["error"]["data"],
        "queued_input_image_unavailable"
    );
    let foreign = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let foreign_session = foreign["result"]["sessionId"].as_str().unwrap();
    let foreign_view = snapshot(&mut client, foreign_session).await;
    assert_eq!(
        queued_image(
            &mut client,
            foreign_session,
            "png",
            &uris[0],
            &foreign_view,
            0
        )
        .await["error"]["data"],
        "queued_input_image_unavailable"
    );
    client
        .request(
            "_co.grida/session/withdraw",
            json!({"queue":queue_basis(&before,session,"withdraw-png"),"inputId":"png"}),
        )
        .await;
    let after = snapshot(&mut client, session).await;
    assert_eq!(
        queued_message(&mut client, session, "jpeg", &before).await["error"]["data"],
        "queued_input_image_unavailable"
    );
    assert_eq!(
        queued_image(&mut client, session, "jpeg", &uris[1], &before, 0).await["error"]["data"],
        "queued_input_image_unavailable"
    );
    assert_eq!(
        queued_image(&mut client, session, "png", &uris[0], &after, 0).await["error"]["data"],
        "queued_input_image_unavailable"
    );
    client
        .request(
            "_co.grida/session/stop",
            task_basis(&after, session, "hold-queue"),
        )
        .await;
    let held = settled(&mut client, session).await;
    client
        .request(
            "_co.grida/session/resume-queue",
            queue_basis(&held, session, "claim-jpeg"),
        )
        .await;
    endpoint.request().await;
    let claimed = snapshot(&mut client, session).await;
    assert_eq!(
        queued_image(&mut client, session, "jpeg", &uris[1], &claimed, 0).await["error"]["data"],
        "queued_input_image_unavailable"
    );
    assert_eq!(
        queued_message(&mut client, session, "jpeg", &claimed).await["error"]["data"],
        "queued_input_image_unavailable"
    );
    client.close().await;
    let mut old = stdio(
        &directory.path().join("old-client"),
        &endpoint.url,
        IMAGE_MODEL,
    );
    old.request("initialize", input_image_initialize()).await;
    let created = old
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let view = snapshot(&mut old, session).await;
    assert_eq!(
        queued_message(&mut old, session, "png", &view).await["error"]["code"],
        -32601
    );
    assert_eq!(
        queued_image(&mut old, session, "png", &uris[0], &view, 0).await["error"]["code"],
        -32601
    );
    old.close().await;
    endpoint.done().await;
}

fn request(session: &str, input: &str, path: &Path, bytes: &[u8], source: &str) -> Value {
    let digest: [u8; 32] = Sha256::digest(bytes).into();
    json!({"sessionId":session,"inputId":input,
        "prompt":[{"type":"text","text":"Describe this attached image."}],
        "selectedImage":{"path":path,"sha256":digest,"name":"chosen-picture.jpg","source":source}})
}

fn image_pixels(value: &Value) -> Option<Vec<u8>> {
    match value {
        Value::String(text) => text
            .strip_prefix("data:image/png;base64,")
            .and_then(|data| STANDARD.decode(data).ok()),
        Value::Array(values) => values.iter().find_map(image_pixels),
        Value::Object(fields) => fields.values().find_map(image_pixels),
        _ => None,
    }
}

async fn identity(
    client: &mut StdioClient,
    session: &str,
    cwd: &Path,
    mime: &str,
) -> (String, String, Value) {
    let id = client
        .send(
            "session/load",
            json!({"sessionId":session,"cwd":cwd,"mcpServers":[]}),
        )
        .await;
    let mut selected = None;
    loop {
        let frame = client.read_frame().await;
        if frame["id"] == id {
            assert!(frame["result"].is_object(), "{frame}");
            break;
        }
        let update = &frame["params"]["update"];
        if update["sessionUpdate"] == "user_message_chunk"
            && update["content"]["type"] == "resource_link"
            && update["content"]["mimeType"] == mime
        {
            selected = Some((
                update["messageId"].as_str().unwrap().into(),
                update["content"]["uri"].as_str().unwrap().into(),
                update["content"].clone(),
            ));
        }
    }
    selected.expect("recorded raster attachment")
}

#[tokio::test]
async fn selected_jpeg_supplies_pixels_and_verified_path_then_reopens_exact_original() {
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let workspace = TempDir::new().unwrap();
    let path = workspace.path().join("misleading-extension.txt");
    let original = source(ImageFormat::Jpeg);
    std::fs::write(&path, &original).unwrap();
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Finished("Observed the red image."),
            Reply::Finished("The old image is retained but unavailable to this model."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    let ready = client.request("initialize", initialize()).await;
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][SELECTED], 1);
    assert_eq!(ready["result"]["agentCapabilities"]["_meta"][CHUNKS], 1);
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let submitted = request(session, "selected-jpeg", &path, &original, "disk");
    let accepted = client
        .request("_co.grida/session/submit", submitted.clone())
        .await;
    assert!(accepted["result"].is_object(), "{accepted}");
    let inference = endpoint.request().await;
    assert!(inference.to_string().contains(path.to_str().unwrap()));
    let pixels =
        image::load_from_memory(&image_pixels(&inference).expect("actual image wire bytes"))
            .unwrap()
            .to_rgb8();
    let actual = pixels.get_pixel(0, 0).0;
    assert!(actual[0] > 180 && actual[1] < 70 && actual[2] < 40);
    assert!(
        !inference
            .to_string()
            .contains("chosen-picture.jpg\",\"path")
    );
    assert_eq!(
        settled(&mut client, session).await["latest"]["status"],
        "succeeded"
    );
    let (message, uri, link) = identity(&mut client, session, workspace.path(), "image/jpeg").await;
    assert_eq!(link["name"], "chosen-picture.jpg");
    assert_eq!(link["size"], original.len());
    assert_eq!(
        link["_meta"]["co.grida/image-attachment"]["sourcePath"],
        path.to_str().unwrap()
    );
    assert_eq!(
        link["_meta"]["co.grida/image-attachment"]["preparation"]["imageCount"],
        1
    );
    let before = snapshot(&mut client, session).await;
    std::fs::remove_file(&path).unwrap();
    let read = client
        .request(
            "_co.grida/session/read-input-image-chunk",
            json!({"sessionId":session,"messageId":message,"attachmentUri":uri,"offset":0}),
        )
        .await;
    assert_eq!(read["result"]["mimeType"], "image/jpeg", "{read}");
    assert_eq!(read["result"]["totalBytes"], original.len());
    assert!(read["result"]["nextOffset"].is_null());
    assert_eq!(
        STANDARD
            .decode(read["result"]["data"].as_str().unwrap())
            .unwrap(),
        original
    );
    assert_eq!(
        read_input_image(&mut client, session, &message, &uri).await["error"]["data"],
        "input_image_unavailable"
    );
    assert_eq!(snapshot(&mut client, session).await, before);
    let retried = client.request("_co.grida/session/submit", submitted).await;
    assert_eq!(
        retried["result"]["inputPosition"],
        accepted["result"]["inputPosition"]
    );
    assert_eq!(retried["result"]["turnId"], accepted["result"]["turnId"]);
    client.close().await;

    let mut reopened = stdio(&state, &endpoint.url, "fixture-text-only");
    reopened.request("initialize", initialize()).await;
    reopened
        .request(
            "session/load",
            json!({"sessionId":session,"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let read = reopened
        .request(
            "_co.grida/session/read-input-image-chunk",
            json!({"sessionId":session,"messageId":message,"attachmentUri":uri,"offset":0}),
        )
        .await;
    assert_eq!(read["result"]["mimeType"], "image/jpeg", "{read}");
    assert_eq!(
        STANDARD
            .decode(read["result"]["data"].as_str().unwrap())
            .unwrap(),
        original
    );
    assert!(endpoint.requests.try_recv().is_err());
    let followup = reopened
        .request(
            "_co.grida/session/submit",
            super::super::lifecycle::prompt_request(
                session,
                "text-only-followup",
                "Continue with this text-only model.",
            ),
        )
        .await;
    assert!(followup["result"].is_object(), "{followup}");
    let text_only = endpoint.request().await;
    assert!(image_pixels(&text_only).is_none());
    assert!(text_only.to_string().contains("pixels are omitted"));
    assert!(text_only.to_string().contains("not been inspected"));
    assert_eq!(
        settled(&mut reopened, session).await["latest"]["status"],
        "succeeded"
    );
    reopened.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn selected_image_refusals_keep_text_and_resources_unaccepted() {
    let workspace = TempDir::new().unwrap();
    let directory = TempDir::new().unwrap();
    let path = workspace.path().join("selected.jpg");
    let bytes = source(ImageFormat::Jpeg);
    std::fs::write(&path, &bytes).unwrap();
    let mut endpoint =
        Endpoint::start_protocol(ProviderProtocol::Responses, vec![], Some(TEST_CREDENTIAL)).await;
    for (model, expected) in [
        (IMAGE_MODEL, "selected_image_changed"),
        ("fixture-text-only", "image_input_unavailable"),
    ] {
        let state = directory.path().join(model);
        let mut client = stdio(&state, &endpoint.url, model);
        client.request("initialize", initialize()).await;
        let created = client
            .request(
                "session/new",
                json!({"cwd":workspace.path(),"mcpServers":[]}),
            )
            .await;
        let session = created["result"]["sessionId"].as_str().unwrap();
        let mut supplied = request(session, "not-accepted", &path, &bytes, "disk");
        supplied["selectedImage"]["sha256"] = json!(vec![0; 32]);
        let refused = client.request("_co.grida/session/submit", supplied).await;
        assert_eq!(refused["error"]["data"], expected, "{refused}");
        let view = snapshot(&mut client, session).await;
        assert!(view["current"].is_null() && view["latest"].is_null());
        assert!(view["queue"].as_array().unwrap().is_empty());
        assert!(endpoint.requests.try_recv().is_err());
        client.close().await;
    }
    endpoint.done().await;
}

#[tokio::test]
async fn snapshot_claims_cannot_ingest_arbitrary_or_protected_files() {
    let workspace = TempDir::new().unwrap();
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let path = workspace.path().join("clipboard.jpg");
    let bytes = source(ImageFormat::Jpeg);
    std::fs::write(&path, &bytes).unwrap();
    let mut endpoint =
        Endpoint::start_protocol(ProviderProtocol::Responses, vec![], Some(TEST_CREDENTIAL)).await;
    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    client.request("initialize", initialize()).await;
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let refused = client
        .request(
            "_co.grida/session/submit",
            request(session, "fake-snapshot", &path, &bytes, "snapshot"),
        )
        .await;
    assert_eq!(
        refused["error"]["data"], "selected_image_snapshot_unavailable",
        "{refused}"
    );
    let protected = state.join("private.jpg");
    std::fs::write(&protected, &bytes).unwrap();
    let refused = client
        .request(
            "_co.grida/session/submit",
            request(session, "protected-disk", &protected, &bytes, "disk"),
        )
        .await;
    assert_eq!(
        refused["error"]["data"], "protected_root_overlap",
        "{refused}"
    );
    assert!(snapshot(&mut client, session).await["latest"].is_null());
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}

#[tokio::test]
async fn protected_clipboard_snapshot_has_truthful_identity_and_chunked_exact_original() {
    use std::os::unix::fs::PermissionsExt;
    let workspace = TempDir::new().unwrap();
    let directory = TempDir::new().unwrap();
    let state = directory.path().join("state");
    let mut endpoint = Endpoint::start_protocol(
        ProviderProtocol::Responses,
        vec![
            Reply::Finished("Observed the clipboard image."),
            Reply::Finished("Observed the second image."),
            Reply::Finished("Observed the third image."),
            Reply::Finished("Observed the fourth image."),
        ],
        Some(TEST_CREDENTIAL),
    )
    .await;
    let mut client = stdio(&state, &endpoint.url, IMAGE_MODEL);
    client.request("initialize", initialize()).await;
    let created = client
        .request(
            "session/new",
            json!({"cwd":workspace.path(),"mcpServers":[]}),
        )
        .await;
    let session = created["result"]["sessionId"].as_str().unwrap();
    let custody = state.canonicalize().unwrap().join("desktop-image-custody");
    let snapshots = custody.join("snapshots");
    for path in [&custody, &snapshots] {
        std::fs::create_dir(path).unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).unwrap();
    }
    let path = snapshots.join("clipboard-source");
    let image = DynamicImage::ImageRgb8(ImageBuffer::from_fn(1700, 1300, |x, y| {
        Rgb([(x % 251) as u8, (y % 253) as u8, ((x * y) % 255) as u8])
    }));
    let mut original = Cursor::new(Vec::new());
    image.write_to(&mut original, ImageFormat::Png).unwrap();
    let original = original.into_inner();
    assert!(original.len() > 256 * 1024);
    std::fs::write(&path, &original).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
    let accepted = client
        .request(
            "_co.grida/session/submit",
            request(session, "clipboard", &path, &original, "snapshot"),
        )
        .await;
    assert!(accepted["result"].is_object(), "{accepted}");
    let inference = endpoint.request().await;
    assert!(!inference.to_string().contains(path.to_str().unwrap()));
    assert!(
        inference
            .to_string()
            .contains("No original local path was supplied")
    );
    assert!(image_pixels(&inference).unwrap().len() <= 384 * 1024);
    assert_eq!(
        settled(&mut client, session).await["latest"]["status"],
        "succeeded"
    );
    let (message, uri, link) = identity(&mut client, session, workspace.path(), "image/png").await;
    assert!(link["_meta"]["co.grida/image-attachment"]["sourcePath"].is_null());
    std::fs::remove_file(&path).unwrap();
    let mut actual = Vec::new();
    let mut offset = 0;
    loop {
        let read = client.request("_co.grida/session/read-input-image-chunk",
            json!({"sessionId":session,"messageId":message,"attachmentUri":uri,"offset":offset})).await;
        let result = &read["result"];
        assert_eq!(result["offset"], offset, "{read}");
        assert_eq!(result["totalBytes"], original.len());
        assert_eq!(result["mimeType"], "image/png");
        let chunk = STANDARD.decode(result["data"].as_str().unwrap()).unwrap();
        assert!(chunk.len() <= 256 * 1024);
        actual.extend(chunk);
        let Some(next) = result["nextOffset"].as_u64() else {
            break;
        };
        assert_eq!(next, offset + 256 * 1024);
        offset = next;
    }
    assert_eq!(actual, original);
    // Normal photo history must not exhaust a 1 MiB transport after one or two
    // derivatives. Repeated inputs keep all four frozen views in the request.
    let disk = workspace.path().join("repeated-source.png");
    std::fs::write(&disk, &original).unwrap();
    let mut last = Value::Null;
    for input in ["second-image", "third-image", "fourth-image"] {
        let accepted = client
            .request(
                "_co.grida/session/submit",
                request(session, input, &disk, &original, "disk"),
            )
            .await;
        assert!(accepted["result"].is_object(), "{accepted}");
        last = endpoint.request().await;
        assert_eq!(
            settled(&mut client, session).await["latest"]["status"],
            "succeeded"
        );
    }
    let encoded_request = serde_json::to_vec(&last).unwrap();
    assert!(
        encoded_request.len() > 1024 * 1024,
        "photo request bytes: {}",
        encoded_request.len()
    );
    assert!(encoded_request.len() <= 8 * 1024 * 1024);
    assert_eq!(
        last.to_string().matches("data:image/png;base64,").count(),
        4
    );
    assert!(endpoint.requests.try_recv().is_err());
    client.close().await;
    endpoint.done().await;
}
