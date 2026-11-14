# Tests

Lancer depuis la racine du dépôt (Python 3, `pip install playwright`, `python -m playwright install chromium`).

| Script | Rôle | CI |
| --- | --- | --- |
| `targeted.py game` | Règles, capacités, chefs et cas limites | oui |
| `realclick.py game` | Interface avec de vrais clics de souris | oui |
| `security.py game` | Non-régression sécurité (aucun texte externe ne devient du HTML) | oui |
| `soak.py game [n]` | Parties complètes IA contre bot (`bot.js`), recherche d'erreurs | non (long) |
| `../server/test/room_flow.py`, `../server/test/two_clients.py n` | Mode en ligne avec deux navigateurs (serveur local `npm run dev` dans `server/`) | oui |
| `visual/` | Vérifications visuelles ponctuelles (captures dans `$SHOTS`, par défaut `/tmp/gwent-shots`) | non |
