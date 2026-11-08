//! The few NDI C structures this app uses, laid out exactly as in NDI's headers
//! (`Processing.NDI.structs.h`, `.Send.h`, `.Find.h`, `.Recv.h`). A wrong field
//! here would crash the app, so the sizes are checked at compile time and the
//! loopback tests send real frames through a real NDI runtime.

use std::os::raw::{c_char, c_void};

/// An NDI sender, finder or receiver.
pub type Instance = *mut c_void;

/// `NDI_LIB_FOURCC('B', 'G', 'R', 'A')`: 8-bit blue, green, red, alpha.
pub const FOURCC_BGRA: i32 = 0x4152_4742;
/// `NDIlib_frame_format_type_progressive`.
pub const FORMAT_PROGRESSIVE: i32 = 1;
/// `NDIlib_send_timecode_synthesize`: let NDI stamp the frame.
pub const TIMECODE_SYNTHESIZE: i64 = i64::MAX;

#[repr(C)]
pub struct SendCreate {
    pub p_ndi_name: *const c_char,
    pub p_groups: *const c_char,
    pub clock_video: bool,
    pub clock_audio: bool,
}

#[repr(C)]
pub struct VideoFrameV2 {
    pub xres: i32,
    pub yres: i32,
    pub four_cc: i32,
    pub frame_rate_n: i32,
    pub frame_rate_d: i32,
    pub picture_aspect_ratio: f32,
    pub frame_format_type: i32,
    pub timecode: i64,
    pub p_data: *mut u8,
    /// The union's `line_stride_in_bytes` (uncompressed formats).
    pub line_stride_in_bytes: i32,
    pub p_metadata: *const c_char,
    pub timestamp: i64,
}

impl VideoFrameV2 {
    pub fn empty() -> Self {
        Self {
            xres: 0,
            yres: 0,
            four_cc: 0,
            frame_rate_n: 0,
            frame_rate_d: 0,
            picture_aspect_ratio: 0.0,
            frame_format_type: 0,
            timecode: 0,
            p_data: std::ptr::null_mut(),
            line_stride_in_bytes: 0,
            p_metadata: std::ptr::null(),
            timestamp: 0,
        }
    }
}

// The C layout on a 64-bit computer: five ints and a float (24 bytes), the
// format (28, padded to 32), the timecode, the data pointer, the stride
// (padded to 8), the metadata pointer and the timestamp.
#[cfg(target_pointer_width = "64")]
const _: () = assert!(std::mem::size_of::<VideoFrameV2>() == 72);
#[cfg(target_pointer_width = "64")]
const _: () = assert!(std::mem::size_of::<SendCreate>() == 24);

#[cfg(test)]
pub use test_structs::*;

/// Only the tests look for sources and receive frames.
#[cfg(test)]
mod test_structs {
    use super::*;

    #[repr(C)]
    pub struct FindCreate {
        pub show_local_sources: bool,
        pub p_groups: *const c_char,
        pub p_extra_ips: *const c_char,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct Source {
        pub p_ndi_name: *const c_char,
        pub p_url_address: *const c_char,
    }

    #[repr(C)]
    pub struct RecvCreateV3 {
        pub source_to_connect_to: Source,
        pub color_format: i32,
        pub bandwidth: i32,
        pub allow_video_fields: bool,
        pub p_ndi_recv_name: *const c_char,
    }

    /// `NDIlib_recv_color_format_BGRX_BGRA`.
    pub const RECV_COLOR_BGRX_BGRA: i32 = 0;
    /// `NDIlib_recv_bandwidth_highest`.
    pub const RECV_BANDWIDTH_HIGHEST: i32 = 100;
    /// `NDIlib_frame_type_video`.
    pub const FRAME_TYPE_VIDEO: i32 = 1;
}
