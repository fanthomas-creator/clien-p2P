class SignalingClient {
  constructor() {
    this.ws = null;
    this.serverUrl = null;
    this.roomId = null;
    this.peerId = null;
    this.listeners = {};
    this.heartbeatInterval = null;
    this.connected = false;
  }

  async connect(serverUrl, roomId, peerId) {
    this.serverUrl = serverUrl;
    this.roomId = roomId;
    this.peerId = peerId;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
          console.log('[SIGNALING] Connected to server');
          this.connected = true;
          this.join();
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onerror = (error) => {
          console.error('[SIGNALING] WebSocket error:', error);
          this.connected = false;
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[SIGNALING] Disconnected from server');
          this.connected = false;
          this.stopHeartbeat();
          this.emit('disconnected');
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  join() {
    this.send({
      type: 'join',
      roomId: this.roomId,
      peerId: this.peerId
    });
  }

  sendOffer(offer) {
    this.send({
      type: 'offer',
      roomId: this.roomId,
      peerId: this.peerId,
      payload: offer
    });
  }

  sendAnswer(answer) {
    this.send({
      type: 'answer',
      roomId: this.roomId,
      peerId: this.peerId,
      payload: answer
    });
  }

  sendIceCandidate(candidate) {
    this.send({
      type: 'ice-candidate',
      roomId: this.roomId,
      peerId: this.peerId,
      payload: candidate
    });
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[SIGNALING] WebSocket not open');
    }
  }

  handleMessage(message) {
    const { type, payload } = message;

    switch (type) {
      case 'joined':
        console.log('[SIGNALING] Joined room:', message.roomId);
        this.emit('joined', message);
        break;

      case 'peer-joined':
        console.log('[SIGNALING] Peer joined:', message.peerId);
        this.emit('peer-joined', message);
        break;

      case 'offer':
        console.log('[SIGNALING] Received offer from:', message.from);
        this.emit('offer', { from: message.from, offer: message.payload });
        break;

      case 'answer':
        console.log('[SIGNALING] Received answer from:', message.from);
        this.emit('answer', { from: message.from, answer: message.payload });
        break;

      case 'ice-candidate':
        console.log('[SIGNALING] Received ICE candidate');
        this.emit('ice-candidate', { from: message.from, candidate: message.payload });
        break;

      case 'pong':
        break;

      case 'error':
        console.error('[SIGNALING] Server error:', message.message);
        this.emit('error', new Error(message.message));
        break;

      default:
        console.warn('[SIGNALING] Unknown message type:', type);
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }

  isConnected() {
    return this.connected;
  }
}

const signaling = new SignalingClient();
