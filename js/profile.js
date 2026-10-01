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

// 예약 닉네임: 서비스 이름('누룽지'·'Nulloongzi'·'null_oongzi' …)은 공식 계정만 쓴다.
// 공백·기호·대소문자를 걷어내고 비교한다. firestore.rules isReservedNickname 과 같은 목록 —
// 실제로 막는 건 룰이고, 여기서는 저장 전에 이유를 알려줄 뿐이다.
var RESERVED_NICK_RE = /(누룽지|nulloongzi|nuloongzi|nullongzi|nurungji|nurungzi|nuroongzi)/;
window.isReservedNickname = function (name) {
    return RESERVED_NICK_RE.test(String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9가-힣]/g, ''));
};
// 예약 닉네임을 쓸 수 있는 계정인가(운영자 또는 official_accounts/{uid}). 룰과 같은 기준.
window.canUseReservedNickname = async function (user) {
    if (!user || !window.firebaseDB) return false;
    if (window.isAdmin) return true;
    try {
        var snap = await window.firebaseDoc(window.firebaseDB, 'official_accounts', user.uid).get();
        return snap.exists;
    } catch (e) { return false; }
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
    // 카카오: 초기 카카오톡 앱 아이콘 오마주 — 말풍선 안 TALK 각인.
    // 진짜 knockout(mask)은 html2canvas 공유 캡처에서 깨질 수 있어 밝은 반투명 텍스트로 대체.
    kakao: '<svg viewBox="0 0 24 24" fill="currentColor">' +
        '<path d="M12 4C7 4 3 7.2 3 11.2c0 2.6 1.7 4.9 4.3 6.2l-.8 3c-.1.4.3.7.6.5l3.5-2.3c.5.1.9.1 1.4.1 5 0 9-3.2 9-7.2S17 4 12 4z"/>' +
        '<text x="12" y="12.9" text-anchor="middle" font-size="4.6" font-weight="800" letter-spacing=".2" fill="rgba(255,255,255,.92)">TALK</text></svg>',
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

// 밥 종류 → 카드 배경색. 화면 네임카드와 공유 이미지가 같은 색을 써야 한다.
window.riceColorOf = function (riceName) {
    var found = riceData.find(function (r) { return r.name === riceName; });
    return found ? found.color : "#fff9c4";
};

// 밥도감 — 밥 종류 25가지를 모으는 도감. 번호는 riceData 순서, 희귀도는 뽑기 가중치
// (50 흔함 · 10 드묾 · 1 전설). 밥친구 전체(나 포함)의 밥 종류 수로 상차림 단계를 매긴다.
// 앱 lib/services/rice_dex.dart 와 같은 표 — 한쪽만 바꾸면 도감 번호가 어긋난다.
var DEX_STAGES = [{ min: 1, lv: 1 }, { min: 2, lv: 2 }, { min: 6, lv: 3 }, { min: 13, lv: 4 }, { min: 25, lv: 5 }];
window.riceDex = {
    total: riceData.length,
    list: function () {
        return riceData.map(function (r, i) { return { no: i + 1, name: r.name, color: r.color, rarity: rarityOf(r.weight) }; });
    },
    // 밥 이름 → 도감 항목(없으면 null — 운영자 닉네임·옛 닉네임 등)
    info: function (name) {
        for (var i = 0; i < riceData.length; i++) {
            if (riceData[i].name === name) return { no: i + 1, name: name, color: riceData[i].color, rarity: rarityOf(riceData[i].weight) };
        }
        return null;
    },
    // 닉네임("현미밥-a3k") → 밥 이름("현미밥")
    riceOf: function (nickname) { return String(nickname || '').split('-')[0]; },
    // 모은 종류 수 → { lv: 1~5, next: 다음 단계 lv | 0, need: 다음 단계까지 남은 종류 수 }
    stage: function (n) {
        var lv = 0, next = 0, need = 0;
        for (var i = 0; i < DEX_STAGES.length; i++) {
            if (n >= DEX_STAGES[i].min) lv = DEX_STAGES[i].lv;
            else { next = DEX_STAGES[i].lv; need = DEX_STAGES[i].min - n; break; }
        }
        return { lv: lv, next: next, need: need };
    }
};
function rarityOf(w) { return w >= 50 ? 'common' : (w >= 10 ? 'rare' : 'legend'); }

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

    var bgColor = window.riceColorOf(riceName);
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
            if (window.isReservedNickname(newName) && !(await window.canUseReservedNickname(window.currentUser))) {
                alert(window.t('nickname_reserved'));
                return;
            }
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

// 프로필 카드 닫기(화면만). 뒤로가기로 닫힐 때도 이걸 부른다(js/back-nav.js)
window.hideProfileCard = function () {
    document.getElementById('profileOverlay').style.display = 'none';
    // 로그인 게이트 상태에서 로그인 없이 닫으면: 작성 중이던 등록 폼을 복원하고 대기 해제
    if (window._regResumePending) {
        window._regResumePending = false;
        var hint = document.getElementById('regLoginHint');
        if (hint) hint.style.display = 'none';
        var reg = document.getElementById('regModalOverlay');
        if (reg) reg.style.display = 'flex';
    }
};

// 프로필 카드 열기(화면 + 폰 뒤로가기 칸). resetPage: 첫 장(내 카드)부터
window.showProfileCard = function (resetPage) {
    document.getElementById('profileOverlay').style.display = 'flex';
    if (resetPage && window.resetProfilePager) window.resetProfilePager();
    if (window.backNav) window.backNav.open('profile', window.hideProfileCard);
};

window.toggleProfileCard = function () {
    var closing = document.getElementById('profileOverlay').style.display === 'flex';
    if (closing) {
        window.hideProfileCard();
        if (window.backNav) window.backNav.closed('profile');
        return;
    }
    // 열 때마다 첫 장(내 카드)부터 — 밥친구 장은 옆으로 넘겨서 연다 (js/friends.js)
    window.showProfileCard(true);
};
