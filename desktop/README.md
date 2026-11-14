# Gwent Classic — application Windows (Tauri 2)

Jeu : `../game/`, intégré à l'exécutable à la compilation (`frontendDist`).
Application : `src-tauri/` (Rust, Tauri 2, WebView2 sous Windows).

## Construire l'installateur Windows depuis Linux
```
./build-windows.sh 2.3.2      # -> dist/Gwent-Classic-2.3.2-Setup.exe
```
Prérequis : Rust, sources de la bibliothèque standard (compilée pour Windows via `build-std`),
`mingw-w64`, `nsis`. Sous Windows ou dans GitHub Actions : voir le README principal et `.github/workflows/release.yml` (cible MSVC).

## Contenu de l'installation
- `%LOCALAPPDATA%\Programs\Gwent Classic\` : `Gwent Classic.exe`, `WebView2Loader.dll`.
- Données (decks, réglages) : `%LOCALAPPDATA%\io.github.bulssh.gwentclassic\` et `%APPDATA%\io.github.bulssh.gwentclassic\`.
- Les données des versions ≤ 2.3.1 (ancien identifiant) sont déplacées automatiquement au premier lancement.
- Désinstallation : Paramètres > Applications ; elle propose de garder ou supprimer les données.
- Musique extraite de The Witcher 3 ou importée : `%APPDATA%\io.github.bulssh.gwentclassic\music\`.

## Code Rust
- `src/lib.rs` : démarrage, extensions (instance unique, mémoire de la fenêtre, dialogues), commandes, autotest (debug).
- `src/music.rs` : dossier musique, recherche de TW3 (Steam, GOG, Epic) et lecture seule de ses `soundspc.cache`.
- `src/display.rs` : modes Fenêtré / Fenêtre sans bord / Plein écran, fermeture.
