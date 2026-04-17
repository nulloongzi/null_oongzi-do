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
    } catch (error) {
        alert("로그인 실패: " + error.message);
    }
};

window.registerWithEmail = async function () {
    var email = document.getElementById('emailInput').value;
    var pw = document.getElementById('pwInput').value;
    if (!email || !pw) { alert('정보를 입력해주세요.'); return; }
    try {
        await firebase.auth().createUserWithEmailAndPassword(email, pw);
    } catch (e) {
        alert(e.message);
    }
};

window.loginWithEmail = async function () {
    var email = document.getElementById('emailInput').value;
    var pw = document.getElementById('pwInput').value;
    if (!email || !pw) { alert('정보를 입력해주세요.'); return; }
    try {
        await firebase.auth().signInWithEmailAndPassword(email, pw);
    } catch (e) {
        alert(e.message);
    }
};

window.logout = function () {
    if (confirm("로그아웃 하시겠습니까?")) {
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

window.loadOrCreateUserProfile = async function (user) {
    var userRef = window.firebaseDoc(window.firebaseDB, 'users', user.uid);
    try {
        var userSnap = await userRef.get();
        if (userSnap.exists) {
            window.currentProfileData = userSnap.data();
            if (!window.currentProfileData.customTeams) window.currentProfileData.customTeams = {};
        } else {
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
            var userData = {
                nickname: newNameObj.base,
                suffix: newNameObj.code,
                full_nickname: newNameObj.full,
                color: newNameObj.color,
                created_at: now,
                email: user.email,
                bookmarks: [],
                customTeams: {}
            };
            await window.firebaseSetDoc(userRef, userData);
            window.currentProfileData = userData;
            alert("환영합니다! [" + newNameObj.full + "]님이 되셨습니다!");
        }

        // PR #1: localStorage merge logic
        var localBM = JSON.parse(localStorage.getItem(LS_BOOKMARKS_KEY) || 'null');
        var localCT = JSON.parse(localStorage.getItem(LS_CUSTOM_TEAMS_KEY) || 'null');
        if ((localBM && localBM.some(function (b) { return b !== null; })) || (localCT && Object.keys(localCT).length > 0)) {
            // merge custom teams
            var mergedCT = Object.assign({}, localCT || {}, window.currentProfileData.customTeams || {});
            // merge bookmarks - Firestore priority, fill empty slots with local
            var mergedBM = (window.currentProfileData.bookmarks || []).slice();
            while (mergedBM.length < 5) mergedBM.push(null);
            (localBM || []).forEach(function (localId) {
                if (localId && mergedBM.indexOf(localId) === -1) {
                    var idx = mergedBM.indexOf(null);
                    if (idx !== -1) mergedBM[idx] = localId;
                }
            });
            // save to Firestore
            var mergeRef = window.firebaseDoc(window.firebaseDB, 'users', user.uid);
            await window.firebaseUpdateDoc(mergeRef, { bookmarks: mergedBM, customTeams: mergedCT });
            window.currentProfileData.bookmarks = mergedBM;
            window.currentProfileData.customTeams = mergedCT;
            // clear localStorage
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
