# Poker Planning - Project Plan

## Overview

A **Planning Poker** (Scrum Poker) web app for agile teams to estimate story points collaboratively. Hosted as static files on **GitHub Pages**, using **WebRTC** (peer-to-peer) for real-time room communication — no backend server required.

---

## Missing Details & Assumptions

The following details are not specified. Assumptions are marked with `[A]`; items needing your input are marked with `[?]`.

### Product Questions

| #   | Question                                                   | Assumption / Default                                                                             |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | **Card values** — Fibonacci, T-shirt sizes, custom?        | `[A]` Fibonacci: 0, 1, 2, 3, 5, 8, 13, 21, 34, ?, coffee                                         |
| 2   | **Room capacity** — max participants?                      | `[A]` Up to ~15 peers (WebRTC mesh practical limit)                                              |
| 3   | **Persistence** — do rooms or history survive refresh?     | `[A]` No persistence; rooms are ephemeral. Refresh = rejoin via same link                        |
| 4   | **Roles** — host vs voter vs observer?                     | `[A]` One host (room creator) controls reveal/reset; everyone else votes. Optional observer mode |
| 5   | **Issue tracking** — paste issue titles/links?             | `[A]` Simple text field for issue title/description — no integration                             |
| 6   | **Timer** — countdown for voting?                          | `[A]` Not in v1, can add later                                                                   |
| 7   | **Results** — show average, consensus, distribution?       | `[A]` Show all votes + average + most-common after reveal                                        |
| 8   | **Auth** — any login or just display names?                | `[A]` Display name only, entered on join                                                         |
| 9   | **Signaling server** — WebRTC needs one for peer discovery | `[?]` Options below                                                                              |

### Technical Decisions

| #   | Decision         | Options                                                                                                                                                                                                                                          |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Signaling**    | **a)** Use a free public signaling service (e.g. PeerJS cloud server — default, zero-cost) `[A]` **b)** Self-host a tiny signaling server **c)** Use a serverless signaling trick (e.g. Firebase free tier, or copy-paste offer/answer manually) |
| 2   | **P2P library**  | `[A]` **PeerJS** — simplest WebRTC wrapper, has free cloud signaling                                                                                                                                                                             |
| 3   | **UI framework** | `[A]` Vanilla HTML/CSS/JS (zero build step, pure static files). Could also use a CDN-loaded lib like Preact                                                                                                                                      |
| 4   | **Bundling**     | `[A]` None — ES modules loaded from CDN (e.g. esm.sh or unpkg). Keeps it truly static                                                                                                                                                            |
| 5   | **Styling**      | `[A]` Minimal custom CSS, mobile-friendly. Could add a tiny CSS framework (e.g. Pico CSS)                                                                                                                                                        |

---

## Architecture

```
GitHub Pages (static hosting)
  |
  +-- index.html          ← Landing page: create or join room
  +-- room.html            ← Room view: voting, results
  +-- css/style.css        ← Styles
  +-- js/
       +-- app.js          ← Entry point, routing
       +-- peer.js          ← PeerJS wrapper: connect, send, receive
       +-- room.js          ← Room state machine: join, vote, reveal, reset
       +-- ui.js            ← DOM rendering: cards, participants, results
```

### P2P Communication Flow

```
1. Host creates room → PeerJS gives unique peer ID → ID becomes room code
2. Host shares link:  https://<user>.github.io/poker-planning/#room=<peer-id>
3. Joiner opens link → connects to host's peer ID via PeerJS
4. Host acts as hub (star topology): relays state to all peers
5. Messages: { type: "vote" | "reveal" | "reset" | "join" | "state-sync", ... }
```

**Star topology** (host = hub) is simpler and more reliable than full mesh for this use case.

---

## Effort Estimate

| Phase                      | Tasks                                                                                  | Estimate         |
| -------------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| **1. Project scaffold**    | HTML files, CSS skeleton, folder structure, GitHub Pages setup                         | ~1 hour          |
| **2. P2P layer**           | PeerJS integration, connect/disconnect, message protocol, reconnection                 | ~3–4 hours       |
| **3. Room logic**          | State machine (lobby → voting → revealed → reset), host relay, join/leave handling     | ~3–4 hours       |
| **4. UI — Landing page**   | Create room form, join room form, display name input                                   | ~1 hour          |
| **5. UI — Room page**      | Card deck, participant list, vote status indicators, reveal animation, results summary | ~3–4 hours       |
| **6. Polish & edge cases** | Mobile responsiveness, disconnect handling, error toasts, copy-link button             | ~2–3 hours       |
| **7. Deploy & test**       | GitHub Pages config, cross-browser testing, multi-device testing                       | ~1 hour          |
| **Total**                  |                                                                                        | **~14–18 hours** |

---

## Task Breakdown

### Phase 1: Project Scaffold

- [ ] Create folder structure (`index.html`, `room.html`, `css/`, `js/`)
- [ ] Set up base HTML with meta tags, viewport, favicon placeholder
- [ ] Add base CSS: reset, variables, layout, card styles
- [ ] Initialize git repo, add `.nojekyll` for GitHub Pages
- [ ] Load PeerJS from CDN via ES module / script tag

### Phase 2: P2P Communication Layer (`js/peer.js`)

- [ ] Initialize PeerJS with auto-generated ID (host) or connect to known ID (joiner)
- [ ] Define message protocol schema:
  - `join` — new participant announces name
  - `state-sync` — host broadcasts full room state to all peers
  - `vote` — participant sends vote to host
  - `reveal` — host tells all peers to show votes
  - `reset` — host clears all votes for next round
  - `kick` — host removes a participant
- [ ] Handle connection events: open, data, close, error
- [ ] Implement host relay: on receiving a message, update state and broadcast to all
- [ ] Handle peer disconnection and cleanup

### Phase 3: Room State Machine (`js/room.js`)

- [ ] Define room state: `{ phase, participants[], votes{}, issue, hostId }`
- [ ] Phase transitions: `lobby → voting → revealed → voting (reset)`
- [ ] Host: merge incoming votes, trigger reveal, trigger reset
- [ ] Joiner: send votes to host, apply state-sync updates from host
- [ ] Handle late-joiners: host sends current state on new connection
- [ ] Handle host disconnect: show "host left" message (no host migration in v1)

### Phase 4: Landing Page UI (`index.html`)

- [ ] "Create Room" button — generates room, redirects to `room.html#room=<id>`
- [ ] "Join Room" input — enter room code or paste full link
- [ ] Display name input (saved to localStorage for convenience)
- [ ] App title, brief description, and footer

### Phase 5: Room Page UI (`room.html`, `js/ui.js`)

- [ ] Top bar: room code, copy-link button, issue title input (host only)
- [ ] Participant list: name, vote status (voted / not voted / revealed value)
- [ ] Card deck: clickable cards with Fibonacci values, highlight selected
- [ ] Reveal button (host only): shows all votes
- [ ] Results panel: individual votes, average, most common
- [ ] Reset button (host only): clears votes for next round
- [ ] Card flip animation on reveal
- [ ] "You are the host" / "Waiting for host to reveal" status indicators

### Phase 6: Polish & Edge Cases

- [ ] Mobile-responsive layout (cards wrap, touch-friendly sizes)
- [ ] Toast notifications: "X joined", "X left", "connection lost"
- [ ] Reconnection attempt on disconnect
- [ ] Prevent double-voting (replace previous vote)
- [ ] Handle room-not-found / host-not-reachable error
- [ ] Accessible: keyboard navigation, sufficient contrast, aria labels
- [ ] Loading / connecting spinner

### Phase 7: Deploy & Test

- [ ] Enable GitHub Pages on `main` branch
- [ ] Add `.nojekyll` file
- [ ] Test: 2–5 users across devices (desktop + mobile)
- [ ] Test: host leaves, peer leaves, peer rejoins
- [ ] Test: Chrome, Firefox, Safari

---

## Future Enhancements (Out of Scope for v1)

- Custom card decks (T-shirt sizes, powers of 2)
- Voting timer / countdown
- Host migration when host disconnects
- Export results to CSV / clipboard
- Dark mode toggle
- Sound effects on reveal
- Firebase/Supabase signaling as PeerJS alternative
- Multiple rounds history within a session
