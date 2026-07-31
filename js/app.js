// app.js - 초기화 오케스트레이션
// Depends on: firebase-init.js, auth.js, data.js, map-core.js, club-detail.js, filters.js, registration.js, verification.js, profile.js

// 인증 신청 알림: Cloud Functions onVerificationCreated 트리거가 자동 발송하므로
// 클라이언트는 더 이상 webhook URL을 호출하지 않는다.

(function () {
    // 1. Firebase 인증 리스너 설정
    if (window.setupAuthListener) {
        window.setupAuthListener();
    }

    // 2. 카카오 공유 SDK 초기화
    if (window.initKakaoShare) window.initKakaoShare();

    // 3. 데이터 로드 후 지도 초기화 + 딥링크 처리
    if (window.loadAllClubs) {
        window.loadAllClubs().then(function () {
            // 지도/필터 초기화: 실패해도 딥링크 착지는 별도로 진행한다
            try {
                if (window.initMarkers) window.initMarkers();
                if (window.initUrgentTicker) window.initUrgentTicker();
                if (window.applyFilters) window.applyFilters();
            } catch (e) {
                console.error('초기화 중 오류:', e);
            }

            // ?club=<id> 딥링크: 해당 클럽 상세 자동 오픈
            openDeepLinkClub();
            openDeepLinkSpot();
            openPickupListLink();
        });
    }

    // ?club=<id> 공유 링크 착지. 데이터(특히 Firestore 전용 팀)가 늦게 도착하면 1회만 재시도한다.
    function openDeepLinkClub(attempt) {
        var clubId = new URLSearchParams(location.search).get('club');
        if (!clubId) return;
        var c = window.findClub ? window.findClub(clubId) : null;
        if (c && window.openClubDetail) {
            if (window.track) window.track('deep_link_open', { club_id: c.id });
            window.openClubDetail(c.id);
        } else if (!attempt) {
            setTimeout(function () { openDeepLinkClub(1); }, 1500);
        }
    }

    // ?spot=<id> 픽업 딥링크: 픽업 탭으로 전환(데이터 로드+렌더) 후 상세 자동 오픈
    function openDeepLinkSpot() {
        var spotId = new URLSearchParams(location.search).get('spot');
        if (!spotId) return;
        if (window.switchTab) window.switchTab('pickup');
        var tries = 0;
        (function tryOpen() {
            var s = window.findPickupGame ? window.findPickupGame(spotId) : null;
            if (s && window.openPickupDetail) {
                if (window.track) window.track('deep_link_open', { spot_id: s.id });
                window.openPickupDetail(s.id);
            } else if (tries++ < 12) {
                setTimeout(tryOpen, 400);
            }
        })();
    }

    // ?tab=pickup&region=서울&english=1 착지 — 필터가 걸린 픽업 목록을 그대로 재현한다.
    // (외국인에게 "서울 ∧ English OK" 목록을 링크 하나로 보내는 용도. ?spot= 단건 딥링크와 별개)
    function openPickupListLink() {
        var p = new URLSearchParams(location.search);
        if (p.get('tab') !== 'pickup') return;
        if (p.get('spot')) return; // 단건 딥링크가 우선

        var region = p.get('region') || '';
        var english = p.get('english') === '1';

        if (window.switchTab) window.switchTab('pickup');

        var tries = 0;
        (function apply() {
            if (!window.renderPickupList || !window.pickupGames) {
                if (tries++ < 12) setTimeout(apply, 400);
                return;
            }
            window.pkRegion = region;
            window.pkEnglishOnly = english;

            var sel = document.getElementById('pkRegionFilter');
            if (sel) sel.value = region;
            var enBtn = document.getElementById('pkEnFilter');
            if (enBtn) enBtn.classList.toggle('on', english);

            window.renderPickupList();
            if (window.renderPickupMarkers) window.renderPickupMarkers();
            if (window.track) window.track('deep_link_open', { type: 'pickup_list', region: region, english: english });
        })();
    }

    // 3. 도시락 오버레이 배경 클릭 시 닫기
    var lbOverlay = document.getElementById('lunchboxOverlay');
    if (lbOverlay) {
        lbOverlay.addEventListener('click', function (e) {
            if (e.target === lbOverlay && window.closeLunchbox) {
                window.closeLunchbox();
            }
        });
    }
})();
