// tabs.js
// 동호회 ↔ 픽업 탭 전환 컨트롤러. 데이터소스·마커·FAB·상단/하단 크롬을 통째로 스왑.
// Depends on: map-core.js, filters.js, data.js, pickup-data.js, pickup-ui.js, club-detail.js

(function () {
    window.currentTab = 'clubs';

    function $(id) { return document.getElementById(id); }
    function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }

    function setTabButtons(tab) {
        var c = $('tabClubs'), p = $('tabPickup');
        if (c) c.classList.toggle('active', tab === 'clubs');
        if (p) p.classList.toggle('active', tab === 'pickup');
    }

    function teardownMarkers() {
        if (window.markers) {
            window.markers.forEach(function (m) {
                if (m.marker) m.marker.setMap(null);
                if (m.overlay) m.overlay.setMap(null);
            });
            window.markers = [];
        }
        if (window.clearPickupMarkers) window.clearPickupMarkers();
        if (window.clusterer) window.clusterer.clear();
    }

    function applyChrome(tab) {
        var isPickup = tab === 'pickup';
        // 등록 FAB: 동호회=팀등록 / 픽업=픽업등록 으로 같은 자리를 스왑
        show($('fabClubRegister'), !isPickup);
        show($('fabPickupCreate'), isPickup);
        // 필터(⚙️)는 동호회 전용 → 픽업 모드에서 숨김
        show($('filterBtnIcon'), !isPickup);

        // 도시락(🍱)·네임카드(🍚)는 로그인 기능이다. 픽업은 결정로그(2026-06-05 Q3)가
        // 못박은 무로그인 발견 wedge라 계정과의 결합이 약하고, 목록이 하단 46vh를
        // 차지하는데 그 위에 로그인 전용 FAB이 떠 있으면 정보 위계가 어긋난다.
        // → 픽업 탭에선 숨기고, 지도 조작인 📍(내 위치)만 목록 위로 올린다(CSS).
        show($('fabLunchbox'), !isPickup);
        show($('fabProfile'), !isPickup);
        document.body.classList.toggle('pickup-mode', isPickup);

        // 픽업 리스트 패널
        show($('pickupListPanel'), isPickup);
        // 급구 티커: 픽업에선 숨김, 동호회에선 내용 있을 때만 표시
        var ticker = $('urgentTicker');
        if (ticker) {
            var list = $('tickerList');
            ticker.style.display = (!isPickup && list && list.children.length > 0) ? 'flex' : 'none';
        }
        // 검색 placeholder를 모드에 맞게 (data-i18n-placeholder를 런타임으로 덮어씀)
        var si = $('topSearchInput');
        if (si) si.setAttribute('placeholder', window.t(isPickup ? 'pk_search_ph' : 'search_ph'));
    }

    window.switchTab = function (tab) {
        if (tab !== 'clubs' && tab !== 'pickup') return;
        if (tab === window.currentTab) return;
        window.currentTab = tab;
        setTabButtons(tab);
        if (window.closeBottomSheet) window.closeBottomSheet();
        if (window.closePickupSheet) window.closePickupSheet();
        teardownMarkers();
        applyChrome(tab);

        if (tab === 'clubs') {
            if (window.initMarkers) window.initMarkers();
            if (window.applyFilters) window.applyFilters();
        } else {
            if (window.loadPickupGames) {
                window.loadPickupGames().then(function () {
                    if (window.currentTab !== 'pickup') return; // 그새 다시 전환됐으면 무시
                    if (window.renderPickupMarkers) window.renderPickupMarkers();
                    if (window.renderPickupList) window.renderPickupList();
                });
            }
        }
        if (window.track) window.track('switch_tab', { tab: tab });
    };

    // 검색 입력 디스패처: 현재 탭에 맞는 필터 실행 (동호회=마커필터, 픽업=리스트필터)
    window.onSearchInput = function () {
        if (window.currentTab === 'pickup') {
            if (window.renderPickupList) window.renderPickupList();
        } else {
            if (window.applyFilters) window.applyFilters();
        }
    };

    // 언어 전환 후 검색 placeholder/티커 상태를 현재 탭 기준으로 다시 맞춤
    document.addEventListener('nurungji:langchange', function () {
        applyChrome(window.currentTab);
    });
})();
