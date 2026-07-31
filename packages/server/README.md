# @opencards/server

Server-authoritative match relay for OpenCards. This package is a thin network
transport wrapper around `@opencards/core`: it holds one in-process
`ViewerHandle` per player seat and pushes hidden-info-safe `view` projections to
WebSocket clients. It implements **no game rules** — the deterministic engine in
`@opencards/core` does all the work.

## Run locally

From the repo root:

```sh
npm run dev:server
```

Starts a WebSocket server on `http://localhost:8787`. Override the port with the
`PORT` environment variable. `GET /health` returns `200 ok` for health checks.

## Wire protocol

A client opens a WebSocket and immediately sends a `join` message. All messages
are JSON.

Client → server:

```json
{ "type": "join", "matchCode": "room-1", "player": "p1" }
{ "type": "command", "command": { "type": "drawCard", "player": "p1" } }
```

Server → client:

```json
{ "type": "joined", "player": "p1" }
{ "type": "view", "view": { "..." }, "legal": [ "..." ] }
{ "type": "issues", "issues": [ "..." ] }
{ "type": "error", "message": "..." }
```

- `joined` is sent once after a successful `join`.
- `view` carries the hidden-info-safe player view plus the list of legal
  commands; it is pushed on join and after every accepted command.
- `issues` reports a rejected command (e.g. illegal in the current state).
- `error` reports protocol problems, seat conflicts, or a client trying to issue
  a command for the other seat.

## Known v1 gaps

- No matchmaking: clients must agree on a `matchCode` out of band.
- No accounts or persistence: all matches are in-memory; restarting the process
  loses every match.
- No reconnection grace period: a dropped connection simply frees the seat.
- No TLS: assume a reverse proxy terminates `wss://` in front of this server.
- No rate limiting beyond the sender/`command.player` check.
