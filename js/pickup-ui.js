// pickup-ui.js
// 픽업 게임 UI: 지도 마커(티얼 핀) + 시간순 리스트 패널 렌더링.
// 상세 바텀시트/호스트 모달은 후속 모듈에서 정의 (window.openPickupDetail / openPickupCreateModal).
// Depends on: pickup-data.js, map-core.js (window.map, window.clusterer), i18n.js

(function () {
    window.pickupMarkers = [];

    // 동호회(노랑)와 시각적으로 구분되는 티얼 핀 — 전용 에셋 없이 SVG data URI 사용
    var PIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="53" viewBox="0 0 40 53">' +
        '<path d="M20 0C9 0 0 9 0 20c0 14 20 33 20 33s20-19 20-33C40 9 31 0 20 0z" fill="#13a89e"/>' +
        '<circle cx="20" cy="20" r="8.5" fill="#fff"/></svg>';
    var pickupImage = new kakao.maps.MarkerImage(
        'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(PIN_SVG),
        new kakao.maps.Size(40, 53),
        { offset: new kakao.maps.Point(20, 53) }
    );

    var DOW = ['일', '월', '화', '수', '목', '금', '토'];

    // ── 표시 헬퍼 ──
    window.pkFormatWhen = function (game) {
        var d = window.toJsDate(game.datetime_start);
        if (!d) return '';
        var wd = window.i18nDay(DOW[d.getDay()]);
        var hh = d.getHours(), mm = d.getMinutes();
        var time = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
        return (d.getMonth() + 1) + '/' + d.getDate() + ' (' + wd + ') ' + time;
    };

    window.pkSportLabel = function (s) {
        if (s === '6s') return window.t('pk_sport_6s');
        if (s === '9s') return window.t('pk_sport_9s');
        return window.t('pk_sport_mixed');
    };

    window.pkLevelLabel = function (l) {
        return window.t('pk_lv_' + (l || 'any'), window.t('pk_lv_any'));
    };

    // ── 지도 마커 ──
    function buildPickupLabel(game) {
        var el = document.createElement('div');
        el.className = 'label pickup-label';
        el.appendChild(document.createTextNode(game.title || ''));
        el.addEventListener('click', function () {
            if (window.openPickupDetail) window.openPickupDetail(game.id);
        });
        return el;
    }

    window.clearPickupMarkers = function () {
        if (window.pickupMarkers.length && window.clusterer) {
            window.clusterer.removeMarkers(window.pickupMarkers.map(function (m) { return m.marker; }));
        }
        window.pickupMarkers.forEach(function (m) {
            if (m.marker) m.marker.setMap(null);
            if (m.overlay) m.overlay.setMap(null);
        });
        window.pickupMarkers = [];
    };

    window.renderPickupMarkers = function () {
        window.clearPickupMarkers();
        var clusterMarkers = [];
        window.pickupGames.forEach(function (g) {
            if (!g.lat || !g.lng) return;
            var latlng = new kakao.maps.LatLng(g.lat, g.lng);
            var marker = new kakao.maps.Marker({ position: latlng, image: pickupImage });
            var overlay = new kakao.maps.CustomOverlay({
                position: latlng, content: buildPickupLabel(g), xAnchor: 0.5, yAnchor: 1, zIndex: 9999
            });
            kakao.maps.event.addListener(marker, 'click', function () {
                if (window.openPickupDetail) window.openPickupDetail(g.id);
            });
            window.pickupMarkers.push({ marker: marker, overlay: overlay, game: g });
            clusterMarkers.push(marker);
        });
        if (window.clusterer && clusterMarkers.length) window.clusterer.addMarkers(clusterMarkers);
        updatePickupLabels();
    };

    function updatePickupLabels() {
        if (!window.map) return;
        var show = window.map.getLevel() <= 6;
        window.pickupMarkers.forEach(function (m) {
            m.overlay.setMap(show ? window.map : null);
        });
    }

    // ── 리스트 패널 ──
    function chip(text, cls) {
        var c = document.createElement('span');
        c.className = 'pl-chip' + (cls ? ' ' + cls : '');
        c.textContent = text;
        return c;
    }

    function buildListItem(g) {
        var item = document.createElement('div');
        item.className = 'pl-item';

        var when = document.createElement('div');
        when.className = 'pl-when';
        when.textContent = window.pkFormatWhen(g);
        item.appendChild(when);

        // XSS 방지: 사용자 입력(title/venue)은 textContent로만 삽입
        var title = document.createElement('div');
        title.className = 'pl-item-title';
        title.textContent = g.title || '';
        item.appendChild(title);

        var meta = document.createElement('div');
        meta.className = 'pl-meta';
        meta.appendChild(chip(window.pkSportLabel(g.sport), 'sport'));
        meta.appendChild(chip(window.pkLevelLabel(g.level)));
        if (g.beginner_friendly) meta.appendChild(chip(window.t('pk_beginner_ok'), 'beginner'));
        if (g.venue_name) {
            var v = document.createElement('span');
            v.className = 'pl-venue';
            v.textContent = '📍 ' + g.venue_name;
            meta.appendChild(v);
        }
        item.appendChild(meta);

        var spots = document.createElement('div');
        spots.className = 'pl-spots';
        var count = g.attending_count || 0, cap = g.capacity || 0;
        var full = count >= cap;
        var spotSpan = document.createElement('span');
        if (full) spotSpan.className = 'full';
        spotSpan.textContent = window.tf('pk_count', { c: count, cap: cap }) + (full ? ' · ' + window.t('pk_full') : '');
        spots.appendChild(spotSpan);
        if (g.fee) {
            spots.appendChild(document.createTextNode('  ·  ' + window.t('pk_fee_label') + ' ' + window.i18nPrice(g.fee)));
        }
        item.appendChild(spots);

        item.addEventListener('click', function () {
            if (g.lat && g.lng && window.map) {
                window.map.setLevel(Math.min(window.map.getLevel(), 5), { animate: true });
                window.map.panTo(new kakao.maps.LatLng(g.lat, g.lng));
            }
            if (window.openPickupDetail) window.openPickupDetail(g.id);
        });
        return item;
    }

    window.renderPickupList = function () {
        var body = document.getElementById('pickupListBody');
        if (!body) return;
        body.innerHTML = '';

        var kw = '';
        var si = document.getElementById('topSearchInput');
        if (si && window.currentTab === 'pickup') kw = (si.value || '').trim().toLowerCase();

        var games = window.pickupGames.filter(function (g) {
            if (!kw) return true;
            return (g.title || '').toLowerCase().indexOf(kw) !== -1
                || (g.venue_name || '').toLowerCase().indexOf(kw) !== -1
                || (g.address || '').toLowerCase().indexOf(kw) !== -1;
        });

        if (games.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'pl-empty';
            empty.textContent = window.t('pk_empty');
            body.appendChild(empty);
            return;
        }

        games.forEach(function (g) { body.appendChild(buildListItem(g)); });
    };

    // 줌 변경 시 픽업 라벨 가시성 (동호회 라벨과 독립)
    if (window.map) {
        kakao.maps.event.addListener(window.map, 'zoom_changed', updatePickupLabels);
    }

    // 언어 전환 시 픽업 리스트 재렌더 (칩/라벨 i18n 갱신)
    document.addEventListener('nurungji:langchange', function () {
        if (window.currentTab === 'pickup') window.renderPickupList();
    });
})();
