//! One NDI source on the network, fed with frames by the caller.

use super::ffi::{
    Instance, SendCreate, VideoFrameV2, FORMAT_PROGRESSIVE, FOURCC_BGRA, TIMECODE_SYNTHESIZE,
};
use super::runtime::{runtime, Runtime};
use crate::types::{AppError, Result};
use std::ffi::CString;
use std::sync::Arc;

/// Frames per second the source announces. NDI paces `send_bgra` to it.
pub const FRAME_RATE: i32 = 30;
const MAX_SIDE: u32 = 8192;

pub struct Sender {
    runtime: Arc<Runtime>,
    instance: Instance,
    // Kept alive: NDI is handed pointers into it.
    _name: CString,
}

// A sender is used by one thread at a time (it is moved into the thread that
// feeds it); NDI allows that. It is deliberately not `Sync`.
unsafe impl Send for Sender {}

impl Sender {
    /// Announce a source called `name`. On the network it shows as `COMPUTER (name)`.
    pub fn new(name: &str) -> Result<Self> {
        let runtime = runtime()?;
        let name = CString::new(name.replace('\0', ""))
            .map_err(|_| AppError::Other("That NDI name can't be used.".into()))?;
        let settings = SendCreate {
            p_ndi_name: name.as_ptr(),
            p_groups: std::ptr::null(),
            // Video only, paced by NDI to the frame rate.
            clock_video: true,
            clock_audio: false,
        };
        // SAFETY: `settings` and the name outlive the call; the runtime copies what it needs.
        let instance = unsafe { (runtime.send_create)(&settings) };
        if instance.is_null() {
            return Err(AppError::Other(
                "NDI could not start the source. Check the name and your network.".into(),
            ));
        }
        Ok(Self {
            runtime,
            instance,
            _name: name,
        })
    }

    /// Send one frame of 8-bit blue-green-red-alpha pixels, `width * 4` bytes a row.
    /// Returns when NDI has taken the frame, paced to `FRAME_RATE`.
    pub fn send_bgra(&self, width: u32, height: u32, pixels: &[u8]) -> Result<()> {
        if width == 0 || height == 0 || width > MAX_SIDE || height > MAX_SIDE {
            return Err(AppError::Other("That frame size can't be sent.".into()));
        }
        let stride = width as usize * 4;
        if pixels.len() != stride * height as usize {
            return Err(AppError::Other(
                "The frame does not hold width x height pixels.".into(),
            ));
        }
        let frame = VideoFrameV2 {
            xres: width as i32,
            yres: height as i32,
            four_cc: FOURCC_BGRA,
            frame_rate_n: FRAME_RATE,
            frame_rate_d: 1,
            picture_aspect_ratio: width as f32 / height as f32,
            frame_format_type: FORMAT_PROGRESSIVE,
            timecode: TIMECODE_SYNTHESIZE,
            // The runtime only reads it: this call returns after the frame is taken.
            p_data: pixels.as_ptr() as *mut u8,
            line_stride_in_bytes: stride as i32,
            ..VideoFrameV2::empty()
        };
        // SAFETY: `frame` and `pixels` are valid for the whole (synchronous) call.
        unsafe { (self.runtime.send_video)(self.instance, &frame) };
        Ok(())
    }

    /// How many programs (OBS, vMix, a monitor) are receiving this source.
    pub fn connections(&self) -> i32 {
        // SAFETY: the instance is ours; a zero timeout asks for the current count.
        unsafe { (self.runtime.send_connections)(self.instance, 0) }
    }
}

impl Drop for Sender {
    fn drop(&mut self) {
        // SAFETY: the instance came from `send_create` and is destroyed once.
        unsafe { (self.runtime.send_destroy)(self.instance) };
    }
}
