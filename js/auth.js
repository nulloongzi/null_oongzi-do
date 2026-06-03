/**
 * auth.js - Authentication, user profile loading, localStorage merge
 * Depends on: firebase-init.js (window.firebaseDB, window.firebaseDoc, window.firebaseSetDoc,
 *             window.firebaseUpdateDoc, firebase global)
 * Depends on: profile.js (window.generateRiceName, window.checkDuplicateNickname, window.renderProfileCard)
 */

var LS_BOOKMARKS_KEY = 'nulloong_bookmarks';
var LS_CUSTOM_TEAMS_KEY = 'nulloong_custom_teams';

window.currentUser = null;
window.currentProfileData = null;
window.isAdmin = false;

// /admins/{uid} 문서 존재 여부로 관리자 판별 (로그인 시 1회 체크해서 캐시)
window.checkIsAdmin = async function (user) {
    if (!user) { window.isAdmin = false; return false; }
    try {
        var adminRef = window.firebaseDoc(window.firebaseDB, 'admins', user.uid);
        var snap = await adminRef.get();
        window.isAdmin = snap.exists;
        return window.isAdmin;
    } catch (e) {
        console.warn('checkIsAdmin error:', e && e.message);
        window.isAdmin = false;
        return false;
    }
};

// 특정 팀에 대해 현재 유저가 삭제/수정 권한이 있는지
window.canModifyClub = function (club) {
    if (!window.currentUser || !club) return false;
    if (window.isAdmin) return true;
    return club.registered_by && club.registered_by === window.currentUser.uid;
};

window.loginWithGoogle = async function () {
    var provider = new firebase.auth.GoogleAuthProvider();
    try {
        await firebase.auth().signInWithPopup(provider);
        if (window.track) window.track('login', { method: 'google' });
    } catch (error) {
        alert(window.t('au_login_fail') + error.message);
    }
};

window.registerWithEmail = async function () {
    var email = document.getElementById('emailInput').value;
    var pw = document.getElementById('pwInput').value;
    if (!email || !pw) { alert(window.t('au_enter_info')); return; }
    try {
        await firebase.auth().createUserWithEmailAndPassword(email, pw);
        if (window.track) window.track('sign_up', { method: 'email' });
    } catch (e) {
        alert(e.message);
    }
};

window.loginWithEmail = async function () {
    var email = document.getElementById('emailInput').value;
    var pw = document.getElementById('pwInput').value;
    if (!email || !pw) { alert(window.t('au_enter_info')); return; }
    try {
        await firebase.auth().signInWithEmailAndPassword(email, pw);
        if (window.track) window.track('login', { method: 'email' });
    } catch (e) {
        alert(e.message);
    }
};

window.logout = function () {
    if (confirm(window.t('au_logout_confirm'))) {
        firebase.auth().signOut().then(function () {
            document.getElementById('profileOverlay').style.display = 'none';
            document.getElementById('lunchboxOverlay').style.display = 'none';
        });
    }
};

window.updateProfileUI = function (isLoggedIn) {
    var loginSection = document.getElementById('loginSection');
    var profileContent = document.getElementById('profileContent');
    if (isLoggedIn) {
        if (loginSection) loginSection.style.display = 'none';
        if (profileContent) profileContent.style.display = 'block';
    } else {
        if (loginSection) loginSection.style.display = 'flex';
        if (profileContent) profileContent.style.display = 'none';
    }
};

// users 비공개 필드(email/bookmarks/customTeams)는 /users/{uid}/private/profile에 저장.
// 공개 doc(/users/{uid})에는 닉네임/색상만 둔다. window.currentProfileData는
// 두 곳을 머지한 뷰로 유지하여 호출자 인터페이스는 동일하게 보존.
window.userPrivateRef = function (uid) {
    return window.firebaseDB.collection('users').doc(uid).collection('private').doc('profile');
};

window.loadOrCreateUserProfile = async function (user) {
    var userRef = window.firebaseDoc(window.firebaseDB, 'users', user.uid);
    var privateRef = window.userPrivateRef(user.uid);
    try {
        var userSnap = await userRef.get();

        if (!userSnap.exists) {
            // 신규 가입: 닉네임 생성 + 공개/비공개 doc 분리 저장
            var newNameObj = null;
            var isUnique = false;
            var retryCount = 0;
            while (!isUnique && retryCount < 10) {
                newNameObj = window.generateRiceName();
                var isDup = await window.checkDuplicateNickname(newNameObj.full);
                if (!isDup) isUnique = true; else retryCount++;
            }
            if (!isUnique) newNameObj.full += Date.now().toString().slice(-4);
            var now = new Date();
            var publicData = {
                nickname: newNameObj.base,
                suffix: newNameObj.code,
                full_nickname: newNameObj.full,
                color: newNameObj.color,
                created_at: now
            };
            var privateData = {
                email: user.email,
                bookmarks: [],
                customTeams: {}
            };
            await window.firebaseSetDoc(userRef, publicData);
            await window.firebaseSetDoc(privateRef, privateData);
            window.currentProfileData = Object.assign({}, publicData, privateData);
            alert(window.tf('au_welcome', { name: newNameObj.full }));
        } else {
            // 기존 가입자: 공개 + 비공개 머지, 필요 시 lazy migration
            var publicData2 = userSnap.data();
            var privateSnap = await privateRef.get();
            var privateData2 = privateSnap.exists ? privateSnap.data() : {};

            var needsMigration =
                publicData2.email !== undefined ||
                publicData2.bookmarks !== undefined ||
                publicData2.customTeams !== undefined;

            if (needsMigration) {
                // 1) public에 있던 비공개 필드를 private로 복사 (private에 이미 값이 있으면 우선)
                var migrated = {};
                if (publicData2.email !== undefined && privateData2.email === undefined) {
                    migrated.email = publicData2.email;
                }
                if (publicData2.bookmarks !== undefined && privateData2.bookmarks === undefined) {
                    migrated.bookmarks = publicData2.bookmarks;
                }
                if (publicData2.customTeams !== undefined && privateData2.customTeams === undefined) {
                    migrated.customTeams = publicData2.customTeams;
                }
                if (Object.keys(migrated).length > 0) {
                    await privateRef.set(migrated, { merge: true });
                    privateData2 = Object.assign({}, privateData2, migrated);
                }
                // 2) public에서 비공개 필드 제거 (rules의 hasOnly 통과를 위해)
                var del = firebase.firestore.FieldValue.delete();
                var cleanup = {};
                if (publicData2.email !== undefined) cleanup.email = del;
                if (publicData2.bookmarks !== undefined) cleanup.bookmarks = del;
                if (publicData2.customTeams !== undefined) cleanup.customTeams = del;
                try {
                    await userRef.update(cleanup);
                } catch (cleanupErr) {
                    // 정리 실패해도 사용자 경험은 영향 없음 (다음 로그인 때 재시도)
                    console.warn("public users doc 정리 실패:", cleanupErr && cleanupErr.message);
                }
            }

            if (!privateData2.customTeams) privateData2.customTeams = {};
            if (!privateData2.bookmarks) privateData2.bookmarks = [];
            // 공개 doc에서 비공개 필드를 제거한 클린 카피
            var publicClean = {
                nickname: publicData2.nickname,
                suffix: publicData2.suffix,
                full_nickname: publicData2.full_nickname,
                color: publicData2.color,
                created_at: publicData2.created_at
            };
            window.currentProfileData = Object.assign({}, publicClean, privateData2);
        }

        // localStorage 머지 (북마크/customTeams) - private 경로로 저장
        var localBM = JSON.parse(localStorage.getItem(LS_BOOKMARKS_KEY) || 'null');
        var localCT = JSON.parse(localStorage.getItem(LS_CUSTOM_TEAMS_KEY) || 'null');
        if ((localBM && localBM.some(function (b) { return b !== null; })) || (localCT && Object.keys(localCT).length > 0)) {
            var mergedCT = Object.assign({}, localCT || {}, window.currentProfileData.customTeams || {});
            var mergedBM = (window.currentProfileData.bookmarks || []).slice();
            while (mergedBM.length < 5) mergedBM.push(null);
            (localBM || []).forEach(function (localId) {
                if (localId && mergedBM.indexOf(localId) === -1) {
                    var idx = mergedBM.indexOf(null);
                    if (idx !== -1) mergedBM[idx] = localId;
                }
            });
            await privateRef.set({ bookmarks: mergedBM, customTeams: mergedCT }, { merge: true });
            window.currentProfileData.bookmarks = mergedBM;
            window.currentProfileData.customTeams = mergedCT;
            localStorage.removeItem(LS_BOOKMARKS_KEY);
            localStorage.removeItem(LS_CUSTOM_TEAMS_KEY);
        }

        window.renderProfileCard();
    } catch (error) {
        console.error("DB Error:", error);
    }
};

window.setupAuthListener = function () {
    firebase.auth().onAuthStateChanged(async function (user) {
        if (user) {
            window.currentUser = user;
            await window.loadOrCreateUserProfile(user);
            await window.checkIsAdmin(user);
            window.updateProfileUI(true);
        } else {
            window.currentUser = null;
            window.currentProfileData = null;
            window.isAdmin = false;
            window.updateProfileUI(false);
            // Reset watermark and background on logout
            var wm = document.getElementById('pcRiceWatermark');
            if (wm) wm.innerText = '';
            var card = document.getElementById('myProfileCard');
            if (card) card.style.backgroundColor = '#fff9c4';
        }
    });
};
