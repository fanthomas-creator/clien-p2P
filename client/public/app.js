class P2PApp {
  constructor() {
    this.state = {
      connected: false,
      p2pConnected: false,
      localKeyPair: null,
      localPubKeyHash: null,
      remotePubKeyHash: null,
      roomId: null,
      peerId: null,
      remotePeerId: null
    };

    this.webrtc = null;
    this.isInitiator = false;
  }

  async init() {
    console.log('[APP] Initializing...');

    await vault.init();

    this.state.localKeyPair = await crypto.generateKeyPair();
    const pubKeyJwk = await crypto.exportPublicKey(this.state.localKeyPair.publicKey);
    this.state.localPubKeyHash = await crypto.hashPublicKey(pubKeyJwk);

    this.state.peerId = 'peer-' + Math.random().toString(36).substr(2, 9);

    await vault.save('keypair', {
      peerId: this.state.peerId,
      pubKeyHash: this.state.localPubKeyHash
    });

    this.setupEventListeners();
    this.updateUI();

    console.log('[APP] Ready');
  }

  setupEventListeners() {
    document.getElementById('generate-room-btn').addEventListener('click', () => {
      const roomId = 'room-' + Math.random().toString(36).substr(2, 12);
      document.getElementById('room-id').value = roomId;
    });

    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.toggleSetupPanel());
    }

    document.getElementById('connect-btn').addEventListener('click', () => this.connect());
    document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());

    document.getElementById('message-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    
    document.getElementById('image-btn').addEventListener('click', () => {
      document.getElementById('image-input').click();
    });

    
    document.getElementById('image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.sendImage(file);
        e.target.value = '';  
      }
    });

    document.getElementById('panic-btn').addEventListener('click', () => this.panic());

    signaling.on('joined', (data) => this.onSignalingJoined(data));
    signaling.on('peer-joined', (data) => this.onPeerJoined(data));
    signaling.on('offer', (data) => this.onOfferReceived(data));
    signaling.on('answer', (data) => this.onAnswerReceived(data));
    signaling.on('ice-candidate', (data) => this.onIceCandidateReceived(data));
    signaling.on('error', (error) => this.onSignalingError(error));
    signaling.on('disconnected', () => this.onSignalingDisconnected());
  }

  toggleSetupPanel() {
    const setupPanel = document.getElementById('setup-panel');
    const chatPanel = document.getElementById('chat-panel');
    
    setupPanel.classList.toggle('hidden');
    chatPanel.classList.toggle('visible');
  }

  async connect() {
    const serverUrl = document.getElementById('server-url').value;
    let roomId = document.getElementById('room-id').value;

    if (!roomId) {
      roomId = 'room-' + Math.random().toString(36).substr(2, 12);
      document.getElementById('room-id').value = roomId;
    }

    if (!serverUrl) {
      this.addSystemMessage('❌ Entrez l\'URL du serveur');
      return;
    }

    try {
      document.getElementById('connect-btn').disabled = true;
      document.getElementById('connect-btn').textContent = 'Connexion...';

      this.state.roomId = roomId;

      await signaling.connect(serverUrl, roomId, this.state.peerId);

      this.state.connected = true;
      this.updateUI();
      this.addSystemMessage(`✅ Connecté à la room: ${roomId}`);

    } catch (error) {
      console.error('[APP] Connection error:', error);
      this.addSystemMessage(`❌ Erreur: ${error.message}`);
      document.getElementById('connect-btn').disabled = false;
      document.getElementById('connect-btn').textContent = 'Rejoindre';
    }
  }

  async onSignalingJoined(data) {
    console.log('[APP] Joined room');

    document.getElementById('my-peer-id').textContent = this.state.peerId;
    document.getElementById('current-room').textContent = this.state.roomId;

    document.getElementById('connection-info').style.display = 'block';
    document.getElementById('input-section').style.display = 'block';

    this.addSystemMessage(`🔐 Mon ID: ${this.state.peerId.substring(0, 12)}...`);
    
    if (window.innerWidth < 768) {
      this.toggleSetupPanel();
    }
  }

  async onPeerJoined(data) {
    console.log('[APP] Peer joined:', data.peerId);

    this.state.remotePeerId = data.peerId;
    this.addSystemMessage(`👥 Un pair a rejoint: ${data.peerId.substring(0, 12)}...`);

    await this.initializeWebRTC();

    this.isInitiator = true;
    try {
      const pubKeyJwk = await crypto.exportPublicKey(this.state.localKeyPair.publicKey);
      const offer = await this.webrtc.createOffer();
      
      signaling.sendOffer({
        ...offer,
        pubKey: pubKeyJwk
      });
      this.addSystemMessage('📤 Offre WebRTC envoyée');
    } catch (error) {
      console.error('[APP] Error creating offer:', error);
      this.addSystemMessage(`❌ Erreur création offre: ${error.message}`);
    }
  }

  async onOfferReceived(data) {
    console.log('[APP] Offer received from:', data.from);

    this.state.remotePeerId = data.from;

    if (!this.webrtc) {
      await this.initializeWebRTC();
      this.isInitiator = false;
    }

    try {
      if (!data.offer.pubKey) {
        throw new Error('Peer public key not included in offer');
      }

      const pubKeyJwk = await crypto.exportPublicKey(this.state.localKeyPair.publicKey);
      const answer = await this.webrtc.handleOffer(data.offer, data.offer.pubKey);
      
      signaling.sendAnswer({
        ...answer,
        pubKey: pubKeyJwk
      });
      this.addSystemMessage('📥 Offre reçue, réponse envoyée');
    } catch (error) {
      console.error('[APP] Error handling offer:', error);
      this.addSystemMessage(`❌ Erreur traitement offre: ${error.message}`);
    }
  }

  async onAnswerReceived(data) {
    console.log('[APP] Answer received from:', data.from);

    try {
      if (!data.answer.pubKey) {
        throw new Error('Peer public key not included in answer');
      }

      await this.webrtc.handleAnswer(data.answer, data.answer.pubKey);
      this.addSystemMessage('📬 Réponse reçue');
    } catch (error) {
      console.error('[APP] Error handling answer:', error);
      this.addSystemMessage(`❌ Erreur traitement réponse: ${error.message}`);
    }
  }

  async onIceCandidateReceived(data) {
    try {
      await this.webrtc.addIceCandidate(data.candidate);
    } catch (error) {
      console.error('[APP] Error adding ICE candidate:', error);
    }
  }

  async initializeWebRTC() {
    this.webrtc = new WebRTCManager(this.state.localKeyPair);
    await this.webrtc.init();

    this.webrtc.on('ice-candidate', (candidate) => {
      signaling.sendIceCandidate(candidate);
    });

    this.webrtc.on('data-channel-open', () => {
      console.log('[APP] Data channel opened');
      this.state.p2pConnected = true;
      this.addSystemMessage('🔗 Connexion P2P établie');
      this.updateUI();
    });

    this.webrtc.on('data-channel-closed', () => {
      this.state.p2pConnected = false;
      this.addSystemMessage('❌ Connexion P2P fermée');
      this.updateUI();
    });

    this.webrtc.on('message', (msg) => {
     
      if (msg.type === 'image') {
        this.addRemoteImage(msg.image);
      } 
      
      else {
        this.addRemoteMessage(msg.text);
      }
    });

    this.webrtc.on('connection-state', (state) => {
      console.log('[APP] WebRTC connection state:', state);
      if (state === 'failed') {
        this.addSystemMessage('❌ Connexion P2P échouée');
      }
    });
  }

  async sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();

    if (!text) return;
    
    if (text.length > 1000) {
      this.addSystemMessage('❌ Message trop long (max 1000 caractères)');
      return;
    }

    if (!this.webrtc || !this.webrtc.isConnected()) {
      this.addSystemMessage('❌ Connexion P2P non établie');
      return;
    }

    try {
      await this.webrtc.sendMessage(text);
      this.addLocalMessage(text);
      input.value = '';
    } catch (error) {
      console.error('[APP] Error sending message:', error);
      this.addSystemMessage(`❌ Erreur envoi: ${error.message}`);
    }
  }

  
  async sendImage(imageFile) {

    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          
          const imageBase64 = e.target.result;
          
         
          if (imageBase64.length > 5 * 1024 * 1024) {
            this.addSystemMessage('❌ Image trop grande (max 5MB)');
            reject(new Error('Image too large'));
            return;
          }

         
          if (!this.webrtc || !this.webrtc.isConnected()) {
            this.addSystemMessage('❌ Connexion P2P non établie');
            reject(new Error('Not connected'));
            return;
          }

         
          await this.webrtc.sendImage(imageBase64);
          
         
          this.addLocalImage(imageBase64);
          
          resolve();
          
        } catch (error) {
          console.error('[APP] Error sending image:', error);
          this.addSystemMessage(`❌ Erreur envoi image: ${error.message}`);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
     
      reader.readAsDataURL(imageFile);
    });
  }

  async panic() {
    if (!confirm('⚠️ Cela va DÉTRUIRE toutes les données et fermer la connexion. Êtes-vous sûr?')) {
      return;
    }

    console.warn('[APP] PANIC MODE ACTIVATED');

    if (this.webrtc) {
      this.webrtc.close();
    }

    signaling.disconnect();

    await vault.panic();

    this.state = {};
    this.webrtc = null;

    this.addSystemMessage('🚨 Mode panic activé - Destruction complète');

    setTimeout(() => {
      window.location.href = 'about:blank';
    }, 1000);
  }

  onSignalingError(error) {
    console.error('[APP] Signaling error:', error);
    this.addSystemMessage(`❌ Erreur serveur: ${error.message}`);
  }

  onSignalingDisconnected() {
    this.state.connected = false;
    this.addSystemMessage('❌ Déconnecté du serveur');
    this.updateUI();
  }

  addLocalMessage(text) {
    const messagesDiv = document.getElementById('messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'message local';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const p = document.createElement('p');
    p.textContent = text;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = '📍 ' + new Date().toLocaleTimeString();
    
    contentDiv.appendChild(p);
    contentDiv.appendChild(timeSpan);
    msgEl.appendChild(contentDiv);
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  addRemoteMessage(text) {
    const messagesDiv = document.getElementById('messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'message remote';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const p = document.createElement('p');
    p.textContent = text;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = '📍 ' + new Date().toLocaleTimeString();
    
    contentDiv.appendChild(p);
    contentDiv.appendChild(timeSpan);
    msgEl.appendChild(contentDiv);
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  addLocalImage(imageBase64) {
    const messagesDiv = document.getElementById('messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'message local';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const img = document.createElement('img');
    img.src = imageBase64;
    img.style.maxWidth = '200px';
    img.style.maxHeight = '200px';
    img.style.borderRadius = '4px';
    img.style.cursor = 'pointer';
    
    img.addEventListener('click', () => {
      const fullWindow = window.open('', '_blank');
      fullWindow.document.write(`<img src="${imageBase64}" style="max-width: 100%; max-height: 100%;">`);
    });
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = '📍 ' + new Date().toLocaleTimeString();
    
    contentDiv.appendChild(img);
    contentDiv.appendChild(timeSpan);
    msgEl.appendChild(contentDiv);
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  addRemoteImage(imageBase64) {
    const messagesDiv = document.getElementById('messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'message remote';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const img = document.createElement('img');
    img.src = imageBase64;
    img.style.maxWidth = '200px';
    img.style.maxHeight = '200px';
    img.style.borderRadius = '4px';
    img.style.cursor = 'pointer';
    
    img.addEventListener('click', () => {
      const fullWindow = window.open('', '_blank');
      fullWindow.document.write(`<img src="${imageBase64}" style="max-width: 100%; max-height: 100%;">`);
    });
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = '📍 ' + new Date().toLocaleTimeString();
    
    contentDiv.appendChild(img);
    contentDiv.appendChild(timeSpan);
    msgEl.appendChild(contentDiv);
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  addSystemMessage(text) {
    const messagesDiv = document.getElementById('messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'message system';
    
    const p = document.createElement('p');
    p.textContent = text;
    
    msgEl.appendChild(p);
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  updateUI() {
    const statusEl = document.getElementById('status');
    if (this.state.p2pConnected) {
      statusEl.textContent = '🟢 P2P Connecté';
      statusEl.className = 'status connected';
      document.getElementById('security-message').textContent = '🔒 Chiffrement E2E actif';
      document.getElementById('encryption-status').textContent = '🔐 Chiffré';
    } else if (this.state.connected) {
      statusEl.textContent = '🟡 Signalisation connectée';
      statusEl.className = 'status connected';
      document.getElementById('security-message').textContent = 'En attente de connexion P2P...';
    } else {
      statusEl.textContent = '🔴 Déconnecté';
      statusEl.className = 'status disconnected';
      document.getElementById('encryption-status').textContent = '🔓 Non chiffré';
    }
  }
}

function copyToClipboard(selector, event) {
  const el = document.querySelector(selector);
  const text = el.textContent;
  const btn = event.currentTarget || event.target;
  const original = btn.textContent;
  
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✅';
    setTimeout(() => btn.textContent = original, 2000);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const app = new P2PApp();
  await app.init();
});
