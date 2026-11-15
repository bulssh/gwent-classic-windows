# Gwent Classic — édition Windows en français

Le Gwynt de **The Witcher 3** en application Windows : toutes les cartes du jeu de base, de *Hearts of Stone* et de *Blood and Wine*, en français, avec des règles et une interface fidèles à TW3, et un **mode en ligne 1 contre 1** entre deux PC.

Ce projet part de [**Gwent Classic** d'Arun Sundaram (asundr)](https://github.com/asundr/gwent-classic), un remake du Gwynt dans le navigateur. Il y ajoute une application de bureau, la traduction officielle, une interface proche de TW3 et le jeu en ligne.

> Projet de fan **non officiel, gratuit et non commercial**, sans lien avec CD PROJEKT RED. Les images, sons et textes de The Witcher 3 appartiennent à CD PROJEKT S.A. Voir [NOTICE.md](NOTICE.md).

## Télécharger

| Quoi | Où |
| --- | --- |
| Installateur Windows 10/11 (64 bits) | [Dernière version](https://github.com/bulssh/gwent-classic-windows/releases/latest) → `Gwent-Classic-<version>-Setup.exe` |
| Serveur pour jouer en ligne | [Guide](server/README-FR.md) (bouton Cloudflare, ou `gwent-classic-serveur-<version>.zip` sur la page de la version) |
| Empreintes de contrôle | même page → `SHA256SUMS.txt` |
| Nouveautés | [CHANGELOG.md](CHANGELOG.md) |

L'installation se fait pour l'utilisateur courant, sans droits administrateur. Le jeu utilise WebView2, déjà présent sur Windows 10 et 11.

### Avertissement SmartScreen
L'installateur n'est pas signé par un certificat commercial : au premier lancement, Windows peut afficher « Windows a protégé votre ordinateur ». Pour continuer, cliquez sur **Informations complémentaires**, puis sur **Exécuter quand même**. Avant cela, vous pouvez vérifier que le fichier est bien celui compilé par GitHub (voir ci-dessous).

### Vérifier le fichier téléchargé
Chaque installateur est compilé automatiquement par [GitHub Actions](.github/workflows/release.yml) à partir du code de ce dépôt (dès que la version change sur `main`), et reçoit une **attestation de provenance** signée.

- **Empreinte SHA-256** (PowerShell) : `Get-FileHash .\Gwent-Classic-2.3.2-Setup.exe`. Le résultat doit être identique à la ligne correspondante de `SHA256SUMS.txt`.
- **Provenance** (avec [GitHub CLI](https://cli.github.com/)) : `gh attestation verify .\Gwent-Classic-2.3.2-Setup.exe --repo bulssh/gwent-classic-windows`

## Fonctionnalités
- **Règles complètes** : toutes les capacités, tous les chefs et les cinq factions (Royaumes du Nord, Nilfgaard, Scoia'tael, Monstres, Skellige), et une IA réglable.
- **Fidèle à TW3** : textes officiels en français, cartes sans texte, rubans de faction, écran de deck, portraits, nombres et couleurs du jeu ; passer en maintenant la barre Espace.
- **Musique** : extraite à la demande de votre propre installation de The Witcher 3 (lecture seule), ou importée depuis vos fichiers.
- **Partie en ligne 1v1** : un des joueurs crée son serveur gratuit ([guide](server/README-FR.md)), puis il suffit de créer une partie, de donner le code de 6 caractères, de choisir son deck et de se déclarer prêt. La connexion se fait directement de PC à PC (WebRTC), avec un relais automatique si elle est impossible ; aucun port à ouvrir. Comme dans tout jeu en pair à pair, l'adversaire voit votre adresse IP publique : ne jouez qu'avec des personnes à qui vous donnez le code. Voir [docs/ONLINE-ARCHITECTURE-FR.md](docs/ONLINE-ARCHITECTURE-FR.md).
- **Historique** des parties, statistiques par faction, modes fenêtré / sans bord / plein écran.

## Organisation du dépôt

| Dossier | Contenu |
| --- | --- |
| [`game/`](game) | Le jeu : page web en JavaScript sans dépendance (HTML, CSS, JS), images, sons, polices. Fonctionne aussi dans un navigateur. |
| [`desktop/`](desktop) | L'application Windows : [Tauri 2](https://tauri.app) (Rust + WebView2) et l'installateur NSIS. |
| [`server/`](server) | Le serveur de mise en relation du mode en ligne : un Cloudflare Worker avec un Durable Object (offre gratuite). |
| [`tests/`](tests) | Tests automatiques du jeu dans Chromium (Playwright) ; les tests à deux joueurs sont dans `server/test/`. |
| [`tools/`](tools) | Scripts de préparation des données à partir d'une installation de TW3 : textes officiels, images sans texte, rubans, portraits. |
| [`docs/`](docs) | Documentation technique. |

## Développer

### Jouer dans le navigateur
```sh
cd game
python3 -m http.server 8000      # puis http://localhost:8000
```
Ces fonctions n'existent que dans l'application Windows : musique extraite de TW3, modes d'affichage, export par la boîte « Enregistrer sous ».

### Compiler l'application Windows
Sous Windows, avec [Rust](https://rustup.rs), [Node.js](https://nodejs.org) et [NSIS](https://nsis.sourceforge.io) :
```sh
cd desktop
cd src-tauri && cargo build --release && cd ..
python installer/make_nsi.py 2.3.2 src-tauri/target/release
makensis installer/installer.nsi        # -> desktop/dist/Gwent-Classic-2.3.2-Setup.exe
```
Depuis Linux, il existe aussi une compilation croisée : `desktop/build-windows.sh` (mingw-w64, nsis).

### Tests
```sh
pip install playwright && playwright install chromium
python3 tests/targeted.py game         # règles et cas limites
python3 tests/realclick.py game        # interface, vrais clics de souris
python3 tests/security.py game         # non-régression sécurité
```
Mode en ligne : lancer `npm run dev` dans `server/`, puis `node server/test/security.mjs`, `python3 server/test/room_flow.py` et `python3 server/test/two_clients.py 2 wsdrop`.

### Serveur en ligne
Il n'y a pas de serveur commun : pour jouer en ligne, l'un des joueurs crée **son propre serveur gratuit** sur son compte Cloudflare (environ 5 minutes, une seule fois, avec un bouton ou depuis son PC), puis donne son adresse à ses adversaires. Guide pas à pas : [server/README-FR.md](server/README-FR.md).

## Sécurité
Pour signaler une faille, passez par un signalement privé, pas par une issue publique : voir [SECURITY.md](SECURITY.md).

## Licence et crédits
- **Code** : licence MIT avec la clause « Commons Clause », comme le projet d'origine : usage, modification et partage libres, **vente interdite**. Voir [LICENSE](LICENSE).
- **Contenus de The Witcher 3** (images, sons, textes) : © CD PROJEKT S.A., utilisés dans un projet de fan non commercial. Voir [NOTICE.md](NOTICE.md).
- Jeu d'origine : Arun Sundaram ([asundr/gwent-classic](https://github.com/asundr/gwent-classic)). Police Barlow (SIL OFL 1.1), décodage audio d'après ww2ogg (licence BSD).
