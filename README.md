# 🎬 Trouve le titre

Jeu multijoueur entre potes, dans le navigateur : on crée un lobby, on partage un code à 4 lettres, et on joue avec des miniatures YouTube.

## Lancer le jeu

Il faut [Node.js](https://nodejs.org) 18 ou plus.

```bash
npm install
npm start
```

Puis ouvre <http://localhost:3000>. Sous Windows, tu peux aussi double-cliquer sur `start.bat`.

### Jouer avec des potes à distance

Le serveur doit être joignable par tes potes. Deux options :

- **Test rapide** : expose ton PC avec un tunnel, par exemple `npx localtunnel --port 3000` ou `cloudflared tunnel --url http://localhost:3000`, et envoie le lien obtenu.
- **En ligne en permanence** : déploie le dossier sur un hébergeur Node (Render, Railway, Fly.io…). La commande de démarrage est `npm start`, le port est lu dans la variable `PORT`. Les WebSockets doivent être autorisés (c'est le cas sur ces hébergeurs).

## Les modes

| Mode | Principe |
|---|---|
| ✍️ **Petit bac** | Le chef choisit une base de vidéos. Pour chaque miniature, le titre est caché : chacun écrit le sien avant la fin du temps. Option **extrait vidéo de 5 / 10 / 15 s** pour s'aider. Quand tout le monde a validé (ou que le temps est écoulé), on passe à la suivante. À la fin, **review** : chaque réponse est montrée une par une, tout le monde la note sur 5. Classement final. |
| 🎨 **Téléphone arabe** | Chacun apporte une vidéo. Tour 1 : tu reçois la miniature d'un autre et tu écris le titre. Tour 2 : tu reçois un titre et tu **dessines** la miniature. Tour 3 : tu devines le titre d'un dessin… Reveal façon Gartic Phone, étape par étape, mené par le chef. Il faut 3 joueurs minimum. |
| 🕵️ **Qui a sorti ça ?** | Miniature floutée (le flou diminue avec le temps) et titre visible : retrouve la chaîne. Les fautes de frappe et les noms partiels sont tolérés. Indices automatiques (longueur du nom, puis première lettre). Les points dépendent de la rapidité. |

## Astuces

- Les titres et chaînes sont récupérés automatiquement depuis YouTube (sans clé d'API). Si une vidéo n'a pas pu être lue, le chef peut compléter le titre et la chaîne à la main (✏️).
- **💾 Sauvegarder la base** garde ta liste de vidéos dans ton navigateur ; **📂 Charger ma base** la remet dans un nouveau lobby.
- La base de vidéos reste secrète : seul le chef voit les titres avant la partie.
- Si quelqu'un recharge la page, il revient automatiquement dans la partie.
- Le lien « Copier le lien » pré-remplit le code chez tes potes.

## Structure

```
server/
  index.js          HTTP + WebSocket, dessins servis sur /d/…
  lobby.js          Lobbies, joueurs, réglages, base de vidéos
  youtube.js        Lecture des liens, titre + chaîne via oEmbed
  games/            base.js, classic.js, chain.js, creator.js (un fichier par mode)
public/
  index.html, css/styles.css
  js/               main.js (routeur), net.js, store.js, dom.js
  js/screens/       home, lobby, classic, chain, creator
  js/components/    timer, widgets, planche à dessin, extrait vidéo
tests/
  smoke.mjs         3 faux joueurs jouent les 3 modes (serveur lancé requis)
  join-bot.mjs      un faux joueur pour tester l'interface seul
```

Le serveur décide de tout (timers, scores, ce que chacun a le droit de voir) : les clients ne reçoivent jamais un titre avant son tour.
