/**
 * profile.js - Profile card rendering, rice name generation, nickname management
 * Depends on: firebase-init.js (window.firebaseDB, window.firebaseDoc, window.firebaseUpdateDoc)
 * Depends on: auth.js (window.currentUser, window.currentProfileData)
 * Depends on: app.js or map.js (window.findClub)
 */

var riceData = [
    { name: "현미밥", weight: 50, color: "#FFF9C4" },
    { name: "백미밥", weight: 50, color: "#FFF59D" },
    { name: "흑미밥", weight: 50, color: "#FFF176" },
    { name: "보리밥", weight: 50, color: "#FFEE58" },
    { name: "콩밥", weight: 50, color: "#FFD54F" },
    { name: "오곡밥", weight: 50, color: "#FFCA28" },
    { name: "차조밥", weight: 10, color: "#FFE082" },
    { name: "기장밥", weight: 10, color: "#FFECB3" },
    { name: "숭늉", weight: 10, color: "#FFE0B2" },
    { name: "볶음밥", weight: 10, color: "#FFCC80" },
    { name: "비빔밥", weight: 10, color: "#FFB74D" },
    { name: "김밥", weight: 10, color: "#FFF8E1" },
    { name: "주먹밥", weight: 10, color: "#FFECB3" },
    { name: "유부초밥", weight: 10, color: "#FFE082" },
    { name: "덮밥", weight: 10, color: "#FFF59D" },
    { name: "국밥", weight: 10, color: "#FFCCBC" },
    { name: "솥밥", weight: 10, color: "#D7CCC8" },
    { name: "약밥", weight: 10, color: "#CFD8DC" },
    { name: "죽", weight: 10, color: "#F5F5F5" },
    { name: "곤드레밥", weight: 10, color: "#C5E1A5" },
    { name: "영양밥", weight: 10, color: "#E6EE9C" },
    { name: "치밥", weight: 10, color: "#FFAB91" },
    { name: "햇반", weight: 10, color: "#FFFFFF" },
    { name: "고봉밥", weight: 10, color: "#BCAAA4" },
    { name: "밥아저씨", weight: 1, color: "#81D4FA" }
];

window.generateRiceName = function () {
    var totalWeight = 0;
    for (var i = 0; i < riceData.length; i++) totalWeight += riceData[i].weight;
    var randomNum = Math.random() * totalWeight;
    var selected = riceData[0];
    for (var j = 0; j < riceData.length; j++) {
        if (randomNum < riceData[j].weight) { selected = riceData[j]; break; }
        randomNum -= riceData[j].weight;
    }
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var suffix = "";
    for (var k = 0; k < 3; k++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    return { base: selected.name, code: suffix, full: selected.name + "-" + suffix, color: selected.color };
};

window.checkDuplicateNickname = async function (nickname) {
    if (!window.firebaseDB) return false;
    var usersRef = window.firebaseDB.collection('users');
    var q = usersRef.where('full_nickname', '==', nickname);
    var snapshot = await q.get();
    return !snapshot.empty;
};

window.renderProfileCard = function () {
    if (!window.currentProfileData) return;

    var card = document.getElementById('myProfileCard');
    var nicknameEl = document.getElementById('pcNickname');
    var dateEl = document.getElementById('pcDate');
    var mainTeamEl = document.getElementById('pcMainTeam');
    var riceWatermark = document.getElementById('pcRiceWatermark');

    // 닉네임 표시
    var displayName = window.currentProfileData.full_nickname || window.currentProfileData.nickname || "손님";
    nicknameEl.innerText = displayName;

    // 밥 종류(배경색) 결정
    var riceName = "백미밥";
    if (window.currentProfileData.nickname) {
        riceName = window.currentProfileData.nickname;
    } else if (window.currentProfileData.full_nickname) {
        riceName = window.currentProfileData.full_nickname.split('-')[0];
    }

    var foundRice = riceData.find(function (r) { return r.name === riceName; });
    var bgColor = foundRice ? foundRice.color : "#fff9c4";
    card.style.backgroundColor = bgColor;
    riceWatermark.innerText = riceName;

    // 가입일 표시 (NaN 방지)
    if (window.currentProfileData.created_at) {
        var d;
        if (window.currentProfileData.created_at.seconds) {
            d = new Date(window.currentProfileData.created_at.seconds * 1000);
        } else {
            d = new Date(window.currentProfileData.created_at);
        }
        dateEl.innerText = "가입일: " + d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate();
    }

    // 찜한 팀 표시
    var bookmarks = window.currentProfileData.bookmarks || [];
    var validTeamIds = bookmarks.filter(function (id) { return id !== null; });

    if (validTeamIds.length > 0) {
        var mainId = validTeamIds[0];
        var mainTeam = window.findClub(mainId);
        if (mainTeam) {
            var icon = mainTeam.isCustom ? "🍙 " : "🏆 ";
            mainTeamEl.innerHTML = icon + mainTeam.name;
        } else {
            mainTeamEl.innerText = "데이터 없음";
        }
    } else {
        mainTeamEl.innerText = "찜한 팀이 없어요";
    }
};

window.editNickname = async function () {
    if (!window.currentUser || !window.firebaseDB) return;
    var currentName = document.getElementById('pcNickname').innerText;
    var newName = prompt("변경할 닉네임을 입력해주세요 (하이픈 금지)", currentName);
    if (newName && newName.trim() !== "" && newName !== currentName) {
        if (newName.includes("-")) {
            alert("닉네임에 하이픈(-)은 사용할 수 없습니다.\n하이픈은 오직 '밥아저씨'가 랜덤으로 지어준 이름에만 허용됩니다!");
            return;
        }
        try {
            var isDup = await window.checkDuplicateNickname(newName);
            if (isDup) { alert("이미 누군가 사용 중인 이름입니다."); return; }
            var userRef = window.firebaseDoc(window.firebaseDB, 'users', window.currentUser.uid);
            await window.firebaseUpdateDoc(userRef, { full_nickname: newName });
            window.currentProfileData.full_nickname = newName;
            window.renderProfileCard();
            alert("닉네임 변경 완료!");
        } catch (e) { alert("오류: " + e); }
    }
};

window.toggleProfileCard = function () {
    var overlay = document.getElementById('profileOverlay');
    overlay.style.display = (overlay.style.display === 'flex') ? 'none' : 'flex';
};
