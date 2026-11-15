use std::fs;
use tauri::Manager;

mod display;
mod music;

/// Deck export: the application opens the native "Save as" dialog itself and only writes to the
/// file chosen there, so the page can never write anywhere else on the computer.
#[tauri::command]
async fn save_deck(app: tauri::AppHandle, title: String, file_name: String, contents: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    if contents.len() > 1 << 20 {
        return Err("deck too large".into());
    }
    let picked = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(file_name)
        .add_filter("Deck Gwent", &["json"])
        .blocking_save_file();
    match picked {
        None => Ok(false),
        Some(path) => {
            let path = path.into_path().map_err(|e| e.to_string())?;
            fs::write(&path, contents).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

/// Debug builds only (automated self-test): writes a text file anywhere.
#[cfg(debug_assertions)]
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Versions up to 2.3.1 used another identifier ("fr.<name>.gwentclassic"): their data folders
/// (decks, settings, history, music) are moved once to the new identifier, before the window opens.
fn migrate_data_folders(identifier: &str) {
    for var in ["APPDATA", "LOCALAPPDATA"] {
        let Some(base) = std::env::var_os(var).map(std::path::PathBuf::from) else { continue };
        let new = base.join(identifier);
        if new.exists() {
            continue;
        }
        let Ok(entries) = fs::read_dir(&base) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("fr.") && name.ends_with(".gwentclassic") && name.matches('.').count() == 2 && entry.path().is_dir() {
                let _ = fs::rename(entry.path(), &new);
                break;
            }
        }
    }
}

/// Debug builds only: automated check of the packaged game (GWENT_SELFTEST=1).
#[cfg(debug_assertions)]
#[tauri::command]
fn selftest_report(report: String) {
    println!("SELFTEST {}", report);
    std::process::exit(0);
}

#[cfg(debug_assertions)]
fn selftest_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("selftest")
        .js_init_script(
            r#"
            if (window.top === window) {
              window.__selftestErrors = [];
              window.addEventListener('error', e => window.__selftestErrors.push(String(e.message)));
              window.addEventListener('unhandledrejection', e => window.__selftestErrors.push('rej: ' + (e.reason && (e.reason.message || e.reason))));
            }
            "#
            .to_string(),
        )
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    migrate_data_folders(&context.config().identifier);

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(debug_assertions)]
    let builder = builder
        .plugin(selftest_plugin())
        .invoke_handler(tauri::generate_handler![save_deck, write_text_file, selftest_report, music::music_list, music::music_read, music::music_write, music::music_import, music::music_clear, music::music_open_folder, music::tw3_find, music::tw3_pick_folder, music::tw3_sound_index, music::tw3_read, display::set_display_mode, display::quit_app])
        .setup(|app| {
            if std::env::var("GWENT_SELFTEST").is_ok() {
                let w = app.get_webview_window("main").expect("main window");
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(6));
                    let script = std::env::var("GWENT_SELFTEST_SCRIPT")
                        .ok()
                        .and_then(|p| std::fs::read_to_string(p).ok())
                        .unwrap_or_default();
                    let _ = w.eval(&script);
                });
            }
            Ok(())
        });

    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![save_deck, music::music_list, music::music_read, music::music_write, music::music_import, music::music_clear, music::music_open_folder, music::tw3_find, music::tw3_pick_folder, music::tw3_sound_index, music::tw3_read, display::set_display_mode, display::quit_app]);

    builder
        .run(context)
        .expect("error while running Gwent Classic");
}
