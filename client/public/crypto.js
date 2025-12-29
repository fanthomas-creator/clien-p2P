class CryptoManager {
  constructor() {
    this.algorithm = {
      name: 'ECDH',
      namedCurve: 'P-256',
    };
    this.cipherAlgorithm = {
      name: 'AES-GCM',
      length: 256
    };
  }

  async generateKeyPair() {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        this.algorithm,
        true,
        ['deriveKey', 'deriveBits']
      );
      return keyPair;
    } catch (error) {
      console.error('[CRYPTO] Erreur génération clés:', error);
      throw error;
    }
  }

  async exportPublicKey(publicKey) {
    return await window.crypto.subtle.exportKey('jwk', publicKey);
  }

  async importPublicKey(jwk) {
    return await window.crypto.subtle.importKey(
      'jwk',
      jwk,
      this.algorithm,
      true,
      []
    );
  }

  async deriveSharedKey(privateKey, publicKey) {
    const sharedBits = await window.crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicKey },
      privateKey,
      256
    );

    return await window.crypto.subtle.importKey(
      'raw',
      sharedBits,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(key, plaintext) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(plaintext);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encodedText
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(key, ciphertextB64) {
    const combined = Uint8Array.from(
      atob(ciphertextB64),
      c => c.charCodeAt(0)
    );

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const plaintext = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(plaintext);
  }

  async hashPublicKey(publicKeyJwk) {
    const encoded = new TextEncoder().encode(JSON.stringify(publicKeyJwk));
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded);
    
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16);
  }

  async hashString(str) {
    const encoded = new TextEncoder().encode(str);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

const crypto = new CryptoManager();
