# Poker Planning

A serverless poker planning app for agile teams. Estimate stories together in real-time — no backend required.

**https://allless.github.io/poker-planning**

## Stack

- **Preact** — UI framework
- **Yjs** — CRDT for conflict-free state sync
- **MQTT** — real-time messaging via `broker.emqx.io`
- **Vite** — build tool
- **TypeScript** — strict mode

## How it works

1. Create or join a room (rooms are identified by a short ID)
2. Enter your name
3. Pick a card to vote
4. Reveal votes when everyone is ready
5. Start a new round

State is synced between all participants via MQTT pub/sub. Yjs handles conflict resolution so there's no central server or host — all peers are equal.

## Development

```sh
npm install
npm run dev        # dev server on localhost:5173
npm test           # run tests
npm run build      # production build to dist/
```

## TODO

- [ ] **WebRTC upgrade** — currently all traffic routes through a public MQTT broker (`broker.emqx.io`). Would prefer direct peer-to-peer via WebRTC for privacy. Trystero was attempted but had peer discovery bugs. Revisit with custom signaling over MQTT.
- [ ] **Chrome extension** — inject poker planning UI directly into GitHub, next to the Story Points field in GitHub Projects. Room ID auto-derived from `owner/repo/issue#`. Target injection points:
  - GitHub issue page sidebar
  - GitHub Projects board side panel (when an issue is opened)
