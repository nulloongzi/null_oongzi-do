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
    // 누룽지도: 로고 단순화 — 그릇에 얹어진 누룽지 공(이음선은 구멍). 다른 로그인 도장과 같은 24 단위 선 그림
    rice: '<svg viewBox="0 0 24 24" fill="currentColor">' +
        '<path fill-rule="evenodd" d="M11.04 19.56C9.67 19.44 8.56 19.07 8.31 18.66C8.25 18.56 8.21 18.41 8.21 18.24C8.21 18.01 8.20 17.97 8.08 17.90C7.08 17.30 6.03 16.32 5.47 15.47C4.74 14.36 4.32 13.19 4.22 11.94C4.18 11.41 4.22 11.23 4.43 11.01L4.61 10.82L4.68 11.06C4.75 11.28 4.74 11.31 4.65 11.51C4.48 11.85 4.51 11.93 4.86 12.27C5.26 12.65 5.56 12.79 6.56 13.05C7.18 13.21 7.74 13.30 8.78 13.42C9.03 13.45 9.31 13.48 9.40 13.50C10.09 13.60 14.41 13.56 15.05 13.45C15.09 13.44 15.28 13.42 15.48 13.40C15.99 13.35 17.09 13.14 17.63 12.99C18.44 12.77 18.71 12.64 19.08 12.29C19.45 11.93 19.48 11.84 19.32 11.52C19.25 11.38 19.24 11.30 19.27 11.21C19.30 11.14 19.32 11.01 19.32 10.93L19.32 10.77L19.52 10.97C19.77 11.22 19.81 11.38 19.76 11.95C19.53 14.36 18.17 16.52 16.10 17.77L15.77 17.97L15.75 18.29C15.73 18.54 15.70 18.65 15.61 18.74C15.33 19.03 14.50 19.35 13.69 19.46C13.47 19.50 13.23 19.53 13.15 19.54C12.84 19.59 11.49 19.60 11.04 19.56ZM10.29 13.00C10.28 12.99 10.04 12.97 9.75 12.95C8.63 12.88 7.33 12.69 6.51 12.48C5.97 12.34 5.95 12.33 5.72 12.08C5.36 11.68 5.21 11.44 5.28 11.38C5.32 11.34 5.32 11.29 5.28 11.23C5.20 11.08 5.22 10.76 5.32 10.61C5.38 10.51 5.40 10.40 5.39 10.22C5.38 9.91 5.48 9.70 5.69 9.57C5.83 9.49 5.84 9.46 5.84 9.19C5.84 8.91 5.84 8.89 6.04 8.72C6.43 8.38 6.38 8.37 6.79 8.79C7.67 9.71 8.83 10.46 10.13 10.96C10.59 11.14 11.47 11.39 11.64 11.39C11.70 11.39 11.76 11.44 11.79 11.52C11.88 11.75 12.13 12.78 12.13 12.91L12.13 13.03L11.22 13.02C10.72 13.02 10.30 13.01 10.29 13.00ZM12.85 12.80C12.81 12.50 12.61 11.69 12.50 11.40L12.43 11.18L12.61 10.96C12.88 10.64 13.62 10.00 14.11 9.66L14.52 9.38L14.64 9.53C15.17 10.19 15.71 11.20 15.97 12.01C16.23 12.83 16.28 12.74 15.53 12.83C14.79 12.92 14.35 12.96 13.49 13.01L12.89 13.04L12.85 12.80ZM16.86 12.46C16.66 11.51 16.06 10.26 15.32 9.25L15.15 9.02L15.44 8.90C16.03 8.63 16.47 8.49 17.36 8.29C17.53 8.25 18.18 9.00 18.18 9.24C18.18 9.31 18.23 9.39 18.30 9.43C18.48 9.55 18.58 9.81 18.57 10.14C18.56 10.35 18.59 10.49 18.67 10.67C18.77 10.89 18.78 10.94 18.73 11.13C18.68 11.30 18.69 11.37 18.74 11.48C18.89 11.77 18.87 11.94 18.65 12.07C18.42 12.20 17.72 12.43 17.23 12.54L16.89 12.62L16.86 12.46ZM11.29 10.57C10.68 10.40 10.03 10.16 9.64 9.97C9.25 9.77 9.25 9.83 9.58 9.13C10.45 7.27 11.86 5.97 13.66 5.36C14.58 5.04 15.19 5.14 15.49 5.63C15.60 5.80 15.67 5.86 15.87 5.93C16.07 6.00 16.14 6.05 16.24 6.23C16.33 6.39 16.42 6.46 16.53 6.49C16.72 6.54 17.10 6.96 17.07 7.09C17.06 7.14 17.07 7.19 17.09 7.20C17.12 7.22 17.14 7.31 17.14 7.41L17.14 7.60L16.73 7.69C15.18 8.03 13.16 9.24 12.15 10.42C11.89 10.73 11.88 10.74 11.29 10.57ZM8.23 9.12C7.76 8.77 7.34 8.39 7.07 8.07L6.87 7.82L7.00 7.38C7.12 6.99 7.16 6.93 7.28 6.88C7.37 6.85 7.43 6.79 7.45 6.70C7.56 6.21 7.80 5.92 8.15 5.86C8.52 5.80 8.56 5.78 8.64 5.64C8.72 5.48 8.83 5.41 9.11 5.37C9.25 5.35 9.32 5.30 9.41 5.16C9.59 4.87 9.80 4.79 10.22 4.82C10.49 4.85 10.60 4.83 10.72 4.77C10.82 4.72 10.93 4.71 11.06 4.73C11.22 4.75 11.27 4.74 11.38 4.63C11.65 4.37 12.04 4.33 12.42 4.52C12.61 4.61 12.70 4.63 12.93 4.61C13.39 4.57 13.45 4.63 13.10 4.78C11.28 5.52 9.84 6.93 8.90 8.88C8.77 9.17 8.65 9.41 8.64 9.41C8.63 9.41 8.44 9.28 8.23 9.12Z"/></svg>'
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
    // 이름 팝업(js/dialog.js) — 하이픈·공식 이름·중복은 팝업을 닫지 않고 칸 아래에 알린다
    var v = await window.nzPrompt({
        title: window.t('nick_title'),
        fields: [{ name: 'name', value: currentName, maxLength: 30, select: true }],
        confirm: window.t('nick_btn'),
        validate: async function (x) {
            if (!x.name) return { name: window.t('nick_empty') };
            if (x.name === currentName) return null;
            if (x.name.indexOf('-') >= 0) return { name: window.t('nick_hyphen') };
            if (window.isReservedNickname(x.name) && !(await window.canUseReservedNickname(window.currentUser))) {
                return { name: window.t('nickname_reserved') };
            }
            if (await window.checkDuplicateNickname(x.name)) return { name: window.t('nick_dup') };
            return null;
        }
    });
    if (!v || v.name === currentName) return;
    try {
        var userRef = window.firebaseDoc(window.firebaseDB, 'users', window.currentUser.uid);
        await window.firebaseUpdateDoc(userRef, { full_nickname: v.name });
        window.currentProfileData.full_nickname = v.name;
        window.renderProfileCard();
        window.showToast(window.t('nick_changed'));
    } catch (e) { console.warn('이름 바꾸기 실패:', e); window.showToast(window.t('nick_change_error')); }
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
