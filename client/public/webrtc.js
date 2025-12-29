class WebRTCManager {
  constructor(localKeyPair) {
    this.localKeyPair = localKeyPair;
    this.remotePubKey = null;
    this.sharedKey = null;
    
    this.peerConnection = null;
    this.dataChannel = null;
    
    this.listeners = {};
    
    this.iceServers = [
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:stun1.l.google.com:19302'] }
    ];

    this.iceCandidates = [];
  }

  async init() {
    const peerConnectionConfig = {
      iceServers: this.iceServers
    };

    this.peerConnection = new RTCPeerConnection(peerConnectionConfig);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] ICE candidate:', event.candidate);
        this.emit('ice-candidate', event.candidate);
        this.iceCandidates.push(event.candidate);
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      console.log('[WebRTC] Data channel received');
      this.setupDataChannel(event.channel);
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.peerConnection.connectionState);
      this.emit('connection-state', this.peerConnection.connectionState);
    };

    console.log('[WebRTC] Initialized');
  }

  setupDataChannel(channel) {
    this.dataChannel = channel;

    this.dataChannel.onopen = () => {
      console.log('[DataChannel] Opened');
      this.emit('data-channel-open');
    };

    this.dataChannel.onclose = () => {
      console.log('[DataChannel] Closed');
      this.emit('data-channel-closed');
    };

    this.dataChannel.onerror = (error) => {
      console.error('[DataChannel] Error:', error);
      this.emit('data-channel-error', error);
    };

    this.dataChannel.onmessage = async (event) => {
      try {
        const encryptedMessage = JSON.parse(event.data);
        const decrypted = await crypto.decrypt(
          this.sharedKey,
          encryptedMessage.payload
        );
        this.emit('message', {
          text: decrypted,
          timestamp: encryptedMessage.timestamp,
          encrypted: true
        });
      } catch (error) {
        console.error('[DataChannel] Decryption error:', error);
      }
    };
  }

  async createOffer() {
    this.dataChannel = this.peerConnection.createDataChannel('messaging', {
      ordered: true
    });
    this.setupDataChannel(this.dataChannel);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    return offer;
  }

  async handleOffer(offer, remotePubKeyJwk) {
    this.remotePubKey = await crypto.importPublicKey(remotePubKeyJwk);
    this.sharedKey = await crypto.deriveSharedKey(
      this.localKeyPair.privateKey,
      this.remotePubKey
    );

    const sdpOffer = new RTCSessionDescription(offer);
    await this.peerConnection.setRemoteDescription(sdpOffer);

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    return answer;
  }

  async handleAnswer(answer, remotePubKeyJwk) {
    this.remotePubKey = await crypto.importPublicKey(remotePubKeyJwk);
    this.sharedKey = await crypto.deriveSharedKey(
      this.localKeyPair.privateKey,
      this.remotePubKey
    );

    const sdpAnswer = new RTCSessionDescription(answer);
    await this.peerConnection.setRemoteDescription(sdpAnswer);
  }

  async addIceCandidate(candidate) {
    try {
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error('[WebRTC] Error adding ICE candidate:', error);
    }
  }

  async sendMessage(text) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('DataChannel not open');
    }

    const encrypted = await crypto.encrypt(this.sharedKey, text);
    const message = {
      payload: encrypted,
      timestamp: Date.now()
    };

    this.dataChannel.send(JSON.stringify(message));
  }

  isConnected() {
    return this.peerConnection &&
           this.peerConnection.connectionState === 'connected' &&
           this.dataChannel &&
           this.dataChannel.readyState === 'open';
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

  close() {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    console.log('[WebRTC] Closed');
  }
}
