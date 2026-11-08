//! Send real frames through the real NDI runtime and receive them again in the
//! same process. These skip themselves on a computer without NDI Tools, so
//! they prove the wrapper where NDI is installed and cost nothing elsewhere.

use super::ffi::*;
use super::runtime::runtime;
use super::sender::Sender;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::ptr::null;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

type FindCreateFn = unsafe extern "C" fn(*const FindCreate) -> Instance;
type FindDestroyFn = unsafe extern "C" fn(Instance);
type FindWaitFn = unsafe extern "C" fn(Instance, u32) -> bool;
type FindSourcesFn = unsafe extern "C" fn(Instance, *mut u32) -> *const Source;
type RecvCreateFn = unsafe extern "C" fn(*const RecvCreateV3) -> Instance;
type RecvDestroyFn = unsafe extern "C" fn(Instance);
type RecvCaptureFn =
    unsafe extern "C" fn(Instance, *mut VideoFrameV2, *mut u8, *mut u8, u32) -> c_int;
type RecvFreeVideoFn = unsafe extern "C" fn(Instance, *const VideoFrameV2);

const WIDTH: u32 = 320;
const HEIGHT: u32 = 180;
/// Blue, green, red, alpha.
const COLOUR: [u8; 4] = [20, 120, 220, 255];

fn solid_frame() -> Vec<u8> {
    COLOUR
        .iter()
        .copied()
        .cycle()
        .take((WIDTH * HEIGHT * 4) as usize)
        .collect()
}

#[test]
fn a_missing_runtime_is_a_plain_message_not_a_crash() {
    // Whatever this computer has, asking for the runtime never panics.
    match runtime() {
        Ok(_) => {}
        Err(e) => assert!(e.to_string().contains("NDI"), "{e}"),
    }
}

#[test]
fn frames_that_are_the_wrong_size_are_refused_before_they_reach_ndi() {
    let Ok(sender) = Sender::new(&format!("Yarda size test {}", std::process::id())) else {
        eprintln!("NDI runtime not installed; skipping");
        return;
    };
    assert!(sender.send_bgra(0, 10, &[]).is_err());
    assert!(
        sender.send_bgra(10, 10, &[0; 10]).is_err(),
        "too few pixels"
    );
    assert!(sender.send_bgra(100_000, 1, &[]).is_err(), "too wide");
}

#[test]
fn a_frame_sent_is_the_frame_received() {
    let name = format!("Yarda loopback {}", std::process::id());
    let Ok(sender) = Sender::new(&name) else {
        eprintln!("NDI runtime not installed; skipping");
        return;
    };
    let rt = runtime().unwrap();

    // Keep sending, as the app will, until the test is done.
    let stop = Arc::new(AtomicBool::new(false));
    let feeder = {
        let stop = stop.clone();
        std::thread::spawn(move || {
            let pixels = solid_frame();
            while !stop.load(Ordering::Relaxed) {
                sender.send_bgra(WIDTH, HEIGHT, &pixels).unwrap();
            }
        })
    };

    // SAFETY: the signatures are NDI's own, as checked against its headers.
    let received = unsafe {
        let find_create: FindCreateFn = rt.symbol(b"NDIlib_find_create_v2\0").unwrap();
        let find_destroy: FindDestroyFn = rt.symbol(b"NDIlib_find_destroy\0").unwrap();
        let find_wait: FindWaitFn = rt.symbol(b"NDIlib_find_wait_for_sources\0").unwrap();
        let find_sources: FindSourcesFn = rt.symbol(b"NDIlib_find_get_current_sources\0").unwrap();
        let recv_create: RecvCreateFn = rt.symbol(b"NDIlib_recv_create_v3\0").unwrap();
        let recv_destroy: RecvDestroyFn = rt.symbol(b"NDIlib_recv_destroy\0").unwrap();
        let recv_capture: RecvCaptureFn = rt.symbol(b"NDIlib_recv_capture_v2\0").unwrap();
        let recv_free: RecvFreeVideoFn = rt.symbol(b"NDIlib_recv_free_video_v2\0").unwrap();

        // Find our own source on the network.
        let finder = find_create(&FindCreate {
            show_local_sources: true,
            p_groups: null(),
            p_extra_ips: null(),
        });
        assert!(!finder.is_null());
        let mut found: Option<(CString, CString)> = None;
        let deadline = Instant::now() + Duration::from_secs(20);
        while found.is_none() && Instant::now() < deadline {
            find_wait(finder, 1000);
            let mut count = 0u32;
            let sources = find_sources(finder, &mut count);
            for i in 0..count as usize {
                let source = *sources.add(i);
                let source_name = CStr::from_ptr(source.p_ndi_name).to_string_lossy();
                if source_name.contains(&name) && !source.p_url_address.is_null() {
                    found = Some((
                        CString::new(source_name.as_bytes()).unwrap(),
                        CStr::from_ptr(source.p_url_address).to_owned(),
                    ));
                }
            }
        }
        let (source_name, source_url) = found.unwrap_or_else(|| {
            stop.store(true, Ordering::Relaxed);
            panic!(
                "the source '{name}' was not found on the network in 20 seconds. \
                 On macOS the first run may be waiting on the Local Network permission."
            )
        });

        // Receive from it.
        let receiver_name = CString::new("Yarda loopback receiver").unwrap();
        let receiver = recv_create(&RecvCreateV3 {
            source_to_connect_to: Source {
                p_ndi_name: source_name.as_ptr() as *const c_char,
                p_url_address: source_url.as_ptr() as *const c_char,
            },
            color_format: RECV_COLOR_BGRX_BGRA,
            bandwidth: RECV_BANDWIDTH_HIGHEST,
            allow_video_fields: false,
            p_ndi_recv_name: receiver_name.as_ptr(),
        });
        assert!(!receiver.is_null());

        let mut result = None;
        let deadline = Instant::now() + Duration::from_secs(15);
        while result.is_none() && Instant::now() < deadline {
            let mut frame = VideoFrameV2::empty();
            let kind = recv_capture(
                receiver,
                &mut frame,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                1000,
            );
            if kind == FRAME_TYPE_VIDEO {
                let pixel = std::slice::from_raw_parts(frame.p_data, 4).to_vec();
                result = Some((frame.xres, frame.yres, pixel));
                recv_free(receiver, &frame);
            }
        }
        recv_destroy(receiver);
        find_destroy(finder);
        result
    };

    stop.store(true, Ordering::Relaxed);
    feeder.join().unwrap();

    let (width, height, pixel) = received.expect("no video frame arrived in 15 seconds");
    assert_eq!((width, height), (WIDTH as i32, HEIGHT as i32));
    // NDI carries video as YUV, so the colour comes back within a few levels.
    for (got, want) in pixel.iter().zip(COLOUR) {
        assert!(
            (*got as i32 - want as i32).abs() <= 8,
            "pixel {pixel:?} should be close to {COLOUR:?}"
        );
    }
}
