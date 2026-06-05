// insta-embed.js
// 공개 인스타 게시물/릴스 임베드 (A-1: blockquote + 공식 embed.js).
// Meta 앱·로그인·검수 불필요 — 공개 콘텐츠만, 호스트가 URL을 직접 붙여넣는 큐레이션 방식.
// (계정 연동 자동 피드=B는 추후 과제: docs/handoff-ig-story-share.md §11 참고.)
// URL은 window.sanitizeInstaPostUrl로 화이트리스트 검증 후에만 삽입(XSS 방지).
// 셸(Flutter WebView)에서 렌더되려면 앱 NavigationDelegate가 하위프레임(iframe) 로드를
// 가로채지 않아야 한다 — 앱 레포 main.dart의 isMainFrame 가드에서 처리.
// Depends on: dom-utils.js (sanitizeInstaPostUrl), i18n.js (window.t)

(function () {
    // 공식 embed.js를 1회만 로드. 로드되면 콜백으로 Embeds.process() 트리거.
    function ensureEmbedScript(cb) {
        if (window.instgrm && window.instgrm.Embeds) { cb(); return; }
        var existing = document.getElementById('insta-embed-js');
        if (existing) { existing.addEventListener('load', cb, { once: true }); return; }
        var s = document.createElement('script');
        s.id = 'insta-embed-js';
        s.async = true;
        s.src = 'https://www.instagram.com/embed.js';
        s.onload = cb;
        s.onerror = function () { /* 네트워크 차단 등: blockquote 안의 링크가 폴백 역할 */ };
        document.body.appendChild(s);
    }

    // container에 url의 인스타 임베드를 렌더. url이 없거나 무효면 container를 비우고 숨김 + false 반환.
    // 같은 url로 재호출되면 재처리 생략(언어 전환 재렌더 등에서 깜빡임/재로드 방지).
    window.renderInstaEmbed = function (container, url) {
        if (!container) return false;
        var safe = window.sanitizeInstaPostUrl ? window.sanitizeInstaPostUrl(url) : '';
        if (!safe) {
            container.innerHTML = '';
            container.style.display = 'none';
            if (container.dataset) delete container.dataset.reelUrl;
            return false;
        }
        if (container.dataset && container.dataset.reelUrl === safe && container.firstChild) {
            container.style.display = 'block';
            return true;
        }
        if (container.dataset) container.dataset.reelUrl = safe;
        container.style.display = 'block';
        container.innerHTML = '';

        // blockquote 조립: permalink는 검증된 instagram.com URL만 → setAttribute로 안전 삽입
        var bq = document.createElement('blockquote');
        bq.className = 'instagram-media';
        bq.setAttribute('data-instgrm-permalink', safe);
        bq.setAttribute('data-instgrm-version', '14');
        bq.style.margin = '0 auto';
        bq.style.maxWidth = '100%';
        var a = document.createElement('a');
        a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = window.t ? window.t('insta_view') : 'View on Instagram';
        bq.appendChild(a);
        container.appendChild(bq);

        ensureEmbedScript(function () {
            try { if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process(); } catch (e) { /* noop */ }
        });
        return true;
    };
})();
