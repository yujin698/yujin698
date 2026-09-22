# Cloudline

A cozy, procedural 3D tram game. Take the Coastal Line to Mango Tide, return to
Saltlight Terminus on the Lantern Line, and stop at Oliver’s Cloudworks to give
your carriage a little character.

## Play

Open **index.html** in a modern browser. No build or installation is needed.
The single HTML file loads pinned Three.js 0.160.1 from jsDelivr; an internet
connection is required. Google Fonts is optional and has system fallbacks.
All scenery, textures, characters, and audio are generated in code.

For a local server:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000`. WebGL / hardware acceleration must be enabled.

| Control | Action |
| --- | --- |
| W / Up or hold Power | Accelerate |
| S / Down or hold Brake | Brake |
| Left / Right | Look around |
| E | Open doors when stopped within 8 m of the platform |
| C | Cycle scenic, follow, and driver cameras |
| R | Visit / leave the workshop |
| Space / Escape | Pause |

Aim for 25–32 km/h, slow down before curves and crosswinds, and brake early.
After overshooting a platform, continue around the loop for another attempt.
Station doors lock the controls while passengers board. Smooth arrivals earn up
to 75 coins plus streak tips. Coins and upgrades persist in browser storage when
available. Sound is opt-in.

The workshop pauses your route and offers two free cosmetic upgrades. Wait for
the installation to finish, then leave to resume from the same place.

## Development checks

Node.js 22+ is recommended. Runtime remains just `index.html`; the dependencies
below are only for development.

```sh
npm ci
npm run lint
npm test
```

The checks lint the inline JavaScript and run the game against real Three.js
geometry with a simulated renderer and clock. They cover both route arrivals,
boarding, controls, workshop installation and exit, persistence, and comfort
physics. They do not replace visual WebGL testing in a real browser.