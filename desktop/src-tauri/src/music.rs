//! Local music: the gwent music extracted from the player's own copy of The Witcher 3 (read only),
//! or audio files the player imports. Files live in <app data>/music and are played by the game
//! instead of the YouTube stream.

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const MAX_MUSIC_FILE: usize = 128 << 20;
const AUDIO_EXTENSIONS: [&str; 7] = ["ogg", "oga", "opus", "mp3", "flac", "wav", "m4a"];

fn music_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("music");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// A plain file name of the music folder (no path components)
fn safe_name(name: &str) -> Result<&str, String> {
    if name.is_empty() || name.contains(|c| matches!(c, '/' | '\\' | ':')) || name.starts_with('.') || !is_audio(Path::new(name)) {
        return Err(format!("invalid music file name: {}", name));
    }
    Ok(name)
}

#[derive(Serialize)]
pub struct MusicFile {
    name: String,
    size: u64,
}

#[tauri::command]
pub fn music_list(app: AppHandle) -> Result<Vec<MusicFile>, String> {
    let dir = music_dir(&app)?;
    let mut files: Vec<MusicFile> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file() && is_audio(&e.path()))
        .map(|e| MusicFile {
            name: e.file_name().to_string_lossy().into_owned(),
            size: e.metadata().map(|m| m.len()).unwrap_or(0),
        })
        .collect();
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

#[tauri::command]
pub fn music_read(app: AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    let path = music_dir(&app)?.join(safe_name(&name)?);
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Body: the file bytes. Header `x-name`: the file name (ASCII).
#[tauri::command]
pub fn music_write(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("binary body expected".into());
    };
    let name = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing file name")?;
    if bytes.len() > MAX_MUSIC_FILE {
        return Err("music file too large".into());
    }
    let path = music_dir(&app)?.join(safe_name(name)?);
    let tmp = path.with_extension("part");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Copies audio files chosen by the player into the music folder. Returns the names of the copies.
/// The file dialog is opened here, so the page can only import files the player picked himself.
#[tauri::command]
pub async fn music_import(app: AppHandle, title: String, filter_name: String) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(filter_name, &AUDIO_EXTENSIONS)
        .blocking_pick_files()
        .unwrap_or_default();
    let dir = music_dir(&app)?;
    let mut names = Vec::new();
    for p in picked {
        let Ok(src) = p.into_path() else { continue };
        if !src.is_file() || !is_audio(&src) {
            continue;
        }
        let Some(name) = src.file_name().map(|n| n.to_string_lossy().into_owned()) else { continue };
        let dst = dir.join(&name);
        // a file already in the music folder: nothing to copy (copying onto itself would empty it)
        if dst.canonicalize().ok().is_some_and(|d| src.canonicalize().ok() == Some(d)) {
            names.push(name);
            continue;
        }
        fs::copy(&src, &dst).map_err(|e| format!("{}: {}", name, e))?;
        names.push(name);
    }
    Ok(names)
}

/// Removes every file of the music folder (back to the streamed music)
#[tauri::command]
pub fn music_clear(app: AppHandle) -> Result<(), String> {
    let dir = music_dir(&app)?;
    for e in fs::read_dir(&dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        if e.path().is_file() {
            fs::remove_file(e.path()).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn music_open_folder(app: AppHandle) -> Result<(), String> {
    let dir = music_dir(&app)?;
    #[cfg(windows)]
    let cmd = "explorer";
    #[cfg(not(windows))]
    let cmd = "xdg-open";
    std::process::Command::new(cmd).arg(dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------
// The Witcher 3 install (read only)

/// soundspc.cache files of a TW3 install (base game and DLC)
fn sound_caches(root: &Path) -> Vec<PathBuf> {
    let mut caches = Vec::new();
    let mut scan = |dir: PathBuf| {
        if let Ok(entries) = fs::read_dir(&dir) {
            let mut subs: Vec<PathBuf> = entries.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()).collect();
            subs.sort();
            for d in subs {
                for c in [d.join("soundspc.cache"), d.join("content").join("soundspc.cache")] {
                    if c.is_file() {
                        caches.push(c);
                    }
                }
            }
        }
    };
    scan(root.join("content"));
    scan(root.join("dlc"));
    caches
}

fn candidate_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    let mut steam_libraries: Vec<PathBuf> = vec![
        PathBuf::from(r"C:\Program Files (x86)\Steam"),
        PathBuf::from(r"C:\Program Files\Steam"),
    ];
    // other Steam libraries listed by Steam itself
    for lib in steam_libraries.clone() {
        if let Ok(vdf) = fs::read_to_string(lib.join("steamapps").join("libraryfolders.vdf")) {
            for line in vdf.lines() {
                let line = line.trim();
                if let Some(rest) = line.strip_prefix("\"path\"") {
                    let p = rest.trim().trim_matches('"').replace("\\\\", "\\");
                    steam_libraries.push(PathBuf::from(p));
                }
            }
        }
    }
    for drive in 'C'..='Z' {
        steam_libraries.push(PathBuf::from(format!(r"{}:\SteamLibrary", drive)));
        steam_libraries.push(PathBuf::from(format!(r"{}:\Steam", drive)));
    }
    for lib in steam_libraries {
        roots.push(lib.join("steamapps").join("common").join("The Witcher 3"));
    }
    for drive in 'C'..='Z' {
        for p in [
            r"GOG Games\The Witcher 3 Wild Hunt GOTY",
            r"GOG Games\The Witcher 3 Wild Hunt",
            r"Program Files (x86)\GOG Galaxy\Games\The Witcher 3 Wild Hunt GOTY",
            r"Program Files (x86)\GOG Galaxy\Games\The Witcher 3 Wild Hunt",
            r"Program Files\Epic Games\TheWitcher3",
        ] {
            roots.push(PathBuf::from(format!(r"{}:\{}", drive, p)));
        }
    }
    roots
}

/// Looks for The Witcher 3 in the usual places (Steam, GOG, Epic)
#[tauri::command]
pub fn tw3_find() -> Option<String> {
    candidate_roots()
        .into_iter()
        .find(|r| !sound_caches(r).is_empty())
        .map(|r| r.to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct CacheEntry {
    id: String,
    cache: String,
    offset: u64,
    size: u64,
}

fn read_u32(f: &mut File) -> std::io::Result<u32> {
    let mut b = [0u8; 4];
    f.read_exact(&mut b)?;
    Ok(u32::from_le_bytes(b))
}

fn read_u64(f: &mut File) -> std::io::Result<u64> {
    let mut b = [0u8; 8];
    f.read_exact(&mut b)?;
    Ok(u64::from_le_bytes(b))
}

/// Index of a soundspc.cache ("CS3W" archive): (file name, offset, size)
fn cache_index(path: &Path) -> std::io::Result<Vec<(String, u64, u64)>> {
    let mut f = File::open(path)?;
    let mut magic = [0u8; 4];
    f.read_exact(&mut magic)?;
    if &magic != b"CS3W" {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "not a sound cache"));
    }
    let version = read_u32(&mut f)?;
    read_u32(&mut f)?;
    read_u32(&mut f)?;
    let (info_offset, count, names_offset, names_size);
    if version >= 2 {
        info_offset = read_u64(&mut f)?;
        count = read_u64(&mut f)?;
        names_offset = read_u64(&mut f)?;
        names_size = read_u32(&mut f)? as u64;
    } else {
        info_offset = read_u32(&mut f)? as u64;
        count = read_u32(&mut f)? as u64;
        names_offset = read_u32(&mut f)? as u64;
        names_size = read_u32(&mut f)? as u64;
    }
    if count > 1_000_000 || names_size > 64 << 20 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "bad sound cache header"));
    }
    let mut names = vec![0u8; names_size as usize];
    f.seek(SeekFrom::Start(names_offset))?;
    f.read_exact(&mut names)?;
    f.seek(SeekFrom::Start(info_offset))?;
    let mut entries = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let (name_offset, offset, size) = if version >= 2 {
            (read_u64(&mut f)?, read_u64(&mut f)?, read_u64(&mut f)?)
        } else {
            (read_u32(&mut f)? as u64, read_u32(&mut f)? as u64, read_u32(&mut f)? as u64)
        };
        let start = (name_offset as usize).min(names.len());
        let end = names[start..].iter().position(|&b| b == 0).map(|p| start + p).unwrap_or(names.len());
        entries.push((String::from_utf8_lossy(&names[start..end]).into_owned(), offset, size));
    }
    Ok(entries)
}

/// Lets the player point to his The Witcher 3 folder (dialog opened here, not by the page)
#[tauri::command]
pub async fn tw3_pick_folder(app: AppHandle, title: String) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    app.dialog()
        .file()
        .set_title(title)
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

/// Finds the given sound ids (file names without .wem) in the sound caches of a TW3 install
#[tauri::command]
pub fn tw3_sound_index(root: String, ids: Vec<String>) -> Result<Vec<CacheEntry>, String> {
    let caches = sound_caches(Path::new(&root));
    if caches.is_empty() {
        return Err("no sound cache found in this folder".into());
    }
    let mut found: Vec<CacheEntry> = Vec::new();
    for cache in caches {
        let Ok(index) = cache_index(&cache) else { continue };
        for (name, offset, size) in index {
            let Some(id) = name.strip_suffix(".wem") else { continue };
            if ids.iter().any(|i| i == id) && !found.iter().any(|e| e.id == id) {
                found.push(CacheEntry { id: id.to_string(), cache: cache.to_string_lossy().into_owned(), offset, size });
            }
        }
    }
    Ok(found)
}

/// Reads one sound file of a sound cache (never writes anything in the game folder)
#[tauri::command]
pub fn tw3_read(cache: String, offset: u64, size: u64) -> Result<tauri::ipc::Response, String> {
    let path = PathBuf::from(&cache);
    if path.file_name().and_then(|n| n.to_str()) != Some("soundspc.cache") || size > 256 << 20 {
        return Err("invalid sound cache request".into());
    }
    let mut f = File::open(&path).map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut bytes = vec![0u8; size as usize];
    f.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}
