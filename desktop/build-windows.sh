#!/bin/bash
# Builds the Windows x64 release from Linux (cross-compilation, x86_64-pc-windows-gnu) and its NSIS installer.
# Requires: Rust (with the standard library sources: it is compiled with build-std when the
# Windows target cannot be installed with rustup), mingw-w64, nsis (makensis), python3.
# On Windows or in GitHub Actions, see .github/workflows/release.yml (native MSVC build).
set -euo pipefail
VERSION="${1:-$(python3 -c "import json;print(json.load(open('$(dirname "$0")/src-tauri/tauri.conf.json'))['version'])")}"
TARGET=x86_64-pc-windows-gnu
cd "$(dirname "$0")/src-tauri"
export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc
export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_AR=x86_64-w64-mingw32-ar
if rustup target list --installed 2>/dev/null | grep -qx "$TARGET"; then
	cargo build --release --target "$TARGET"
else
	RUSTC_BOOTSTRAP=1 cargo build --release --target "$TARGET" -Z build-std=std,panic_abort
fi
cd ..
python3 installer/make_nsi.py "$VERSION" "src-tauri/target/$TARGET/release"
makensis -V2 installer/installer.nsi
ls -la dist/*.exe
