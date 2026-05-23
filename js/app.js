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
            if (window.initMarkers) window.initMarkers();
            if (window.initUrgentTicker) window.initUrgentTicker();
            if (window.applyFilters) window.applyFilters();

            // ?club=<id> 딥링크: 해당 클럽 상세 자동 오픈
            var clubId = new URLSearchParams(location.search).get('club');
            if (clubId) {
                var c = window.findClub(clubId);
                if (c && window.openClubDetail) window.openClubDetail(c.id);
            }
        });
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
