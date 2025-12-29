class EphemeralVault {
  constructor() {
    this.dbName = 'P2P_Vault_' + Date.now();
    this.db = null;
    this.storeName = 'vault-store';
    this.initialized = false;

    window.addEventListener('beforeunload', () => this.destroy());
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        console.log('[VAULT] Initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async save(key, value) {
    if (!this.initialized) await this.init();

    const encrypted = await crypto.encrypt(
      await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(key.padEnd(32, '0')).slice(0, 32),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      ),
      JSON.stringify(value)
    );

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add({ key, encrypted, timestamp: Date.now() });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async retrieve(key) {
    if (!this.initialized) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = async () => {
        const records = request.result.filter(r => r.key === key);
        if (records.length === 0) {
          resolve(null);
          return;
        }

        try {
          const decrypted = await crypto.decrypt(
            await window.crypto.subtle.importKey(
              'raw',
              new TextEncoder().encode(key.padEnd(32, '0')).slice(0, 32),
              { name: 'AES-GCM' },
              false,
              ['encrypt', 'decrypt']
            ),
            records[0].encrypted
          );
          resolve(JSON.parse(decrypted));
        } catch (error) {
          reject(error);
        }
      };
    });
  }

  async getAllMessages() {
    if (!this.initialized) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result.map(r => ({ key: r.key, timestamp: r.timestamp })));
      };
    });
  }
// copyritht 2025 P2P grezaud
  async delete(key) {
    if (!this.initialized) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async destroy() {
    if (this.db) {
      this.db.close();
    }

    return new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      request.onerror = () => resolve();
      request.onsuccess = () => {
        console.log('[VAULT] Destroyed');
        resolve();
      };
    });
  }

  async panic() {
    console.warn('[PANIC] Destroying vault immediately...');
    await this.destroy();
    this.initialized = false;
  }
}

const vault = new EphemeralVault();
