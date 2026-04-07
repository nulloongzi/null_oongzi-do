// firebase-init.js
// Firebase compat SDK initialization + modular-API-compatible wrappers
// Requires firebase-app-compat, firebase-auth-compat, firebase-firestore-compat, firebase-storage-compat loaded via CDN

(function () {
    var firebaseConfig = {
        apiKey: "AIzaSyCnzjy0jzK6HD34Z-i7tapG3y-hkrA-XaM",
        authDomain: "nulloongzi-do.firebaseapp.com",
        projectId: "nulloongzi-do",
        storageBucket: "nulloongzi-do.firebasestorage.app",
        messagingSenderId: "1024551952678",
        appId: "1:1024551952678:web:91a0df59c12b68b968a1e7",
        measurementId: "G-L1KWREQEMW"
    };

    var app, auth, db, storage;
    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        storage = firebase.storage();
        console.log("Firebase compat SDK 연결 성공!");
    } catch (e) {
        console.error("Firebase 초기화 실패:", e);
    }

    // ── Auth ──
    window.firebaseAuth = auth;
    window.GoogleAuthProvider = firebase.auth.GoogleAuthProvider;

    // ── Firestore: expose raw db ──
    window.firebaseDB = db;

    // ── Firestore: modular-API-compatible wrappers ──
    window.firebaseDoc = function (db, collectionPath, docId) {
        return db.collection(collectionPath).doc(docId);
    };

    window.firebaseCollection = function (db, collectionName) {
        return db.collection(collectionName);
    };

    window.firebaseSetDoc = function (docRef, data, options) {
        if (options && options.merge) {
            return docRef.set(data, { merge: true });
        }
        return docRef.set(data);
    };

    window.firebaseAddDoc = function (collectionRef, data) {
        return collectionRef.add(data);
    };

    window.firebaseGetDoc = function (docRef) {
        return docRef.get().then(function (snap) {
            return {
                exists: function () { return snap.exists; },
                data: function () { return snap.data(); }
            };
        });
    };

    window.firebaseUpdateDoc = function (docRef, data) {
        return docRef.update(data);
    };

    window.firebaseGetDocs = function (queryRef) {
        return queryRef.get();
    };

    window.firebaseQuery = function (collectionRef) {
        return collectionRef;
    };

    window.firebaseWhere = function (collectionRef, field, op, val) {
        return collectionRef.where(field, op, val);
    };

    window.firebaseServerTimestamp = function () {
        return firebase.firestore.FieldValue.serverTimestamp();
    };

    // ── Storage: modular-API-compatible wrappers ──
    window.firebaseStorage = storage;

    window.firebaseRef = function (storage, path) {
        return storage.ref(path);
    };

    window.firebaseUploadBytes = function (ref, file) {
        return ref.put(file);
    };

    window.firebaseGetDownloadURL = function (ref) {
        return ref.getDownloadURL();
    };
})();
