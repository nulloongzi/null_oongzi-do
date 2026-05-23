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

    // App Check (#7): reCAPTCHA v3 사이트 키.
    // Firebase Console > App Check > 앱 등록(reCAPTCHA v3)에서 발급받은 "사이트 키"를 넣는다.
    // (사이트 키는 공개값이라 커밋해도 안전. 비밀키는 콘솔에만 저장됨)
    // 키가 비어 있으면 App Check 활성화를 건너뛴다(점진 롤아웃 안전장치).
    var RECAPTCHA_V3_SITE_KEY = ""; // TODO: 콘솔에서 발급 후 입력

    var app, auth, db, storage, functions;
    try {
        app = firebase.initializeApp(firebaseConfig);

        // App Check는 다른 서비스 초기화 전에 활성화해야 토큰이 첨부됨
        if (RECAPTCHA_V3_SITE_KEY && typeof firebase.appCheck === "function") {
            try {
                firebase.appCheck().activate(RECAPTCHA_V3_SITE_KEY, true);
                console.log("App Check 활성화됨");
            } catch (acErr) {
                console.warn("App Check 활성화 실패:", acErr && acErr.message);
            }
        }

        auth = firebase.auth();
        db = firebase.firestore();
        storage = firebase.storage();
        if (typeof firebase.functions === "function") {
            functions = firebase.functions();
        }
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

    // ── Functions: 호출 가능한 콜러블 래퍼 ──
    window.firebaseFunctions = functions;
    window.firebaseCallable = function (name) {
        if (!functions) return null;
        return functions.httpsCallable(name);
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
