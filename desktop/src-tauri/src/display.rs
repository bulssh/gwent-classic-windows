//! Display modes of the game window (options panel): windowed, borderless window covering the
//! whole screen, full screen. A web view has no "exclusive" full screen: the full screen mode is
//! the one Windows gives to any application (F11 in a browser).

use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

fn err(e: tauri::Error) -> String {
    e.to_string()
}

#[tauri::command]
pub fn set_display_mode(window: WebviewWindow, mode: String, startup: bool) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    match mode.as_str() {
        "fullscreen" => {
            window.set_decorations(true).map_err(err)?;
            window.set_fullscreen(true).map_err(err)?;
        }
        "borderless" => {
            if window.is_fullscreen().map_err(err)? {
                window.set_fullscreen(false).map_err(err)?;
            }
            if window.is_maximized().map_err(err)? {
                window.unmaximize().map_err(err)?;
            }
            window.set_decorations(false).map_err(err)?;
            if let Some(m) = monitor {
                let p = m.position();
                let s = m.size();
                window.set_position(PhysicalPosition::new(p.x, p.y)).map_err(err)?;
                window.set_size(PhysicalSize::new(s.width, s.height)).map_err(err)?;
            }
        }
        "windowed" => {
            let was_fullscreen = window.is_fullscreen().map_err(err)?;
            if was_fullscreen {
                window.set_fullscreen(false).map_err(err)?;
            }
            let was_borderless = !window.is_decorated().map_err(err)?;
            window.set_decorations(true).map_err(err)?;
            // coming from a mode covering the screen: a comfortable 16:9 window, centred
            // (at startup the size saved by the window-state plugin is kept)
            if !startup && (was_fullscreen || was_borderless) {
                if window.is_maximized().map_err(err)? {
                    window.unmaximize().map_err(err)?;
                }
                if let Some(m) = monitor {
                    let s = m.size();
                    let mut w = s.width as f64 * 0.8;
                    let mut h = w * 9.0 / 16.0;
                    if h > s.height as f64 * 0.8 {
                        h = s.height as f64 * 0.8;
                        w = h * 16.0 / 9.0;
                    }
                    window.set_size(PhysicalSize::new(w.round() as u32, h.round() as u32)).map_err(err)?;
                }
                window.center().map_err(err)?;
            }
        }
        _ => return Err(format!("unknown display mode: {}", mode)),
    }
    Ok(())
}

/// Closes the game window (the window-state plugin saves its size and position)
#[tauri::command]
pub fn quit_app(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(err)
}
