//! Grabbing a picture of the output window to send over NDI.
//!
//! Only macOS is done: it images one window by its window number, so the window
//! does not have to be in front of others. Other systems say so, and everything
//! else carries on.

use crate::types::{AppError, Result};

/// One picture of the window: 8-bit blue-green-red-alpha, `width * 4` bytes a row.
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
}

/// Copy rows that may be padded (`stride` bytes apart) into tight rows of
/// `width * 4` bytes, which is what the sender wants. Only the macOS capture
/// uses it; other systems have no capture yet, and the tests run everywhere.
#[cfg(any(target_os = "macos", test))]
pub fn tighten(width: usize, height: usize, stride: usize, data: &[u8]) -> Result<Vec<u8>> {
    let row = width * 4;
    if width == 0 || height == 0 || stride < row {
        return Err(AppError::Other(
            "The window picture has an odd shape.".into(),
        ));
    }
    // The last row need not be padded.
    if data.len() < stride * (height - 1) + row {
        return Err(AppError::Other("The window picture is incomplete.".into()));
    }
    if stride == row {
        return Ok(data[..row * height].to_vec());
    }
    let mut out = Vec::with_capacity(row * height);
    for y in 0..height {
        let start = y * stride;
        out.extend_from_slice(&data[start..start + row]);
    }
    Ok(out)
}

/// A picture of the window with this window number (`NSWindow.windowNumber`).
#[cfg(target_os = "macos")]
pub fn capture_window(window_number: u32) -> Result<Frame> {
    use core_graphics::display::{CGPoint, CGRect, CGSize};
    use core_graphics::window::{
        create_image, kCGWindowImageBoundsIgnoreFraming, kCGWindowImageNominalResolution,
        kCGWindowListOptionIncludingWindow,
    };

    // An infinite rectangle means "the window's own bounds".
    let bounds = CGRect::new(
        &CGPoint::new(f64::INFINITY, f64::INFINITY),
        &CGSize::new(0.0, 0.0),
    );
    // Nominal resolution: the window's size in points, not doubled on a Retina screen.
    let image = create_image(
        bounds,
        kCGWindowListOptionIncludingWindow,
        window_number,
        kCGWindowImageBoundsIgnoreFraming | kCGWindowImageNominalResolution,
    )
    .ok_or_else(|| {
        AppError::Other("The presentation window can't be captured right now.".into())
    })?;

    if image.bits_per_pixel() != 32 {
        return Err(AppError::Other(
            "The presentation window has a picture format NDI output doesn't support.".into(),
        ));
    }
    let (width, height) = (image.width(), image.height());
    let data = image.data();
    let bgra = tighten(width, height, image.bytes_per_row(), data.bytes())?;
    Ok(Frame {
        width: width as u32,
        height: height as u32,
        bgra,
    })
}

#[cfg(not(target_os = "macos"))]
pub fn capture_window(_window_number: u32) -> Result<Frame> {
    Err(AppError::Other(
        "NDI output isn't available on this operating system yet.".into(),
    ))
}

/// Whether this build can capture the output window at all.
pub const SUPPORTED: bool = cfg!(target_os = "macos");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn padded_rows_become_tight_rows() {
        // 2 pixels wide, 3 rows, rows 12 bytes apart (8 of pixels + 4 of padding).
        let mut data = Vec::new();
        for y in 0..3u8 {
            data.extend((0..8).map(|x| y * 10 + x));
            data.extend([99; 4]);
        }
        let tight = tighten(2, 3, 12, &data).unwrap();
        assert_eq!(tight.len(), 24);
        assert_eq!(&tight[0..8], &[0, 1, 2, 3, 4, 5, 6, 7]);
        assert_eq!(&tight[8..16], &[10, 11, 12, 13, 14, 15, 16, 17]);
        assert!(!tight.contains(&99), "the padding is dropped");
    }

    #[test]
    fn rows_without_padding_are_taken_as_they_are() {
        let data: Vec<u8> = (0..16).collect();
        assert_eq!(tighten(2, 2, 8, &data).unwrap(), data);
    }

    #[test]
    fn the_last_row_does_not_need_its_padding() {
        let mut data = vec![1u8; 12 + 8];
        data[12..].fill(2);
        let tight = tighten(2, 2, 12, &data).unwrap();
        assert_eq!(&tight[8..], &[2; 8]);
    }

    #[test]
    fn a_picture_that_does_not_add_up_is_refused() {
        assert!(tighten(0, 5, 0, &[]).is_err());
        assert!(
            tighten(4, 4, 8, &[0; 100]).is_err(),
            "stride shorter than a row"
        );
        assert!(tighten(4, 4, 16, &[0; 20]).is_err(), "too little data");
    }
}
