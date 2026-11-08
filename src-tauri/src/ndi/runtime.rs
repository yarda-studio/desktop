//! Finds and loads the NDI runtime that NDI Tools installs on the user's
//! computer. Nothing about NDI is built into the app: if the runtime is not
//! there, `runtime()` says so and everything else carries on as before.

use super::ffi::{Instance, SendCreate, VideoFrameV2};
use crate::types::{AppError, Result};
use libloading::Library;
use std::os::raw::c_int;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

type InitializeFn = unsafe extern "C" fn() -> bool;
pub(super) type SendCreateFn = unsafe extern "C" fn(*const SendCreate) -> Instance;
pub(super) type SendDestroyFn = unsafe extern "C" fn(Instance);
pub(super) type SendVideoFn = unsafe extern "C" fn(Instance, *const VideoFrameV2);
pub(super) type SendConnectionsFn = unsafe extern "C" fn(Instance, u32) -> c_int;

/// The loaded NDI library and the functions of it we call.
pub struct Runtime {
    /// Held so the library stays loaded for as long as its functions are used.
    #[cfg_attr(not(test), allow(dead_code))]
    lib: Library,
    pub(super) send_create: SendCreateFn,
    pub(super) send_destroy: SendDestroyFn,
    pub(super) send_video: SendVideoFn,
    pub(super) send_connections: SendConnectionsFn,
}

/// The runtime's file name on this operating system.
fn library_names() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &["libndi.dylib"]
    } else if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            &["Processing.NDI.Lib.ARM64.dll"]
        } else {
            &["Processing.NDI.Lib.x64.dll"]
        }
    } else {
        &["libndi.so.6", "libndi.so.5", "libndi.so"]
    }
}

/// Where to look, best first: the folder NDI's installer records in the
/// environment, the usual install location, then the system's own search.
fn candidates() -> Vec<PathBuf> {
    let mut found = Vec::new();
    for name in library_names() {
        for var in [
            "NDI_RUNTIME_DIR_V6",
            "NDI_RUNTIME_DIR_V5",
            "NDI_RUNTIME_DIR_V4",
            "NDI_RUNTIME_DIR_V3",
        ] {
            if let Some(dir) = std::env::var_os(var) {
                found.push(PathBuf::from(dir).join(name));
            }
        }
        if cfg!(target_os = "macos") {
            found.push(PathBuf::from("/usr/local/lib").join(name));
        }
        found.push(PathBuf::from(name));
    }
    found
}

const NOT_INSTALLED: &str =
    "The NDI runtime isn't installed on this computer. Install NDI Tools from ndi.video, then try again.";

impl Runtime {
    fn load() -> Result<Self> {
        let mut last_error = None;
        for path in candidates() {
            // SAFETY: loading the NDI library runs its initialisers, which is what it is for.
            match unsafe { Library::new(&path) } {
                Ok(lib) => return Self::from_library(lib),
                Err(e) => last_error = Some(e.to_string()),
            }
        }
        log::info!(
            "[ndi] runtime not found ({})",
            last_error.unwrap_or_default()
        );
        Err(AppError::Other(NOT_INSTALLED.into()))
    }

    fn from_library(lib: Library) -> Result<Self> {
        // SAFETY: these are the documented NDI functions with the signatures in NDI's headers.
        unsafe {
            let initialize: InitializeFn = Self::find(&lib, b"NDIlib_initialize\0")?;
            let runtime = Self {
                send_create: Self::find(&lib, b"NDIlib_send_create\0")?,
                send_destroy: Self::find(&lib, b"NDIlib_send_destroy\0")?,
                send_video: Self::find(&lib, b"NDIlib_send_send_video_v2\0")?,
                send_connections: Self::find(&lib, b"NDIlib_send_get_no_connections\0")?,
                lib,
            };
            if !initialize() {
                return Err(AppError::Other(
                    "NDI can't run on this computer's processor.".into(),
                ));
            }
            Ok(runtime)
        }
    }

    unsafe fn find<T: Copy>(lib: &Library, name: &[u8]) -> Result<T> {
        lib.get::<T>(name).map(|s| *s).map_err(|_| {
            AppError::Other(
                "The NDI runtime on this computer is too old or damaged. Update NDI Tools from ndi.video.".into(),
            )
        })
    }

    /// Another function of the runtime, for the tests.
    #[cfg(test)]
    pub(super) unsafe fn symbol<T: Copy>(&self, name: &[u8]) -> Result<T> {
        Self::find(&self.lib, name)
    }
}

static RUNTIME: Mutex<Option<Arc<Runtime>>> = Mutex::new(None);

/// The NDI runtime, loaded on first use. Only a successful load is kept, so
/// installing NDI Tools while the app is open works the next time this is called.
pub fn runtime() -> Result<Arc<Runtime>> {
    let mut slot = RUNTIME.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(runtime) = slot.as_ref() {
        return Ok(runtime.clone());
    }
    let runtime = Arc::new(Runtime::load()?);
    *slot = Some(runtime.clone());
    Ok(runtime)
}
