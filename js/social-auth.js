// social-auth.js — 카카오/네이버 소셜 로그인 (Option A: 제공자별 독립 계정).
//
// 웹은 authorization-code + 리다이렉트 방식으로 통일(브라우저에 시크릿 노출 0):
//   로그인 → 제공자 authorize 페이지로 리다이렉트 → ?code=&state= 로 복귀
//   → Cloud Function(kakao/naverCustomToken)이 code→access_token 교환·검증 후 커스텀 토큰 발급
//   → signInWithCustomToken → 기존 onAuthStateChanged가 프로필/소유권 자동 처리.
// state 접두사로 어느 제공자의 code인지 구분(kakao_* / naver_*), CSRF 방지용 난수 포함.
//
// "지난 로그인 수단" 기억 → 로그인 UI에서 우선 노출(수단 갈아탐 최소화 → 계정 분리 최소화).
// Depends on: firebase-init.js(firebaseCallable), Kakao JS SDK(index.html), i18n(window.t)

(function () {
    // 카카오 JavaScript 키 — 지도/공유와 동일(공개값). Kakao.Auth.authorize가 이 키로 동작.
    var KAKAO_JS_KEY = '69f821ba943db5e3532ac90ea5ca1080';
    // 네이버 Client ID(공개값). TODO: 네이버 개발자센터에서 발급받아 입력 + CF의 NAVER_CLIENT_ID와 동일값.
    var NAVER_CLIENT_ID = '';

    var LS_LAST_PROVIDER = 'nulloong_last_login_provider';
    var SS_OAUTH_STATE = 'nulloong_oauth_state';

    function setLastProvider(p) { try { localStorage.setItem(LS_LAST_PROVIDER, p); } catch (e) {} }
    window.rememberLoginProvider = setLastProvider; // 구글/이메일 등 외부 로그인 경로에서도 기록
    window.getLastLoginProvider = function () {
        try { return localStorage.getItem(LS_LAST_PROVIDER) || ''; } catch (e) { return ''; }
    };

    // 리다이렉트 URI: 현재 origin+path(쿼리/해시 제외). 카카오/네이버 콘솔에 등록 필요.
    function redirectUri() {
        return window.location.origin + window.location.pathname;
    }

    function randToken() {
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    function makeState(provider) {
        var st = provider + '_' + randToken();
        try { sessionStorage.setItem(SS_OAUTH_STATE, st); } catch (e) {}
        return st;
    }

    function ensureKakao() {
        if (window.Kakao && !window.Kakao.isInitialized()) {
            try { window.Kakao.init(KAKAO_JS_KEY); } catch (e) {}
        }
        return !!(window.Kakao && window.Kakao.isInitialized());
    }

    // ── 카카오 로그인 시작 ──
    window.loginWithKakao = function () {
        if (!ensureKakao()) { alert(window.t('au_login_fail') + 'Kakao SDK'); return; }
        setLastProvider('kakao');
        window.Kakao.Auth.authorize({
            redirectUri: redirectUri(),
            state: makeState('kakao')
        });
    };

    // ── 네이버 로그인 시작 ── (수동 authorize URL: 공개 Client ID만 사용)
    window.loginWithNaver = function () {
        if (!NAVER_CLIENT_ID) { alert(window.t('au_login_fail') + 'Naver clientId'); return; }
        setLastProvider('naver');
        var st = makeState('naver');
        var url = 'https://nid.naver.com/oauth2.0/authorize' +
            '?response_type=code' +
            '&client_id=' + encodeURIComponent(NAVER_CLIENT_ID) +
            '&redirect_uri=' + encodeURIComponent(redirectUri()) +
            '&state=' + encodeURIComponent(st);
        window.location.href = url;
    };

    function cleanUrl() {
        try {
            window.history.replaceState({}, document.title, redirectUri());
        } catch (e) {}
    }

    // ── 리다이렉트 복귀 처리 ── (?code=&state=)
    async function handleRedirect() {
        var params = new URLSearchParams(window.location.search);
        var code = params.get('code');
        var state = params.get('state');
        if (!code || !state) return;

        // CSRF: 저장해둔 state와 일치해야 함
        var saved = '';
        try { saved = sessionStorage.getItem(SS_OAUTH_STATE) || ''; } catch (e) {}
        if (saved && state !== saved) {
            console.warn('OAuth state 불일치 - 무시');
            cleanUrl();
            return;
        }

        var provider = state.indexOf('kakao') === 0 ? 'kakao'
            : state.indexOf('naver') === 0 ? 'naver' : '';
        if (!provider) { cleanUrl(); return; }

        try {
            var callable = window.firebaseCallable(provider + 'CustomToken');
            if (!callable) { cleanUrl(); return; }
            var payload = provider === 'kakao'
                ? { code: code, redirectUri: redirectUri() }
                : { code: code, state: state };
            var res = await callable(payload);
            var token = res && res.data && res.data.token;
            if (token) {
                await firebase.auth().signInWithCustomToken(token);
                if (window.track) window.track('login', { method: provider });
            }
        } catch (e) {
            console.error(provider + ' 로그인 실패:', e);
            alert(window.t('au_login_fail') + (e.message || ''));
        } finally {
            try { sessionStorage.removeItem(SS_OAUTH_STATE); } catch (e) {}
            cleanUrl();
        }
    }

    // 지난 로그인 수단 강조(Option A 완화책): 해당 버튼에 "지난번에 사용" 칩.
    // 수단을 계속 바꾸지 않게 유도 → 제공자별 계정 분리를 실질적으로 최소화.
    function markLastUsed() {
        var last = window.getLastLoginProvider();
        if (!last) return;
        var id = last === 'google' ? 'btnGoogleLogin'
            : last === 'kakao' ? 'btnKakaoLogin'
            : last === 'naver' ? 'btnNaverLogin' : '';
        var btn = id && document.getElementById(id);
        if (!btn || btn.querySelector('.last-used-chip')) return;
        var chip = document.createElement('span');
        chip.className = 'last-used-chip';
        chip.setAttribute('style',
            'margin-left:auto;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;' +
            'background:rgba(0,0,0,.12);color:inherit;white-space:nowrap;');
        chip.textContent = (window.t ? window.t('login_last_used') : '지난번에 사용');
        btn.appendChild(chip);
    }

    // 미설정 제공자 버튼 숨김(에러 버튼 노출 방지). 네이버 Client ID 없으면 네이버 버튼 숨김.
    function hideUnconfigured() {
        if (!NAVER_CLIENT_ID) {
            var nb = document.getElementById('btnNaverLogin');
            if (nb) nb.style.display = 'none';
        }
    }

    function init() {
        ensureKakao();
        handleRedirect();
        hideUnconfigured();
        markLastUsed();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
