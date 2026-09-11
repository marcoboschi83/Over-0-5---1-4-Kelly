# Over 0.5 Trade Tracker

Tracker statico per GitHub Pages.

## File
- `index.html` — interfaccia
- `style.css` — grafica
- `tracker.js` — logica, bankroll e storico
- `matches.json` — partite qualificate e classificazione

## Logica bankroll
- A+ = 20% della cassa corrente
- A = 15%
- B = 10%
- C = NO TRADE
- Stake arrotondato all'euro
- WIN = +10% netto dello stake
- NULLA = 0
- LOSS = -100% dello stake

Lo storico viene salvato nel `localStorage` del browser. Usa **Esporta backup** periodicamente.

## Aggiornare le partite
Sostituisci solo `matches.json` nel repository. Il tracker leggerà automaticamente il nuovo file.

## GitHub Pages
Carica i 4 file nella root del repository e abilita GitHub Pages dal branch principale.
