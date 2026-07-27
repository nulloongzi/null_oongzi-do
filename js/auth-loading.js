// auth-loading.js — 소셜 로그인 진행 안내 오버레이 (카카오/네이버 리다이렉트 로그인용).
//
// 카카오/네이버는 authorization-code 리다이렉트 방식이라, 제공자에서 돌아오면
// 지도 화면이 먼저 뜨고 뒤에서 조용히 토큰 교환 → 갑자기 로그인된 것처럼 보였다.
// 이 모듈은 두 구간을 사용자에게 보이게 한다:
//   1) 로그인 버튼 → 제공자로 이동하는 순간 ("카카오로 이동 중...")
//   2) 제공자에서 복귀(?code=&state=) → 커스텀 토큰 교환/프로필 로딩 완료까지 ("로그인 중이에요")
//
// <head>에서 로드되어 첫 페인트 전에 <html>에 .auth-loading 클래스를 붙인다.
// (지도가 먼저 그려졌다가 덮이는 깜빡임 방지)
//
// 공개 API: window.showAuthLoading(titleKey, descKey) / window.hideAuthLoading()
//           window.isAuthLoading() / window.hasOAuthRedirectParams()
// Depends on: 없음 (i18n보다 먼저 로드되므로 최소 사전을 자체 보유, window.t가 있으면 우선 사용)

(function () {
    var CLS_ON = 'auth-loading';
    var CLS_SLOW = 'auth-loading-slow';
    // 제공자별 반투명 효과 테마 (css/main.css의 html.auth-theme-* 참조)
    var THEMES = ['kakao', 'naver', 'google', 'rice'];
    // 이 시간이 지나면 "오래 걸려요" 안내 + 닫기 버튼을 노출해 사용자가 갇히지 않게 한다.
    var SLOW_MS = 12000;

    // i18n.js 로드 전(head 실행 시점)에도 문구를 그릴 수 있도록 하는 최소 사전.
    // i18n.js에 동일 키가 있으며, window.t가 준비되면 그쪽을 우선한다.
    var FALLBACK = {
        auth_signing_in: { ko: '로그인 중이에요', en: 'Signing you in…' },
        auth_signing_in_desc: {
            ko: '계정을 확인하고 있어요. 잠시만 기다려 주세요 🍚',
            en: 'Verifying your account. This only takes a moment 🍚'
        },
        auth_redirecting_kakao: { ko: '카카오로 이동 중이에요', en: 'Redirecting to Kakao…' },
        auth_redirecting_naver: { ko: '네이버로 이동 중이에요', en: 'Redirecting to Naver…' },
        auth_redirect_desc: {
            ko: '로그인 화면으로 이동하고 있어요.',
            en: 'Taking you to the login page.'
        },
        auth_slow_hint: {
            ko: '조금 오래 걸리고 있어요. 네트워크 상태를 확인해 주세요.',
            en: 'This is taking longer than usual. Please check your connection.'
        },
        auth_close: { ko: '닫기', en: 'Close' }
    };

    var current = null;   // { titleKey, descKey }
    var slowTimer = null;
    var delayTimer = null;
    var rafRetry = 0;

    function setTheme(theme) {
        var root = document.documentElement;
        THEMES.forEach(function (t) { root.classList.remove('auth-theme-' + t); });
        if (theme && THEMES.indexOf(theme) !== -1) {
            root.classList.add('auth-theme-' + theme);
        }
    }

    function currentLang() {
        try {
            return localStorage.getItem('nulloong_lang') === 'en' ? 'en' : 'ko';
        } catch (e) {
            return 'ko';
        }
    }

    function tr(key) {
        if (window.t) {
            var s = window.t(key);
            if (s && s !== key) return s;
        }
        var f = FALLBACK[key];
        return f ? f[currentLang()] : '';
    }

    function render() {
        if (!current) return;
        var title = document.getElementById('authLoadingTitle');
        var desc = document.getElementById('authLoadingDesc');
        if (!title || !desc) {
            // head 실행 시점엔 body가 아직 파싱 전 → 다음 프레임에 재시도(문구 깜빡임 최소화)
            if (rafRetry < 60 && window.requestAnimationFrame) {
                rafRetry++;
                window.requestAnimationFrame(render);
            }
            return;
        }
        rafRetry = 0;
        title.textContent = tr(current.titleKey);
        desc.textContent = tr(current.descKey);
        var slow = document.getElementById('authLoadingSlow');
        if (slow) slow.textContent = tr('auth_slow_hint');
        var close = document.getElementById('authLoadingClose');
        if (close) close.textContent = tr('auth_close');
    }

    // titleKey/descKey는 i18n 키(미지정 시 "로그인 중"), theme은 제공자 효과(kakao/naver/google/rice).
    window.showAuthLoading = function (titleKey, descKey, theme) {
        if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
        current = {
            titleKey: titleKey || 'auth_signing_in',
            descKey: descKey || 'auth_signing_in_desc'
        };
        setTheme(theme);
        var root = document.documentElement;
        root.classList.add(CLS_ON);
        root.classList.remove(CLS_SLOW);
        render();
        if (slowTimer) clearTimeout(slowTimer);
        slowTimer = setTimeout(function () {
            document.documentElement.classList.add(CLS_SLOW);
        }, SLOW_MS);
    };

    // 지연 표시: ms 안에 로그인이 끝나면(=hideAuthLoading 호출) 아예 뜨지 않는다.
    // 구글 팝업/이메일처럼 보통 빠른 경로에서 불필요한 번쩍임을 막는 용도.
    window.showAuthLoadingDelayed = function (ms, titleKey, descKey, theme) {
        if (delayTimer) clearTimeout(delayTimer);
        delayTimer = setTimeout(function () {
            delayTimer = null;
            window.showAuthLoading(titleKey, descKey, theme);
        }, ms);
    };

    window.hideAuthLoading = function () {
        current = null;
        if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
        if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
        var root = document.documentElement;
        root.classList.remove(CLS_ON);
        root.classList.remove(CLS_SLOW);
        setTheme(null);
    };

    window.isAuthLoading = function () {
        return document.documentElement.classList.contains(CLS_ON);
    };

    // 소셜 로그인 리다이렉트 복귀인지(?code=&state=) 판별
    window.hasOAuthRedirectParams = function () {
        try {
            var p = new URLSearchParams(window.location.search);
            return !!(p.get('code') && p.get('state'));
        } catch (e) {
            return false;
        }
    };

    // 첫 페인트부터 덮기: 복귀 URL이면 즉시 로딩 상태로 진입.
    // state 접두사(kakao_/naver_)로 어느 제공자인지 알 수 있어 테마도 함께 결정한다.
    // (실제 해제는 social-auth.js 실패 처리 / auth.js의 onAuthStateChanged 완료 시점)
    if (window.hasOAuthRedirectParams()) {
        var st = '';
        try { st = new URLSearchParams(window.location.search).get('state') || ''; } catch (e) {}
        var theme = st.indexOf('kakao') === 0 ? 'kakao' : st.indexOf('naver') === 0 ? 'naver' : '';
        window.showAuthLoading('auth_signing_in', 'auth_signing_in_desc', theme);
    }

    // i18n.js는 이 파일보다 늦게 로드되므로, 준비된 뒤 문구를 한 번 더 확정한다.
    document.addEventListener('DOMContentLoaded', render);
    document.addEventListener('nurungji:langchange', render);

    // 제공자 로그인 화면에서 뒤로가기로 돌아온 경우(bfcache 복원): 진행 중인 로그인이
    // 없으므로 "이동 중" 화면이 남아 있으면 즉시 내린다.
    window.addEventListener('pageshow', function (e) {
        if (e.persisted && !window.hasOAuthRedirectParams()) window.hideAuthLoading();
    });
})();
