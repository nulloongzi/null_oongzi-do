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

    // 릴스 지연 로딩(앱 패리티 W3): 포스터 카드만 먼저 → 탭하면 그 자리에서 실제 임베드.
    // 임베드 iframe을 즉시 안 붙여 상세 오픈이 가볍고 스크롤이 매끄러움.
    function lazyReelCard(host, url) {
        var card = document.createElement('div');
        card.setAttribute('style',
            'display:flex;align-items:center;gap:12px;margin-top:10px;padding:14px;' +
            'background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:14px;cursor:pointer;');
        var icon = document.createElement('div');
        icon.setAttribute('style',
            'width:46px;height:46px;flex:none;border-radius:12px;display:flex;align-items:center;' +
            'justify-content:center;color:#fff;font-size:20px;' +
            'background:linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5);');
        icon.textContent = '▶';
        var txt = document.createElement('div');
        var t1 = document.createElement('div');
        t1.setAttribute('style', 'font-weight:800;font-size:14px;color:#4e342e;');
        t1.textContent = window.t('insta_reel_title');
        var t2 = document.createElement('div');
        t2.setAttribute('style', 'font-size:12px;color:#8d6e63;');
        t2.textContent = window.t('reel_tap_play');
        txt.appendChild(t1);
        txt.appendChild(t2);
        card.appendChild(icon);
        card.appendChild(txt);
        card.onclick = function () {
            var box = document.createElement('div');
            host.replaceChild(box, card);
            window.renderInstaEmbed(box, url);
        };
        host.appendChild(card);
    }

    // 멀티 릴스(앱 패리티 W1): 첫 릴스는 항상 + 나머지는 '릴스 더 보기 (n)' 토글로 지연 렌더.
    // urls: insta_reels 배열(없으면 단일 insta_reel을 [1개]로 감싸 전달).
    window.renderInstaEmbeds = function (container, urls) {
        if (!container) return false;
        var list = [];
        for (var i = 0; i < (urls || []).length; i++) {
            var s = window.sanitizeInstaPostUrl ? window.sanitizeInstaPostUrl(urls[i]) : '';
            if (s && list.indexOf(s) === -1) list.push(s);
        }
        // 재렌더(언어 전환 등): 목록이 같으면 유지(깜빡임 방지)
        var key = list.join('|');
        if (container.dataset.reelsKey === key) return list.length > 0;
        container.dataset.reelsKey = key;
        container.innerHTML = '';
        if (!list.length) { container.style.display = 'none'; return false; }
        container.style.display = '';
        lazyReelCard(container, list[0]); // 포스터 → 탭 재생(W3)
        if (list.length < 2) return true;
        var more = document.createElement('button');
        more.setAttribute('style',
            'width:100%;margin-top:8px;padding:9px;border:none;border-radius:12px;' +
            'background:#f0ece2;color:#6d6258;font-weight:700;font-size:13px;cursor:pointer;');
        var restWrap = document.createElement('div');
        restWrap.style.display = 'none';
        var open = false;
        var moreLabel = window.t('reels_more_label') + ' (' + (list.length - 1) + ') ▾';
        more.textContent = moreLabel;
        more.onclick = function () {
            open = !open;
            if (open && !restWrap.childNodes.length) {
                for (var j = 1; j < list.length; j++) {
                    lazyReelCard(restWrap, list[j]); // 각 릴스도 포스터 → 탭 재생
                }
            }
            restWrap.style.display = open ? '' : 'none';
            more.textContent = open ? (window.t('reels_hide') + ' ▴') : moreLabel;
        };
        container.appendChild(more);
        container.appendChild(restWrap);
        return true;
    };

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
