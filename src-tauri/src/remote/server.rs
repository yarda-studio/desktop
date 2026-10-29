use super::output;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const PAGE: &str = include_str!("remote.html");
const PREFERRED_PORT: u16 = 8420;
const MAX_BODY: u64 = 1024;
const MAX_SNAPSHOT_BYTES: usize = 32 * 1024;

/// Everything the phone is allowed to ask for. Anything else is rejected before
/// it reaches the app.
const ACTIONS: &[&str] = &[
    "next",
    "prev",
    "black",
    "clear",
    "standby",
    "timer-toggle",
    "timer-reset",
];

#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
struct Config {
    /// Secret for the phone remote.
    token: String,
    enabled: bool,
    /// Separate secret for the web outputs, so sharing an output link never hands out the remote.
    output_token: String,
    output_enabled: bool,
}

/// What the server thread reads on every request. Held behind one Arc so turning a
/// feature on or off, or replacing a secret, takes effect at once without a restart.
#[derive(Default)]
struct Shared {
    remote_on: AtomicBool,
    output_on: AtomicBool,
    remote_token: Mutex<String>,
    output_token: Mutex<String>,
    snapshot: Mutex<String>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}

struct Running {
    stop: Arc<AtomicBool>,
    handle: JoinHandle<()>,
    port: u16,
}

struct Inner {
    config: Config,
    path: PathBuf,
    running: Option<Running>,
}

/// The local-network server behind the phone remote and the web outputs. It is
/// only listening while at least one of them is on.
pub struct RemoteServer {
    inner: Mutex<Inner>,
    shared: Arc<Shared>,
}

#[derive(Serialize)]
pub struct RemoteStatus {
    pub enabled: bool,
    /// The pairing link, while the server is running.
    pub url: Option<String>,
    /// The same link as an SVG QR code.
    pub qr_svg: Option<String>,
}

#[derive(Serialize)]
pub struct OutputStatus {
    pub enabled: bool,
    /// The congregation output, for a video mixer's browser source.
    pub output_url: Option<String>,
    /// The same output with a transparent background, for keying over video.
    pub alpha_url: Option<String>,
    /// The worship team's stage display.
    pub stage_url: Option<String>,
}

fn new_token() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).map_err(|e| format!("could not generate a secret: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

pub(super) fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub(super) fn query_param<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then_some(v)
    })
}

/// This machine's address on the local network, found by asking the OS which
/// interface it would use to reach the internet (no packet is actually sent).
fn local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

pub struct Reply {
    pub status: u16,
    pub content_type: &'static str,
    pub body: String,
    /// A command to forward to the app.
    pub action: Option<&'static str>,
}

fn reply(status: u16, content_type: &'static str, body: impl Into<String>) -> Reply {
    Reply {
        status,
        content_type,
        body: body.into(),
        action: None,
    }
}

/// Decide what to answer. Pure, so the access rules can be tested without a socket.
pub fn handle(
    method: &str,
    url: &str,
    body: &str,
    token: &str,
    snapshot: &str,
    now_ms: u128,
) -> Reply {
    let (path, query) = url.split_once('?').unwrap_or((url, ""));
    let supplied = query_param(query, "k").unwrap_or("");
    if token.is_empty() || !constant_time_eq(supplied, token) {
        return reply(403, "text/plain; charset=utf-8", "Forbidden");
    }
    match (method, path) {
        ("GET", "/") => reply(200, "text/html; charset=utf-8", PAGE),
        ("GET", "/api/state") => {
            let state = if snapshot.is_empty() {
                "null"
            } else {
                snapshot
            };
            reply(
                200,
                "application/json",
                format!("{{\"now\":{now_ms},\"state\":{state}}}"),
            )
        }
        ("POST", "/api/command") => {
            let action = serde_json::from_str::<serde_json::Value>(body)
                .ok()
                .and_then(|v| v.get("action").and_then(|a| a.as_str().map(str::to_owned)));
            match action
                .as_deref()
                .and_then(|a| ACTIONS.iter().find(|known| **known == a))
            {
                Some(known) => Reply {
                    action: Some(known),
                    ..reply(204, "text/plain", "")
                },
                None => reply(400, "text/plain; charset=utf-8", "Unknown command"),
            }
        }
        _ => reply(404, "text/plain; charset=utf-8", "Not found"),
    }
}

fn header(name: &str, value: &str) -> tiny_http::Header {
    tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes())
        .expect("static header is valid")
}

const SECURITY_HEADERS: [(&str, &str); 2] = [
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "no-referrer"),
];

fn respond_remote(request: tiny_http::Request, out: Reply) {
    let response = tiny_http::Response::from_string(out.body)
        .with_status_code(out.status)
        .with_header(header("Content-Type", out.content_type))
        .with_header(header("Cache-Control", "no-store"))
        .with_header(header(
            "Content-Security-Policy",
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
        ));
    let response = SECURITY_HEADERS
        .iter()
        .fold(response, |r, (n, v)| r.with_header(header(n, v)));
    let _ = request.respond(response);
}

fn respond_output(request: tiny_http::Request, out: output::Out) {
    use std::io::{Seek, SeekFrom};
    let status = tiny_http::StatusCode(out.status);
    let mut headers = vec![header("Content-Type", &out.content_type)];
    headers.extend(out.headers.iter().map(|(n, v)| header(n, v)));
    headers.extend(SECURITY_HEADERS.iter().map(|(n, v)| header(n, v)));
    match out.body {
        output::Body::Text(t) => {
            let _ = request.respond(tiny_http::Response::new(
                status,
                headers,
                std::io::Cursor::new(t.clone()),
                Some(t.len()),
                None,
            ));
        }
        output::Body::Bytes(b) => {
            let _ = request.respond(tiny_http::Response::new(
                status,
                headers,
                std::io::Cursor::new(b.clone()),
                Some(b.len()),
                None,
            ));
        }
        output::Body::File {
            path, start, len, ..
        } => {
            let file = std::fs::File::open(&path)
                .and_then(|mut f| f.seek(SeekFrom::Start(start)).map(|_| f));
            match file {
                Ok(f) => {
                    let _ = request.respond(tiny_http::Response::new(
                        status,
                        headers,
                        f.take(len),
                        Some(len as usize),
                        None,
                    ));
                }
                Err(_) => {
                    let _ = request.respond(
                        tiny_http::Response::from_string("Not found").with_status_code(404),
                    );
                }
            }
        }
    }
}

fn serve(server: tiny_http::Server, stop: Arc<AtomicBool>, shared: Arc<Shared>, app: AppHandle) {
    let backend = AppBackend { app: app.clone() };
    while !stop.load(Ordering::Relaxed) {
        let mut request = match server.recv_timeout(Duration::from_millis(250)) {
            Ok(Some(r)) => r,
            Ok(None) => continue,
            Err(_) => break,
        };
        let method = request.method().as_str().to_owned();
        let url = request.url().to_owned();
        let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));

        if output::is_output_path(path) {
            let range = request
                .headers()
                .iter()
                .find(|h| h.field.equiv("Range"))
                .map(|h| h.value.as_str().to_owned());
            let token = if shared.output_on.load(Ordering::Relaxed) {
                lock(&shared.output_token).clone()
            } else {
                String::new()
            };
            let out = output::handle(&method, path, query, range.as_deref(), &token, &backend);
            respond_output(request, out);
            continue;
        }

        let mut body = String::new();
        let _ = request.as_reader().take(MAX_BODY).read_to_string(&mut body);
        let token = if shared.remote_on.load(Ordering::Relaxed) {
            lock(&shared.remote_token).clone()
        } else {
            String::new()
        };
        let snap = lock(&shared.snapshot).clone();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let out = handle(&method, &url, &body, &token, &snap, now);
        if let Some(action) = out.action {
            let _ = app.emit("remote-command", action);
        }
        respond_remote(request, out);
    }
}

/// The running app, as the web outputs see it.
struct AppBackend {
    app: AppHandle,
}

impl output::OutputBackend for AppBackend {
    fn asset(&self, path: &str) -> Option<(Vec<u8>, String)> {
        if let Some(asset) = self.app.asset_resolver().get(path.to_string()) {
            return Some((asset.bytes, asset.mime_type));
        }
        // `tauri dev` serves the front end from Vite, so fall back to a local build.
        #[cfg(debug_assertions)]
        {
            let file = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../dist")
                .join(path);
            if let Ok(bytes) = std::fs::read(&file) {
                let mime = match file.extension().and_then(|e| e.to_str()) {
                    Some("html") => "text/html",
                    Some("js") => "text/javascript",
                    Some("css") => "text/css",
                    Some("woff2") => "font/woff2",
                    _ => "application/octet-stream",
                };
                return Some((bytes, mime.to_string()));
            }
        }
        None
    }

    fn state(&self, since: i64) -> String {
        let version = self.app.state::<crate::commands::OutputVersion>().get();
        if since == version as i64 {
            return format!("{{\"changed\":false,\"v\":{version}}}");
        }
        let json = |m: &Mutex<Option<serde_json::Value>>| {
            lock(m)
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_else(|| "null".into())
        };
        let presentation = json(&self.app.state::<crate::commands::PresentationState>().0);
        let countdown = json(&self.app.state::<crate::commands::CountdownState>().0);
        format!("{{\"changed\":true,\"v\":{version},\"presentation\":{presentation},\"countdown\":{countdown}}}")
    }

    fn chapter(&self, module: &str, book: &str, chapter: u32) -> Result<String, String> {
        let registry = self.app.state::<Arc<crate::modules::ModuleRegistry>>();
        let chapters = self.app.state::<crate::commands::ChapterCache>();
        let files = self.app.state::<crate::sword::file_cache::FileCache>();
        let text =
            crate::commands::load_chapter(&registry, &chapters, &files, module, book, chapter)
                .map_err(|e| e.to_string())?;
        serde_json::to_string(&text).map_err(|e| e.to_string())
    }

    fn media(&self, name: &str) -> Option<PathBuf> {
        if !crate::commands::is_valid_media_name(name) {
            return None;
        }
        let file = self
            .app
            .path()
            .app_data_dir()
            .ok()?
            .join("media")
            .join(name);
        file.is_file().then_some(file)
    }
}

impl RemoteServer {
    /// Load the saved secrets and on/off choices. Never fails: a missing or corrupt file just means "off, new secrets".
    pub fn load(data_dir: &std::path::Path) -> Self {
        let path = data_dir.join("remote.json");
        let mut config: Config = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        if config.token.len() != 32 {
            config.token = new_token().unwrap_or_default();
        }
        if config.output_token.len() != 32 {
            config.output_token = new_token().unwrap_or_default();
        }
        let shared = Arc::new(Shared::default());
        shared.remote_on.store(config.enabled, Ordering::Relaxed);
        shared
            .output_on
            .store(config.output_enabled, Ordering::Relaxed);
        *lock(&shared.remote_token) = config.token.clone();
        *lock(&shared.output_token) = config.output_token.clone();
        Self {
            inner: Mutex::new(Inner {
                config,
                path,
                running: None,
            }),
            shared,
        }
    }

    fn inner(&self) -> MutexGuard<'_, Inner> {
        lock(&self.inner)
    }

    fn save(inner: &Inner) {
        if let Ok(json) = serde_json::to_string(&inner.config) {
            if std::fs::write(&inner.path, json).is_ok() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(
                        &inner.path,
                        std::fs::Permissions::from_mode(0o600),
                    );
                }
            }
        }
    }

    /// Start the server if the saved choices say it should be on (called at launch).
    pub fn start_if_enabled(&self, app: &AppHandle) {
        if let Err(e) = self.sync(app) {
            log::warn!("[remote] could not start: {e}");
        }
    }

    /// Listen while either feature is on, and stop when neither is.
    fn sync(&self, app: &AppHandle) -> Result<(), String> {
        let mut inner = self.inner();
        let wanted = inner.config.enabled || inner.config.output_enabled;
        if wanted && inner.running.is_none() {
            let server = tiny_http::Server::http(("0.0.0.0", PREFERRED_PORT))
                .or_else(|_| tiny_http::Server::http(("0.0.0.0", 0)))
                .map_err(|e| format!("could not start the server: {e}"))?;
            let port = server
                .server_addr()
                .to_ip()
                .map(|a| a.port())
                .unwrap_or(PREFERRED_PORT);
            let stop = Arc::new(AtomicBool::new(false));
            let handle = {
                let (stop, shared, app) = (stop.clone(), self.shared.clone(), app.clone());
                std::thread::spawn(move || serve(server, stop, shared, app))
            };
            inner.running = Some(Running { stop, handle, port });
        } else if !wanted {
            if let Some(running) = inner.running.take() {
                running.stop.store(true, Ordering::Relaxed);
                let _ = running.handle.join();
            }
        }
        Ok(())
    }

    pub fn set_enabled(&self, enabled: bool, app: &AppHandle) -> Result<(), String> {
        {
            let mut inner = self.inner();
            inner.config.enabled = enabled;
            self.shared.remote_on.store(enabled, Ordering::Relaxed);
            Self::save(&inner);
        }
        self.sync(app)
    }

    pub fn set_output_enabled(&self, enabled: bool, app: &AppHandle) -> Result<(), String> {
        {
            let mut inner = self.inner();
            inner.config.output_enabled = enabled;
            self.shared.output_on.store(enabled, Ordering::Relaxed);
            Self::save(&inner);
        }
        self.sync(app)
    }

    /// Replace the remote's secret: every phone paired with the old link stops working.
    pub fn reset_token(&self) -> Result<(), String> {
        let token = new_token()?;
        let mut inner = self.inner();
        inner.config.token = token.clone();
        *lock(&self.shared.remote_token) = token;
        Self::save(&inner);
        Ok(())
    }

    /// Replace the outputs' secret: every browser source using the old link goes blank.
    pub fn reset_output_token(&self) -> Result<(), String> {
        let token = new_token()?;
        let mut inner = self.inner();
        inner.config.output_token = token.clone();
        *lock(&self.shared.output_token) = token;
        Self::save(&inner);
        Ok(())
    }

    pub fn publish(&self, json: String) -> Result<(), String> {
        if json.len() > MAX_SNAPSHOT_BYTES {
            return Err("remote state is too large".into());
        }
        serde_json::from_str::<serde_json::Value>(&json)
            .map_err(|e| format!("remote state is not JSON: {e}"))?;
        *lock(&self.shared.snapshot) = json;
        Ok(())
    }

    fn base_url(inner: &Inner) -> Option<String> {
        let port = inner.running.as_ref()?.port;
        Some(format!(
            "http://{}:{port}",
            local_ip().unwrap_or_else(|| "localhost".into())
        ))
    }

    pub fn status(&self) -> RemoteStatus {
        let inner = self.inner();
        let enabled = inner.config.enabled && inner.running.is_some();
        let url = enabled
            .then(|| Self::base_url(&inner).map(|b| format!("{b}/?k={}", inner.config.token)))
            .flatten();
        let qr_svg = url.as_deref().and_then(|u| {
            qrcode::QrCode::new(u.as_bytes()).ok().map(|code| {
                code.render::<qrcode::render::svg::Color>()
                    .min_dimensions(220, 220)
                    .quiet_zone(true)
                    .dark_color(qrcode::render::svg::Color("#000000"))
                    .light_color(qrcode::render::svg::Color("#ffffff"))
                    .build()
            })
        });
        RemoteStatus {
            enabled,
            url,
            qr_svg,
        }
    }

    pub fn output_status(&self) -> OutputStatus {
        let inner = self.inner();
        let enabled = inner.config.output_enabled && inner.running.is_some();
        let base = enabled.then(|| Self::base_url(&inner)).flatten();
        let token = &inner.config.output_token;
        OutputStatus {
            enabled,
            output_url: base.as_ref().map(|b| format!("{b}/o/?k={token}")),
            alpha_url: base.as_ref().map(|b| format!("{b}/o/?k={token}&alpha=1")),
            stage_url: base.as_ref().map(|b| format!("{b}/o/stage?k={token}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef";

    fn get(url: &str) -> Reply {
        handle("GET", url, "", TOKEN, "", 1000)
    }

    #[test]
    fn rejects_requests_without_the_secret() {
        assert_eq!(get("/").status, 403);
        assert_eq!(get("/?k=wrong").status, 403);
        assert_eq!(
            get("/?k=0123456789abcdef0123456789abcde").status,
            403,
            "shorter prefix"
        );
        assert_eq!(get("/api/state").status, 403);
        assert_eq!(
            handle("POST", "/api/command", r#"{"action":"next"}"#, TOKEN, "", 0).status,
            403
        );
        assert_eq!(
            handle("GET", &format!("/?k={TOKEN}"), "", "", "", 0).status,
            403,
            "empty server token never matches"
        );
    }

    #[test]
    fn serves_page_and_state_with_the_secret() {
        let page = get(&format!("/?k={TOKEN}"));
        assert_eq!(page.status, 200);
        assert!(page.body.contains("<html"));

        let state = handle(
            "GET",
            &format!("/api/state?k={TOKEN}"),
            "",
            TOKEN,
            r#"{"tab":"songs"}"#,
            42,
        );
        assert_eq!(state.body, r#"{"now":42,"state":{"tab":"songs"}}"#);
        let empty = get(&format!("/api/state?k={TOKEN}"));
        assert_eq!(empty.body, r#"{"now":1000,"state":null}"#);
    }

    #[test]
    fn forwards_only_known_commands() {
        let url = format!("/api/command?k={TOKEN}");
        for action in ACTIONS {
            let r = handle(
                "POST",
                &url,
                &format!(r#"{{"action":"{action}"}}"#),
                TOKEN,
                "",
                0,
            );
            assert_eq!((r.status, r.action), (204, Some(*action)));
        }
        for bad in [
            r#"{"action":"rm -rf"}"#,
            r#"{"action":5}"#,
            "{}",
            "not json",
            "",
        ] {
            let r = handle("POST", &url, bad, TOKEN, "", 0);
            assert_eq!((r.status, r.action), (400, None), "{bad}");
        }
        assert_eq!(
            handle("GET", &url, "", TOKEN, "", 0).status,
            404,
            "commands are POST only"
        );
        assert_eq!(get(&format!("/other?k={TOKEN}")).status, 404);
    }

    #[test]
    fn publish_validates_and_status_reports_off_by_default() {
        let dir = std::env::temp_dir().join(format!("scriptura-remote-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let remote = RemoteServer::load(&dir);
        assert!(remote.publish("not json".into()).is_err());
        assert!(remote.publish("x".repeat(MAX_SNAPSHOT_BYTES + 1)).is_err());
        assert!(remote.publish(r#"{"ok":true}"#.into()).is_ok());
        let status = remote.status();
        assert!(!status.enabled && status.url.is_none() && status.qr_svg.is_none());
        let _ = std::fs::remove_dir_all(dir);
    }

    /// The real HTTP path end to end: a tiny_http server answering through the same
    /// `output::handle` and `respond_output` the app uses, with a stand-in backend.
    #[test]
    fn web_outputs_over_a_real_socket() {
        use std::io::{Read, Write};

        struct Backend(PathBuf);
        impl output::OutputBackend for Backend {
            fn asset(&self, path: &str) -> Option<(Vec<u8>, String)> {
                (path == "index.html").then(|| {
                    (
                        b"<html><head></head><body>hi</body></html>".to_vec(),
                        "text/html".into(),
                    )
                })
            }
            fn state(&self, _since: i64) -> String {
                "{\"changed\":false,\"v\":1}".into()
            }
            fn chapter(&self, _m: &str, _b: &str, _c: u32) -> Result<String, String> {
                Err("none".into())
            }
            fn media(&self, name: &str) -> Option<PathBuf> {
                (name == "bg-1.mp4").then(|| self.0.clone())
            }
        }

        let dir =
            std::env::temp_dir().join(format!("scriptura-socket-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let media = dir.join("bg-1.mp4");
        std::fs::write(&media, (0..=255u8).collect::<Vec<_>>()).unwrap();

        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        let backend = Backend(media);
        let token = "0123456789abcdef0123456789abcdef";
        let worker = std::thread::spawn(move || {
            for _ in 0..4 {
                let request = server.recv().unwrap();
                let url = request.url().to_owned();
                let (path, query) = url.split_once('?').unwrap_or((url.as_str(), ""));
                let range = request
                    .headers()
                    .iter()
                    .find(|h| h.field.equiv("Range"))
                    .map(|h| h.value.as_str().to_owned());
                respond_output(
                    request,
                    output::handle("GET", path, query, range.as_deref(), token, &backend),
                );
            }
        });

        let fetch = |req: &str| -> (String, Vec<u8>) {
            let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            stream
                .write_all(format!("{req}\r\nHost: x\r\nConnection: close\r\n\r\n").as_bytes())
                .unwrap();
            let mut raw = Vec::new();
            stream.read_to_end(&mut raw).unwrap();
            let split = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
            (
                String::from_utf8_lossy(&raw[..split]).to_string(),
                raw[split + 4..].to_vec(),
            )
        };

        let (head, body) = fetch(&format!("GET /o/?k={token} HTTP/1.1"));
        assert!(head.starts_with("HTTP/1.1 200"), "{head}");
        assert!(String::from_utf8_lossy(&body).contains("__SCRIPTURA_PRESENTATION__"));
        assert!(head.to_lowercase().contains("content-security-policy"));

        assert!(fetch("GET /o/ HTTP/1.1").0.starts_with("HTTP/1.1 403"));

        let (head, body) = fetch(&format!(
            "GET /o/media/bg-1.mp4?k={token} HTTP/1.1\r\nRange: bytes=10-19"
        ));
        assert!(head.starts_with("HTTP/1.1 206"), "{head}");
        assert!(
            head.to_lowercase()
                .contains("content-range: bytes 10-19/256"),
            "{head}"
        );
        assert_eq!(body, (10..=19u8).collect::<Vec<_>>());

        let (head, body) = fetch(&format!("GET /o/media/bg-1.mp4?k={token} HTTP/1.1"));
        assert!(
            head.starts_with("HTTP/1.1 200") && body.len() == 256,
            "{head}"
        );

        worker.join().unwrap();
        let _ = std::fs::remove_dir_all(dir);
    }
}
