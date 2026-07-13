// app-banner.js
// 웹→앱 유입 깔때기: 하단 앱 설치 유도 배너.
// classic script, window.* 전역. Depends on: i18n.js(window.t), firebase-init.js(window.track).
//
// 정책:
// - Android 에서만 노출(iOS 앱 미출시, 데스크톱은 Play Store 설치 대상 아님).
// - 닫으면 7일간 재노출 안 함(localStorage).
// - ?club= / ?spot= 딥링크 착지 시 문구를 "이 팀을 앱에서 열기"로 강화(가장 전환 좋은 순간).
// - 바텀시트(z-index 9999+)가 열리면 배너(z-index 90)는 자연히 가려짐.
// - CTA 는 실제 라이브 Play Store 리스팅(기존 앱)으로 연결.

(function () {
    var PACKAGE = 'com.nulloongzi.nulloongzido';
    var PLAY_URL = 'https://play.google.com/store/apps/details?id=' + PACKAGE +
        '&referrer=utm_source%3Dweb%26utm_medium%3Dinstall_banner';
    var LS_KEY = 'nulloong_app_banner_dismissed';
    var RESHOW_MS = 7 * 24 * 60 * 60 * 1000; // 7일

    var bannerEl = null;

    function t(key) { return window.t ? window.t(key) : key; }

    function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }

    function recentlyDismissed() {
        try {
            var v = localStorage.getItem(LS_KEY);
            if (!v) return false;
            var ts = parseInt(v, 10);
            return ts ? (Date.now() - ts) < RESHOW_MS : false;
        } catch (e) { return false; }
    }

    function hasDeepLink() {
        var p = new URLSearchParams(location.search);
        return p.has('club') || p.has('spot');
    }

    function render() {
        if (!bannerEl) return;
        var deep = hasDeepLink();
        bannerEl.querySelector('.aib-title').textContent = t('app_banner_title');
        bannerEl.querySelector('.aib-sub').textContent = t(deep ? 'app_banner_sub_deeplink' : 'app_banner_sub');
        bannerEl.querySelector('.aib-cta').textContent = t('app_banner_cta');
        var close = bannerEl.querySelector('.aib-close');
        close.setAttribute('aria-label', t('app_banner_dismiss'));
        close.setAttribute('title', t('app_banner_dismiss'));
    }

    function dismiss() {
        try { localStorage.setItem(LS_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        if (bannerEl) bannerEl.classList.remove('show');
        document.body.classList.remove('app-banner-on');
        if (window.track) window.track('app_banner_dismiss', {});
    }

    function build() {
        var el = document.createElement('div');
        el.className = 'app-install-banner';
        el.setAttribute('role', 'region');
        el.innerHTML =
            '<div class="aib-icon" style="display:flex;align-items:center;justify-content:center;background:var(--nurungji-yellow);font-size:22px;">🍚</div>' +
            '<div class="aib-text">' +
                '<div class="aib-title"></div>' +
                '<div class="aib-sub"></div>' +
            '</div>' +
            '<a class="aib-cta" target="_blank" rel="noopener noreferrer"></a>' +
            '<button class="aib-close" type="button">✕</button>';

        var cta = el.querySelector('.aib-cta');
        cta.href = PLAY_URL;
        cta.addEventListener('click', function () {
            if (window.track) window.track('app_banner_click', { deep_link: hasDeepLink() ? 1 : 0 });
        });
        el.querySelector('.aib-close').addEventListener('click', dismiss);

        document.body.appendChild(el);
        bannerEl = el;
        render();

        // 다음 프레임에 슬라이드 인 + FAB 상향
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                el.classList.add('show');
                document.body.classList.add('app-banner-on');
            });
        });

        if (window.track) window.track('app_banner_shown', { deep_link: hasDeepLink() ? 1 : 0 });
    }

    function maybeShow() {
        if (bannerEl) return;
        if (!isAndroid()) return;
        if (recentlyDismissed()) return;
        build();
    }

    // 언어 전환 시 문구 재적용
    document.addEventListener('nurungji:langchange', render);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeShow);
    } else {
        maybeShow();
    }

    // 외부에서 강제 호출용(테스트/디버그)
    window.showAppInstallBanner = maybeShow;
})();
