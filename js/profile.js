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

// 로그인 수단 판별: 카카오/네이버는 커스텀 토큰 uid 규칙('kakao:{id}'/'naver:{id}',
// functions/social-auth.js), 구글/이메일은 Firebase providerData로 구분.
window.detectLoginProvider = function (user) {
    if (!user) return '';
    var uid = user.uid || '';
    if (uid.indexOf('kakao:') === 0) return 'kakao';
    if (uid.indexOf('naver:') === 0) return 'naver';
    var pd = user.providerData || [];
    for (var i = 0; i < pd.length; i++) {
        if (pd[i] && pd[i].providerId === 'google.com') return 'google';
    }
    for (var j = 0; j < pd.length; j++) {
        if (pd[j] && pd[j].providerId === 'password') return 'rice';
    }
    return '';
};

// 로그인 수단 스탬프 아이콘 (정적 SVG — 사용자 입력 없음).
// 단색 currentColor로 그려 CSS(.pc-provider-*)가 색을 정한다.
var PROVIDER_MARK_SVG = {
    // 카카오: 말풍선
    kakao: '<svg viewBox="0 0 24 24" fill="currentColor">' +
        '<path d="M12 4C7 4 3 7.2 3 11.2c0 2.6 1.7 4.9 4.3 6.2l-.8 3c-.1.4.3.7.6.5l3.5-2.3c.5.1.9.1 1.4.1 5 0 9-3.2 9-7.2S17 4 12 4z"/></svg>',
    // 네이버: 옛 로고 오마주 — 날개 달린 모자
    naver: '<svg viewBox="0 0 24 24" fill="currentColor">' +
        '<circle cx="12" cy="5.2" r="1.1"/>' +
        '<path d="M12 6.4c-3.2 0-5.8 2-6 4.6h12c-.2-2.6-2.8-4.6-6-4.6z"/>' +
        '<path d="M4.6 11.8h14.8a1 1 0 0 1 0 2H4.6a1 1 0 0 1 0-2z"/>' +
        '<path d="M6.3 10.2C5 8.4 3 7.5 1.2 7.7c.4 1.9 1.9 3.3 3.8 3.6z"/>' +
        '<path d="M17.7 10.2c1.3-1.8 3.3-2.7 5.1-2.5-.4 1.9-1.9 3.3-3.8 3.6z"/></svg>',
    // 누룽지도: 로고 단순화 — 그릇에 얹어진 밥
    rice: '<svg viewBox="0 0 24 24" fill="currentColor">' +
        '<path d="M12 4.6c-1.9 0-3.2 1-3.9 2.2-1-.4-2.4.3-2.4 1.7 0 .9.7 1.5 1.4 1.5h9.8c.7 0 1.4-.6 1.4-1.5 0-1.4-1.4-2.1-2.4-1.7-.7-1.2-2-2.2-3.9-2.2z"/>' +
        '<path d="M4.2 11.6h15.6c0 3.1-2.5 5.6-5.8 6.2v.9c0 .4-.3.7-.7.7h-2.6a.7.7 0 0 1-.7-.7v-.9c-3.3-.6-5.8-3.1-5.8-6.2z"/></svg>'
    // google은 SVG 대신 문자 'G' 스탬프 (CSS .pc-provider-google)
};

// 네임카드 왼쪽 상단에 로그인 수단 스탬프를 찍는다 (이스터에그).
function renderProviderMark() {
    var mark = document.getElementById('pcProviderMark');
    var card = document.getElementById('myProfileCard');
    if (!mark || !card) return;
    var p = window.detectLoginProvider(window.currentUser);
    mark.className = 'pc-provider-mark' + (p ? ' pc-provider-' + p : '');
    if (!p) {
        mark.innerHTML = '';
        card.classList.remove('has-provider-mark');
        return;
    }
    mark.innerHTML = p === 'google' ? 'G' : (PROVIDER_MARK_SVG[p] || '');
    card.classList.add('has-provider-mark');
}

window.renderProfileCard = function () {
    if (!window.currentProfileData) return;

    var card = document.getElementById('myProfileCard');
    var nicknameEl = document.getElementById('pcNickname');
    var dateEl = document.getElementById('pcDate');
    var mainTeamEl = document.getElementById('pcMainTeam');
    var riceWatermark = document.getElementById('pcRiceWatermark');

    // 닉네임 표시
    var displayName = window.currentProfileData.full_nickname || window.currentProfileData.nickname || window.t('guest');
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
    renderProviderMark();

    // 가입일 표시 (NaN 방지)
    if (window.currentProfileData.created_at) {
        var d;
        if (window.currentProfileData.created_at.seconds) {
            d = new Date(window.currentProfileData.created_at.seconds * 1000);
        } else {
            d = new Date(window.currentProfileData.created_at);
        }
        dateEl.innerText = window.t('joined') + d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate();
    }

    // 찜한 팀 표시
    var bookmarks = window.currentProfileData.bookmarks || [];
    var validTeamIds = bookmarks.filter(function (id) { return id !== null; });

    if (validTeamIds.length > 0) {
        var mainId = validTeamIds[0];
        var mainTeam = window.findClub(mainId);
        if (mainTeam) {
            var icon = mainTeam.isCustom ? "🍙 " : "🏆 ";
            // XSS 방지: mainTeam.name을 textContent로
            mainTeamEl.textContent = icon + (mainTeam.name || '');
        } else {
            mainTeamEl.innerText = window.t('no_data');
        }
    } else {
        mainTeamEl.innerText = window.t('no_saved_team');
    }
};

// 언어 전환 시 로그인된 프로필 카드 재렌더링
document.addEventListener('nurungji:langchange', function () {
    if (window.currentProfileData && window.renderProfileCard) window.renderProfileCard();
});

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
    var closing = overlay.style.display === 'flex';
    overlay.style.display = closing ? 'none' : 'flex';
    // 로그인 게이트 상태에서 로그인 없이 닫으면: 작성 중이던 등록 폼을 복원하고 대기 해제
    if (closing && window._regResumePending) {
        window._regResumePending = false;
        var hint = document.getElementById('regLoginHint');
        if (hint) hint.style.display = 'none';
        var reg = document.getElementById('regModalOverlay');
        if (reg) reg.style.display = 'flex';
    }
};
