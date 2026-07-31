// pickup-ui.js
// 픽업 스팟 UI: 지도 마커(티얼 핀) + 리스트 패널 (발견형).
// 상세 바텀시트/등록 모달은 pickup-detail / pickup-host 에서.
// Depends on: pickup-data.js, map-core.js (window.map, window.clusterer), i18n.js

(function () {
    window.pickupMarkers = [];

    // English-OK 전용 필터 (리스트 헤더 토글)
    window.pkEnglishOnly = false;
    window.togglePkEnglishOnly = function (el) {
        window.pkEnglishOnly = !window.pkEnglishOnly;
        if (el) el.classList.toggle('on', window.pkEnglishOnly);
        refreshPickupViews();
    };

    // 지역 필터 (리스트 헤더 셀렉트). '' = 전체
    window.pkRegion = '';
    window.setPkRegion = function (val) {
        window.pkRegion = val || '';
        refreshPickupViews();
    };

    // 레벨 필터 (리스트 헤더 셀렉트). '' = 전체
    window.pkLevel = '';
    window.setPkLevel = function (val) {
        window.pkLevel = val || '';
        refreshPickupViews();
    };

    function refreshPickupViews() {
        window.renderPickupList();
        if (window.renderPickupMarkers) window.renderPickupMarkers();
        window.syncPickupUrl();
    }

    // 필터 상태를 주소창에 반영 → 그대로 복사해 보내면 상대도 같은 목록을 본다.
    // (외국인에게 "서울 ∧ English OK" 목록을 링크 하나로 건네는 게 이 기능의 핵심)
    window.syncPickupUrl = function () {
        if (window.currentTab !== 'pickup') return;
        try {
            var p = new URLSearchParams();
            p.set('tab', 'pickup');
            if (window.pkRegion) p.set('region', window.pkRegion);
            if (window.pkLevel) p.set('level', window.pkLevel);
            if (window.pkEnglishOnly) p.set('english', '1');
            window.history.replaceState(null, '', '?' + p.toString());
        } catch (e) { /* 히스토리 조작 실패는 무시 */ }
    };

    // 현재 필터 상태의 공유 링크
    window.pickupListShareUrl = function () {
        var p = new URLSearchParams();
        p.set('tab', 'pickup');
        if (window.pkRegion) p.set('region', window.pkRegion);
        if (window.pkLevel) p.set('level', window.pkLevel);
        if (window.pkEnglishOnly) p.set('english', '1');
        return (window.SITE_BASE_URL || '') + '?' + p.toString();
    };

    window.sharePickupList = function () {
        var url = window.pickupListShareUrl();
        if (navigator.share) {
            navigator.share({ title: window.t('pk_list_title'), url: url }).catch(function () { });
            return;
        }
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(function () {
                alert(window.t('pk_list_link_copied'));
            }).catch(function () { prompt(window.t('pk_list_link_copied'), url); });
            return;
        }
        prompt(window.t('pk_list_link_copied'), url);
    };

    // 동호회(노랑)와 구분되는 티얼 핀 (전용 에셋 없이 SVG data URI)
    var PIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="53" viewBox="0 0 40 53">' +
        '<path d="M20 0C9 0 0 9 0 20c0 14 20 33 20 33s20-19 20-33C40 9 31 0 20 0z" fill="#13a89e"/>' +
        '<circle cx="20" cy="20" r="8.5" fill="#fff"/></svg>';
    var pickupImage = new kakao.maps.MarkerImage(
        'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(PIN_SVG),
        new kakao.maps.Size(40, 53),
        { offset: new kakao.maps.Point(20, 53) }
    );

    window.pkSportLabel = function (s) {
        if (s === '6s') return window.t('pk_sport_6s');
        if (s === '9s') return window.t('pk_sport_9s');
        return window.t('pk_sport_mixed');
    };
    window.pkLevelLabel = function (l) {
        return window.t('pk_lv_' + (l || 'any'), window.t('pk_lv_any'));
    };

    // ── 지도 마커 ──
    function buildPickupLabel(spot) {
        var elc = document.createElement('div');
        elc.className = 'label pickup-label';
        elc.appendChild(document.createTextNode(spot.title || ''));
        elc.addEventListener('click', function () { if (window.openPickupDetail) window.openPickupDetail(spot.id); });
        return elc;
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
        // 목록과 같은 필터를 적용한다(앱 _visibleSpots 와 동일). 좌표 없는 크루는 목록에만 뜬다.
        window.visiblePickupSpots().forEach(function (g) {
            if (!g.lat || !g.lng) return;
            var latlng = new kakao.maps.LatLng(g.lat, g.lng);
            var marker = new kakao.maps.Marker({ position: latlng, image: pickupImage });
            var overlay = new kakao.maps.CustomOverlay({
                position: latlng, content: buildPickupLabel(g), xAnchor: 0.5, yAnchor: 1, zIndex: 9999
            });
            kakao.maps.event.addListener(marker, 'click', function () { if (window.openPickupDetail) window.openPickupDetail(g.id); });
            window.pickupMarkers.push({ marker: marker, overlay: overlay, game: g });
            clusterMarkers.push(marker);
        });
        if (window.clusterer && clusterMarkers.length) window.clusterer.addMarkers(clusterMarkers);
        updatePickupLabels();
    };

    function updatePickupLabels() {
        if (!window.map) return;
        var show = window.map.getLevel() <= 6;
        window.pickupMarkers.forEach(function (m) { m.overlay.setMap(show ? window.map : null); });
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

        // "이번주" 배지 (있으면 맨 위에서 시선 끌기)
        if (g.this_week) {
            var twRow = document.createElement('div');
            twRow.className = 'pl-thisweek';
            twRow.appendChild(chip(window.t('pk_thisweek_badge'), 'thisweek'));
            twRow.appendChild(document.createTextNode(' ' + g.this_week));
            item.appendChild(twRow);
        }

        // 보통 일정(구조화) + 메모(비정기)
        if (g.schedule || g.schedule_text) {
            var when = document.createElement('div');
            when.className = 'pl-when';
            when.textContent = '🗓 ' + (g.schedule || g.schedule_text);
            item.appendChild(when);
            if (g.schedule && g.schedule_text) {
                var memo = document.createElement('div');
                memo.className = 'pl-when';
                memo.style.color = '#8a8079';
                memo.style.fontWeight = '600';
                memo.textContent = '· ' + g.schedule_text;
                item.appendChild(memo);
            }
        }

        // XSS: 제목/장소는 textContent
        var title = document.createElement('div');
        title.className = 'pl-item-title';
        title.textContent = g.title || '';
        item.appendChild(title);

        var meta = document.createElement('div');
        meta.className = 'pl-meta';
        meta.appendChild(chip(window.pkSportLabel(g.sport), 'sport'));
        meta.appendChild(chip(window.pkLevelLabel(g.level)));
        if (g.beginner_friendly) meta.appendChild(chip(window.t('pk_beginner_ok'), 'beginner'));
        if (g.english_ok) meta.appendChild(chip(window.t('pk_english_ok'), 'english'));
        if (g.venue_name) {
            var v = document.createElement('span');
            v.className = 'pl-venue';
            v.textContent = '📍 ' + g.venue_name;
            meta.appendChild(v);
        } else if (g.region) {
            // 장소가 유동적인 크루: 체육관 대신 지역만
            var rg = document.createElement('span');
            rg.className = 'pl-venue';
            rg.textContent = '📍 ' + g.region;
            meta.appendChild(rg);
        }
        item.appendChild(meta);

        // 인스타 핸들 — 외국인에게 건네는 주 연락처. 목록에서 바로 보이게 한다.
        // XSS: 핸들은 textContent, href는 저장 시 sanitizeInstaHandle 로 정규화된 값.
        if (g.insta) {
            var ig = document.createElement('a');
            ig.className = 'pl-insta';
            ig.href = 'https://instagram.com/' + encodeURIComponent(g.insta);
            ig.target = '_blank';
            ig.rel = 'noopener noreferrer';
            ig.textContent = '📷 @' + g.insta;
            ig.addEventListener('click', function (ev) {
                ev.stopPropagation(); // 카드 클릭(상세 열기)과 분리
                if (window.track) window.track('pickup_contact', { id: g.id, type: 'insta', sport: g.sport });
            });
            item.appendChild(ig);
        }

        if (g.fee_info) {
            var fee = document.createElement('div');
            fee.className = 'pl-spots';
            fee.textContent = window.t('pk_fee_label') + ' ' + window.i18nPrice(g.fee_info);
            item.appendChild(fee);
        }

        item.addEventListener('click', function () {
            if (g.lat && g.lng && window.map) {
                window.map.setLevel(Math.min(window.map.getLevel(), 5), { animate: true });
                window.map.panTo(new kakao.maps.LatLng(g.lat, g.lng));
            }
            if (window.openPickupDetail) window.openPickupDetail(g.id);
        });
        return item;
    }

    // 현재 필터가 적용된 스팟 목록 (지도 마커·리스트 공통)
    window.visiblePickupSpots = function () {
        var kw = '';
        var si = document.getElementById('topSearchInput');
        if (si && window.currentTab === 'pickup') kw = si.value || '';
        return window.filterPickupSpots(window.pickupGames, {
            region: window.pkRegion,
            level: window.pkLevel,
            englishOnly: window.pkEnglishOnly,
            keyword: kw
        });
    };

    window.renderPickupList = function () {
        var body = document.getElementById('pickupListBody');
        if (!body) return;
        body.innerHTML = '';

        var spots = window.visiblePickupSpots();

        if (spots.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'pl-empty';
            empty.textContent = window.t('pk_empty');
            body.appendChild(empty);
            return;
        }
        spots.forEach(function (g) { body.appendChild(buildListItem(g)); });
    };

    // ── 지역 셀렉트 채우기 (라벨은 동호회 필터와 같은 i18n 키 재사용) ──
    var REGION_I18N = {
        '서울': 'r_seoul', '경기': 'r_gyeonggi', '인천': 'r_incheon', '강원': 'r_gangwon',
        '충청': 'r_chungcheong', '전라': 'r_jeolla', '경상': 'r_gyeongsang', '제주': 'r_jeju'
    };
    window.buildPkRegionOptions = function () {
        var sel = document.getElementById('pkRegionFilter');
        if (!sel) return;
        sel.innerHTML = '';
        var all = document.createElement('option');
        all.value = '';
        all.textContent = window.t('pk_region_all');
        sel.appendChild(all);
        (window.PICKUP_REGIONS || []).forEach(function (r) {
            var o = document.createElement('option');
            o.value = r;
            o.textContent = window.t(REGION_I18N[r] || '', r);
            sel.appendChild(o);
        });
        sel.value = window.pkRegion || '';
    };

    window.buildPkLevelOptions = function () {
        var sel = document.getElementById('pkLevelFilter');
        if (!sel) return;
        sel.innerHTML = '';
        var all = document.createElement('option');
        all.value = '';
        all.textContent = window.t('pk_level_all');
        sel.appendChild(all);
        (window.PICKUP_LEVELS || []).forEach(function (l) {
            var o = document.createElement('option');
            o.value = l;
            o.textContent = window.pkLevelLabel(l);
            sel.appendChild(o);
        });
        sel.value = window.pkLevel || '';
    };

    window.buildPkRegionOptions();
    window.buildPkLevelOptions();

    // 줌 변경 시 픽업 라벨 가시성
    if (window.map) kakao.maps.event.addListener(window.map, 'zoom_changed', updatePickupLabels);

    // 언어 전환 시 리스트·지역 셀렉트 재렌더
    document.addEventListener('nurungji:langchange', function () {
        window.buildPkRegionOptions();
        window.buildPkLevelOptions();
        if (window.currentTab === 'pickup') window.renderPickupList();
    });
})();
