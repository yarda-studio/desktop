//! Web outputs: the congregation output and the stage display served as ordinary
//! web pages, so a video mixer (OBS Browser Source, vMix, Wirecast…) or a spare
//! screen's browser can show exactly what Scriptura's own windows show.
//!
//! The pages are the app's own front end. A small script (web_shim.js) answers
//! the handful of read-only calls they make, and the state the app relays to its
//! windows is polled from here. Every data request needs the output secret; the
//! front end's static files are public (they are the same for everyone).

use super::server::{constant_time_eq, query_param};
use std::path::PathBuf;

const SHIM: &str = include_str!("web_shim.js");
const PAGE_CSP: &str = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; \
                        img-src 'self' data: blob:; media-src 'self'; font-src 'self' data:; connect-src 'self'";

/// What the web outputs need from the running app.
pub trait OutputBackend {
    /// A file of the built front end ("index.html", "assets/…") and its content type.
    fn asset(&self, path: &str) -> Option<(Vec<u8>, String)>;
    /// The change-polling answer for a client that last saw version `since`.
    fn state(&self, since: i64) -> String;
    /// A Bible chapter as JSON.
    fn chapter(&self, module: &str, book: &str, chapter: u32) -> Result<String, String>;
    /// A file in the media folder, already checked to be one the app generated.
    fn media(&self, name: &str) -> Option<PathBuf>;
}

pub enum Body {
    Text(String),
    Bytes(Vec<u8>),
    /// `len` bytes of a file starting at `start`.
    File {
        path: PathBuf,
        start: u64,
        len: u64,
    },
}

pub struct Out {
    pub status: u16,
    pub content_type: String,
    pub body: Body,
    pub headers: Vec<(&'static str, String)>,
}

fn text(status: u16, content_type: &str, body: impl Into<String>) -> Out {
    Out {
        status,
        content_type: content_type.into(),
        body: Body::Text(body.into()),
        headers: vec![("Cache-Control", "no-store".into())],
    }
}

fn forbidden() -> Out {
    text(403, "text/plain; charset=utf-8", "Forbidden")
}

/// True for the paths this module answers.
pub fn is_output_path(path: &str) -> bool {
    path.starts_with("/o/") || path == "/o" || path.starts_with("/assets/")
}

/// Add the browser shim to the front end's index.html and mark the page as the output or stage view.
pub fn inject(html: &str, stage: bool, token: &str) -> String {
    let (flag, kind) = if stage {
        ("__SCRIPTURA_STAGE__", "stage")
    } else {
        ("__SCRIPTURA_PRESENTATION__", "presentation")
    };
    let script = format!("<script>window.{flag}=true;window.__SCRIPTURA_WEB__={{token:\"{token}\",kind:\"{kind}\"}};</script><script>{SHIM}</script>");
    match html.find("<head>") {
        Some(i) => format!("{}{script}{}", &html[..i + 6], &html[i + 6..]),
        None => format!("{script}{html}"),
    }
}

/// "bytes=0-99", "bytes=500-" or "bytes=-200" against a file of `total` bytes → (start, length).
pub fn parse_range(header: &str, total: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    let (a, b) = spec.split_once('-')?;
    if total == 0 {
        return None;
    }
    let (start, end) = match (a.trim(), b.trim()) {
        ("", n) => {
            let n: u64 = n.parse().ok()?;
            (total.saturating_sub(n.min(total)), total - 1)
        }
        (s, "") => (s.parse().ok()?, total - 1),
        (s, e) => (s.parse().ok()?, e.parse::<u64>().ok()?.min(total - 1)),
    };
    (start <= end && start < total).then(|| (start, end - start + 1))
}

/// Decide what to answer for a web-output request. Pure, so the access rules can be tested without a socket.
/// `token` is the output secret, or empty while web outputs are off.
pub fn handle(
    method: &str,
    path: &str,
    query: &str,
    range: Option<&str>,
    token: &str,
    backend: &dyn OutputBackend,
) -> Out {
    if method != "GET" {
        return text(405, "text/plain; charset=utf-8", "Method not allowed");
    }

    // The front end's own files carry nothing private.
    if let Some(rest) = path.strip_prefix("/assets/") {
        if token.is_empty() || rest.contains("..") || rest.contains('\\') {
            return forbidden();
        }
        return match backend.asset(&format!("assets/{rest}")) {
            Some((bytes, mime)) => Out {
                status: 200,
                content_type: mime,
                body: Body::Bytes(bytes),
                headers: vec![("Cache-Control", "public, max-age=3600".into())],
            },
            None => text(404, "text/plain; charset=utf-8", "Not found"),
        };
    }

    let supplied = query_param(query, "k").unwrap_or("");
    if token.is_empty() || !constant_time_eq(supplied, token) {
        return forbidden();
    }

    match path {
        "/o" | "/o/" | "/o/stage" => match backend.asset("index.html") {
            Some((bytes, _)) => {
                let html = inject(&String::from_utf8_lossy(&bytes), path == "/o/stage", token);
                let mut out = text(200, "text/html; charset=utf-8", html);
                out.headers.push(("Content-Security-Policy", PAGE_CSP.into()));
                out
            }
            None => text(404, "text/plain; charset=utf-8", "The output page isn't available in this build. Run npm run build, or use the installed app."),
        },
        "/o/api/state" => {
            let since = query_param(query, "v").and_then(|v| v.parse().ok()).unwrap_or(-1);
            text(200, "application/json", backend.state(since))
        }
        "/o/api/chapter" => {
            let decode = |k: &str| query_param(query, k).map(percent_decode);
            let (Some(module), Some(book), Some(chapter)) = (decode("module"), decode("book"), decode("chapter").and_then(|c| c.parse::<u32>().ok())) else {
                return text(400, "text/plain; charset=utf-8", "Missing module, book or chapter");
            };
            match backend.chapter(&module, &book, chapter) {
                Ok(json) => text(200, "application/json", json),
                Err(e) => text(404, "text/plain; charset=utf-8", e),
            }
        }
        _ => match path.strip_prefix("/o/media/") {
            Some(name) => {
                let name = percent_decode(name);
                let Some(file) = backend.media(&name) else {
                    return text(404, "text/plain; charset=utf-8", "Not found");
                };
                let Ok(total) = std::fs::metadata(&file).map(|m| m.len()) else {
                    return text(404, "text/plain; charset=utf-8", "Not found");
                };
                let content_type = match name.rsplit('.').next() {
                    Some("webm") => "video/webm",
                    Some("mov") => "video/quicktime",
                    _ => "video/mp4",
                };
                let mut headers = vec![("Accept-Ranges", "bytes".to_string()), ("Cache-Control", "private, max-age=3600".to_string())];
                match range.and_then(|r| parse_range(r, total)) {
                    Some((start, len)) => {
                        headers.push(("Content-Range", format!("bytes {start}-{}/{total}", start + len - 1)));
                        Out { status: 206, content_type: content_type.into(), body: Body::File { path: file, start, len }, headers }
                    }
                    None => Out { status: 200, content_type: content_type.into(), body: Body::File { path: file, start: 0, len: total }, headers },
                }
            }
            None => text(404, "text/plain; charset=utf-8", "Not found"),
        },
    }
}

/// Decode %XX escapes and '+' in a URL component.
pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if bytes
                .get(i + 1..i + 3)
                .is_some_and(|h| h.iter().all(u8::is_ascii_hexdigit)) =>
            {
                out.push(
                    u8::from_str_radix(
                        std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("0"),
                        16,
                    )
                    .unwrap_or(0),
                );
                i += 3;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "feedfeedfeedfeedfeedfeedfeedfeed";

    struct Fake {
        media: Option<PathBuf>,
    }

    impl OutputBackend for Fake {
        fn asset(&self, path: &str) -> Option<(Vec<u8>, String)> {
            match path {
                "index.html" => Some((
                    b"<!doctype html><html><head><title>S</title></head><body></body></html>"
                        .to_vec(),
                    "text/html".into(),
                )),
                "assets/app.js" => Some((b"console.log(1)".to_vec(), "text/javascript".into())),
                _ => None,
            }
        }
        fn state(&self, since: i64) -> String {
            format!("{{\"changed\":{},\"v\":7}}", since != 7)
        }
        fn chapter(&self, module: &str, book: &str, chapter: u32) -> Result<String, String> {
            if module == "KJV" {
                Ok(format!("{{\"book\":\"{book}\",\"chapter\":{chapter}}}"))
            } else {
                Err("Module not found".into())
            }
        }
        fn media(&self, name: &str) -> Option<PathBuf> {
            (name == "bg-1.mp4").then(|| self.media.clone()).flatten()
        }
    }

    fn get(path: &str, query: &str, token: &str) -> Out {
        handle("GET", path, query, None, token, &Fake { media: None })
    }

    fn body(out: &Out) -> String {
        match &out.body {
            Body::Text(t) => t.clone(),
            Body::Bytes(b) => String::from_utf8_lossy(b).into_owned(),
            Body::File { .. } => "<file>".into(),
        }
    }

    #[test]
    fn data_needs_the_secret_but_static_files_do_not() {
        let k = format!("k={TOKEN}");
        for path in [
            "/o/",
            "/o/stage",
            "/o/api/state",
            "/o/api/chapter",
            "/o/media/bg-1.mp4",
        ] {
            assert_eq!(get(path, "", TOKEN).status, 403, "{path} without a secret");
            assert_eq!(
                get(path, "k=nope", TOKEN).status,
                403,
                "{path} with the wrong secret"
            );
            assert_eq!(
                get(path, &k, "").status,
                403,
                "{path} while web outputs are off"
            );
        }
        assert_eq!(get("/assets/app.js", "", TOKEN).status, 200);
        assert_eq!(
            get("/assets/app.js", "", "").status,
            403,
            "off means off, even for static files"
        );
        assert_eq!(get("/assets/../index.html", "", TOKEN).status, 403);
        assert_eq!(get("/assets/missing.js", "", TOKEN).status, 404);
        assert_eq!(
            handle(
                "POST",
                "/o/api/state",
                &k,
                None,
                TOKEN,
                &Fake { media: None }
            )
            .status,
            405
        );
    }

    #[test]
    fn pages_carry_the_shim_and_the_right_flag() {
        let k = format!("k={TOKEN}");
        let output = body(&get("/o/", &k, TOKEN));
        assert!(
            output.contains("__SCRIPTURA_PRESENTATION__=true")
                && !output.contains("__SCRIPTURA_STAGE__=true")
        );
        assert!(output.contains(&format!("token:\"{TOKEN}\"")));
        assert!(
            output.contains("__TAURI_INTERNALS__"),
            "the shim is inlined"
        );
        assert!(
            output.find("<script>window.__SCRIPTURA").unwrap() < output.find("<title>").unwrap(),
            "injected first in <head>"
        );
        let stage = body(&get("/o/stage", &k, TOKEN));
        assert!(
            stage.contains("__SCRIPTURA_STAGE__=true")
                && !stage.contains("__SCRIPTURA_PRESENTATION__=true")
        );
        assert!(get("/o/", &k, TOKEN)
            .headers
            .iter()
            .any(|(n, v)| *n == "Content-Security-Policy" && v.contains("default-src 'self'")));
    }

    #[test]
    fn state_and_chapter_endpoints() {
        let k = format!("k={TOKEN}");
        assert_eq!(
            body(&get("/o/api/state", &format!("{k}&v=3"), TOKEN)),
            "{\"changed\":true,\"v\":7}"
        );
        assert_eq!(
            body(&get("/o/api/state", &format!("{k}&v=7"), TOKEN)),
            "{\"changed\":false,\"v\":7}"
        );
        assert_eq!(
            body(&get(
                "/o/api/chapter",
                &format!("{k}&module=KJV&book=1%20John&chapter=3"),
                TOKEN
            )),
            "{\"book\":\"1 John\",\"chapter\":3}"
        );
        assert_eq!(
            get(
                "/o/api/chapter",
                &format!("{k}&module=NOPE&book=John&chapter=3"),
                TOKEN
            )
            .status,
            404
        );
        assert_eq!(
            get(
                "/o/api/chapter",
                &format!("{k}&module=KJV&book=John&chapter=x"),
                TOKEN
            )
            .status,
            400
        );
    }

    #[test]
    fn media_is_served_with_ranges() {
        let dir = std::env::temp_dir().join(format!("scriptura-media-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("bg-1.mp4");
        std::fs::write(&file, vec![7u8; 1000]).unwrap();
        let backend = Fake { media: Some(file) };
        let k = format!("k={TOKEN}");

        let full = handle("GET", "/o/media/bg-1.mp4", &k, None, TOKEN, &backend);
        assert!(
            matches!(
                full.body,
                Body::File {
                    start: 0,
                    len: 1000,
                    ..
                }
            ) && full.status == 200
        );
        let part = handle(
            "GET",
            "/o/media/bg-1.mp4",
            &k,
            Some("bytes=100-199"),
            TOKEN,
            &backend,
        );
        assert_eq!(part.status, 206);
        assert!(part
            .headers
            .iter()
            .any(|(n, v)| *n == "Content-Range" && v == "bytes 100-199/1000"));
        assert_eq!(
            handle("GET", "/o/media/other.mp4", &k, None, TOKEN, &backend).status,
            404
        );
        assert_eq!(
            handle("GET", "/o/media/..%2Fsecret", &k, None, TOKEN, &backend).status,
            404
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn range_parsing() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 100)));
        assert_eq!(parse_range("bytes=900-", 1000), Some((900, 100)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 100)));
        assert_eq!(parse_range("bytes=990-5000", 1000), Some((990, 10)));
        assert_eq!(parse_range("bytes=2000-3000", 1000), None);
        assert_eq!(parse_range("bytes=5-2", 1000), None);
        assert_eq!(parse_range("items=0-1", 1000), None);
        assert_eq!(parse_range("bytes=0-1", 0), None);
    }

    #[test]
    fn percent_decoding() {
        assert_eq!(percent_decode("1%20John+3"), "1 John 3");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }
}
