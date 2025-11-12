// IndexedDB Manager for USM Attendance System
// This provides permanent browser-based database storage

class AttendanceDB {
    constructor() {
        this.dbName = 'USMAttendanceDB';
        this.version = 1;
        this.db = null;
    }

    // Initialize database
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('Database failed to open');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores (tables)
                
                // Students store
                if (!db.objectStoreNames.contains('students')) {
                    const studentStore = db.createObjectStore('students', { keyPath: 'id' });
                    studentStore.createIndex('owner', 'owner', { unique: false });
                    studentStore.createIndex('name', 'name', { unique: false });
                    studentStore.createIndex('program', 'program', { unique: false });
                }

                // NFC Registry store
                if (!db.objectStoreNames.contains('nfcRegistry')) {
                    db.createObjectStore('nfcRegistry', { keyPath: 'nfcId' });
                }

                // Users store (for authentication)
                if (!db.objectStoreNames.contains('users')) {
                    db.createObjectStore('users', { keyPath: 'email' });
                }

                // Sessions store (for attendance sessions)
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
                    sessionStore.createIndex('owner', 'owner', { unique: false });
                    sessionStore.createIndex('date', 'date', { unique: false });
                }

                console.log('Database setup complete');
            };
        });
    }

    // Generic method to add data
    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Generic method to update data
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Generic method to get data by key
    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Generic method to get all data
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Generic method to delete data
    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get data by index
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Clear all data from a store
    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Student-specific methods
    async addStudent(student) {
        return this.put('students', student);
    }

    async getStudent(studentId) {
        return this.get('students', studentId);
    }

    async getAllStudents() {
        return this.getAll('students');
    }

    async getStudentsByOwner(owner) {
        return this.getByIndex('students', 'owner', owner);
    }

    async deleteStudent(studentId) {
        return this.delete('students', studentId);
    }

    // NFC Registry methods
    async addNFCTag(nfcData) {
        return this.put('nfcRegistry', nfcData);
    }

    async getNFCTag(nfcId) {
        return this.get('nfcRegistry', nfcId);
    }

    async getAllNFCTags() {
        return this.getAll('nfcRegistry');
    }

    // User methods
    async addUser(user) {
        return this.put('users', user);
    }

    async getUser(email) {
        return this.get('users', email);
    }

    async getAllUsers() {
        return this.getAll('users');
    }

    // Export all data to JSON
    async exportToJSON() {
        try {
            const students = await this.getAllStudents();
            const nfcRegistry = await this.getAllNFCTags();
            const users = await this.getAllUsers();
            const sessions = await this.getAll('sessions');

            return {
                exportDate: new Date().toISOString(),
                version: '1.0',
                database: 'IndexedDB',
                students: students,
                nfcRegistry: nfcRegistry,
                users: users.map(u => ({ email: u.email })), // Don't export passwords
                sessions: sessions
            };
        } catch (error) {
            console.error('Export error:', error);
            throw error;
        }
    }

    // Import data from JSON
    async importFromJSON(data) {
        try {
            let importCount = 0;

            // Import students
            if (data.students && Array.isArray(data.students)) {
                for (const student of data.students) {
                    await this.addStudent(student);
                    importCount++;
                }
            }

            // Import NFC registry
            if (data.nfcRegistry && Array.isArray(data.nfcRegistry)) {
                for (const nfc of data.nfcRegistry) {
                    await this.addNFCTag(nfc);
                }
            }

            // Import sessions if present
            if (data.sessions && Array.isArray(data.sessions)) {
                for (const session of data.sessions) {
                    await this.put('sessions', session);
                }
            }

            return importCount;
        } catch (error) {
            console.error('Import error:', error);
            throw error;
        }
    }

    // Migrate data from localStorage to IndexedDB
    async migrateFromLocalStorage() {
        try {
            let migratedCount = 0;

            // Migrate students
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);

                if (key && key.startsWith('allStudents_')) {
                    const owner = key.replace('allStudents_', '');
                    const students = JSON.parse(localStorage.getItem(key));

                    if (Array.isArray(students)) {
                        for (const student of students) {
                            await this.addStudent({
                                ...student,
                                owner: owner
                            });
                            migratedCount++;
                        }
                    }
                }
            }

            // Migrate NFC registry
            const nfcRegistry = localStorage.getItem('nfcRegistry');
            if (nfcRegistry) {
                const registry = JSON.parse(nfcRegistry);
                for (const [nfcId, data] of Object.entries(registry)) {
                    await this.addNFCTag({
                        nfcId: nfcId,
                        ...data
                    });
                }
            }

            // Migrate users
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);

                if (key && key.startsWith('user_')) {
                    const email = key.replace('user_', '');
                    const userData = JSON.parse(localStorage.getItem(key));
                    await this.addUser({
                        email: email,
                        password: userData.password
                    });
                }
            }

            console.log(`Migration complete: ${migratedCount} students migrated`);
            return migratedCount;
        } catch (error) {
            console.error('Migration error:', error);
            throw error;
        }
    }
}

// Create global instance
const attendanceDB = new AttendanceDB();

// Initialize on load
attendanceDB.init().then(() => {
    console.log('AttendanceDB ready');
}).catch(error => {
    console.error('Failed to initialize database:', error);
});
