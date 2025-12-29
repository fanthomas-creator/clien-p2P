**Client-Mobile Documentation**

- **Description:**: Client mobile (web) pour messagerie P2P chiffrée — UI + orchestration.

- **Files covered:**: app.js, crypto.js, signaling.js, webrtc.js, vault.js, styles.css, index.html

Summary: each section below shows the file purpose, the full source (for reference) and a concise, line-grouped explanation of the code behavior (handlers, initialization, critical lines). For full per-line trace, open the source side-by-side with this doc.

**app.js**: Orchestrateur UI + signalisation + WebRTC
- Lines ~1-30: Class `P2PApp` constructor: initializes `state` object, `webrtc`, `isInitiator`.
- init(): generates keypair, computes public-key-hash, sets `peerId`, saves key info to vault, attaches event listeners and updates UI.
- setupEventListeners(): attaches DOM listeners for generate-room, connect, send, panic and binds signaling events (`joined`, `peer-joined`, `offer`, `answer`, `ice-candidate`, `error`, `disconnected`).
- connect(): reads `server-url` and `room-id`, connects to signaling, updates state/UI and handles errors.
- onPeerJoined(), onOfferReceived(), onAnswerReceived(): negotiate WebRTC offers/answers and include public keys for ECDH exchange.
- initializeWebRTC(): creates `WebRTCManager`, sets event handlers for ICE, data-channel events and messages.
- sendMessage(): validates message length and connectivity, encrypts/sends via WebRTC, updates UI.
- panic(): closes webrtc, disconnects signaling, calls `vault.panic()` to destroy stored data and navigates to `about:blank`.
- addLocalMessage/addRemoteMessage/addSystemMessage(): DOM helpers to append messages safely (use textContent to avoid XSS).
- updateUI(): updates status and encryption indicators according to `state`.

**crypto.js**: WebCrypto helpers (ECDH + AES-GCM)
- constructor: sets algorithms (ECDH P-256 fallback) and AES-GCM 256-bit.
- generateKeyPair(): uses `crypto.subtle.generateKey` for ECDH.
- exportPublicKey/importPublicKey(): JWK export/import helpers for exchanging over signaling.
- deriveSharedKey(): performs ECDH deriveBits and imports raw bits as AES-GCM key for encrypt/decrypt.
- encrypt()/decrypt(): AES-GCM encryption with 12-byte IV, store IV + ciphertext combined and Base64 encode/decode.
- hashPublicKey()/hashString(): SHA-256 hashing helpers; `hashPublicKey` returns first 16 hex chars as short id.

**signaling.js**: WebSocket client for signaling
- SignalingClient.connect(): opens WebSocket, resolves on open, starts heartbeat, binds `onmessage` to `handleMessage`.
- sendOffer/sendAnswer/sendIceCandidate(): wrap payloads with `type`, `roomId`, `peerId`.
- handleMessage(): routes `joined`, `peer-joined`, `offer`, `answer`, `ice-candidate`, `pong`, `error` to listeners.
- startHeartbeat()/stopHeartbeat(): ping every 30s while connected.

**webrtc.js**: Peer connection & DataChannel management
- constructor: stores localKeyPair, ICE servers, local lists.
- init(): creates RTCPeerConnection, sets `onicecandidate`, `ondatachannel`, `onconnectionstatechange`.
- createOffer(): creates datachannel, sets local description and returns offer SDP.
- handleOffer()/handleAnswer(): import remote public key (JWK), derive shared AES key, set remote description, create/set local description for answer.
- setupDataChannel(): handle open/close/error/message; on message decrypt with `crypto.decrypt(sharedKey, payload)` and emit `message` events.
- sendMessage(): encrypts text with `sharedKey` and sends JSON {payload, timestamp} over datachannel.

**vault.js**: Ephemeral IndexedDB vault
- constructor: unique db name per session; registers `beforeunload` to destroy DB.
- init(): opens IndexedDB, creates object store `vault-store`.
- save()/retrieve(): save encrypted JSON values under `key` (uses deterministic raw AES key derived from a padded key string), retrieve decrypts and parses JSON.
- getAllMessages()/delete()/destroy()/panic(): helpers to list, clear and destroy DB; `panic()` forces destruction.

**styles.css / index.html**: UI layout and elements referenced by `app.js` (ids: `server-url`, `room-id`, `generate-room-btn`, `connect-btn`, `send-btn`, `message-input`, `messages`, `panic-btn`, `connection-info`, `input-section`, `my-peer-id`, `current-room`, `status`, `encryption-status`).

Notes / Security highlights:
- All message text inserted to DOM uses `textContent` → prevents XSS.
- Public keys are exchanged in JWK form carried in offer/answer payloads; shared secret derived locally.
- Vault uses IndexedDB but encrypts data before persisting; DB name is ephemeral per session.

See `client-mobile/` for original sources.
