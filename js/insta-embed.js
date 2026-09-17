// insta-embed.js
// 릴스 발견 카드: 정지 커버(우리 Storage 캐시) 포스터 → 탭하면 인스타 앱/웹으로.
//
// 왜 임베드가 아니라 커버인가 (2026-09-16 결정, docs/OPEN-QUESTIONS.md):
// 인스타 공식 embed 는 로그아웃 상태에서 인라인 재생이 안 된다 — 포스터 + "Instagram에서 보기" 만
// 보여주고 결국 인스타로 넘긴다. 그러면 우리 시트 안에 남의 크롬(프로필 보기·♡·댓글 달기·좋아요 수)이
// 통째로 들어오면서 얻는 게 없다. 커버 한 장 + 한 번 탭이 같은 결과를 더 깨끗하게 낸다.
// embed.js 는 더 이상 싣지 않는다.
//
// 커버는 Cloud Function(functions/insta-cover.js) 이 문서의 insta_reel_covers 맵(code→URL)에 채운다.
// 없거나 로드 실패면 제네릭 카드(그라데이션 + ▶). 둘 다 탭 → 인스타.
// URL 은 window.sanitizeInstaPostUrl 로 화이트리스트 검증 후에만 사용.
// Depends on: dom-utils.js (sanitizeInstaPostUrl), i18n.js (window.t)

(function () {
    // 릴스 URL → shortcode (/reel/<CODE>/). insta_reel_covers 맵 조회 키. Cloud Function과 동일 규칙.
    function reelCodeFromUrl(u) {
        if (typeof u !== 'string') return null;
        var m = u.match(/^https:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
        return m ? m[1] : null;
    }
    // covers 맵(code→coverUrl)에서 이 url의 커버 조회. 없으면 ''.
    function coverFor(url, covers) {
        if (!covers) return '';
        var code = reelCodeFromUrl(url);
        return (code && covers[code]) ? covers[code] : '';
    }
    window.reelCodeFromUrl = reelCodeFromUrl;

    // 릴스 탭 계측(reel_play): 이제 "인스타로 나간 횟수". meta = { source, id, index } (없으면 생략).
    // view_*/…_contact의 has_reel과 묶어 "릴스가 물꼬에 도움이 되는가"를 본다(2026-09-16 결정 로그).
    function trackPlay(meta, poster) {
        if (!window.track) return;
        meta = meta || {};
        window.track('reel_play', { source: meta.source, id: meta.id, index: meta.index, poster: poster });
    }

    // 인스타로 이동. 셸(앱)이 아니라 브라우저이므로 새 탭 — 인스타 앱이 있으면 OS가 가로챈다.
    function openInsta(url) {
        window.open(url, '_blank', 'noopener');
    }

    // 제네릭 카드(커버 없을 때 폴백): 아이콘 + '탭하면 인스타에서 보기' 한 줄.
    function genericCard(host, url, replaceTarget, meta) {
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
        t2.textContent = window.t('insta_reel_open');
        txt.appendChild(t1);
        txt.appendChild(t2);
        card.appendChild(icon);
        card.appendChild(txt);
        card.onclick = function () {
            trackPlay(meta, 'generic');
            openInsta(url);
        };
        if (replaceTarget && replaceTarget.parentNode) replaceTarget.parentNode.replaceChild(card, replaceTarget);
        else host.appendChild(card);
    }

    // 커버 포스터: 릴스 실제 커버를 9:16 세로 카드로(높이 상한으로 시트 리듬 유지) + 중앙 ▶ +
    // 하단 '인스타에서 보기' 필. 커버 로드 실패(만료/차단) → 제네릭 카드로 폴백. 탭 → 인스타.
    function posterCard(host, url, coverUrl, meta) {
        var card = document.createElement('div');
        card.setAttribute('style',
            'position:relative;margin:10px auto 0;height:min(480px,60vh);aspect-ratio:9/16;max-width:100%;' +
            'overflow:hidden;cursor:pointer;border-radius:20px;box-shadow:0 8px 32px rgba(93,64,55,.15);background:#efe9dd;');
        var img = document.createElement('img');
        img.setAttribute('style', 'width:100%;height:100%;object-fit:cover;object-position:center;display:block;');
        img.alt = window.t('insta_reel_title');
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onerror = function () { genericCard(host, url, card, meta); }; // 커버 실패 → 제네릭 카드
        img.src = coverUrl;
        // 하단 스크림(재생 글리프·필 대비) + 중앙 재생 버튼 + 하단 필
        var scrim = document.createElement('div');
        scrim.setAttribute('style',
            'position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.45));pointer-events:none;');
        var play = document.createElement('div');
        play.setAttribute('style',
            'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:54px;height:54px;border-radius:50%;' +
            'display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;padding-left:3px;' +
            'background:rgba(0,0,0,.42);border:2px solid rgba(255,255,255,.92);backdrop-filter:blur(2px);pointer-events:none;');
        play.textContent = '▶';
        var pill = document.createElement('div');
        pill.setAttribute('style',
            'position:absolute;left:12px;right:12px;bottom:12px;padding:8px 12px;border-radius:999px;' +
            'background:rgba(255,255,255,.92);color:#4e342e;font-weight:800;font-size:13px;text-align:center;pointer-events:none;');
        pill.textContent = window.t('insta_view') + ' ↗';
        card.appendChild(img);
        card.appendChild(scrim);
        card.appendChild(play);
        card.appendChild(pill);
        card.onclick = function () {
            trackPlay(meta, 'cover');
            openInsta(url);
        };
        host.appendChild(card);
    }

    // 릴스 카드 1개: 커버 있으면 포스터, 없으면 제네릭 카드. meta(옵션): reel_play 계측용 { source, id, index }.
    window.renderReelPoster = function (host, url, coverUrl, meta) {
        if (coverUrl) posterCard(host, url, coverUrl, meta);
        else genericCard(host, url, null, meta);
    };

    // 멀티 릴스(앱 패리티 W1): 첫 릴스는 항상 + 나머지는 '릴스 더 보기 (n)' 토글로 지연 렌더.
    // urls: insta_reels 배열(없으면 단일 insta_reel을 [1개]로 감싸 전달).
    // covers: insta_reel_covers 맵(code→coverUrl, 옵션). 있으면 정지 커버 포스터로 표시.
    // meta(옵션): { source: 'club'|'pickup', id } — 각 릴스 탭 시 reel_play 이벤트에 index와 함께 실림.
    window.renderInstaEmbeds = function (container, urls, covers, meta) {
        if (!container) return false;
        function metaAt(i) { return meta ? { source: meta.source, id: meta.id, index: i } : { index: i }; }
        var list = [];
        for (var i = 0; i < (urls || []).length; i++) {
            var s = window.sanitizeInstaPostUrl ? window.sanitizeInstaPostUrl(urls[i]) : '';
            if (s && list.indexOf(s) === -1) list.push(s);
        }
        // 재렌더(언어 전환 등): 목록이 같으면 유지(깜빡임 방지). 커버 유무도 키에 포함.
        var key = list.map(function (u) { return u + (coverFor(u, covers) ? '#c' : ''); }).join('|');
        if (container.dataset.reelsKey === key) return list.length > 0;
        container.dataset.reelsKey = key;
        container.innerHTML = '';
        if (!list.length) { container.style.display = 'none'; return false; }
        container.style.display = '';
        window.renderReelPoster(container, list[0], coverFor(list[0], covers), metaAt(0));
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
                    window.renderReelPoster(restWrap, list[j], coverFor(list[j], covers), metaAt(j));
                }
            }
            restWrap.style.display = open ? '' : 'none';
            more.textContent = open ? (window.t('reels_hide') + ' ▴') : moreLabel;
        };
        container.appendChild(more);
        container.appendChild(restWrap);
        return true;
    };
})();
