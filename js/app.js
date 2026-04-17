// app.js - 초기화 오케스트레이션
// Depends on: firebase-init.js, auth.js, data.js, map-core.js, club-detail.js, filters.js, registration.js, verification.js, profile.js

window.VERIFICATION_WEBHOOK_URL = "https://verificationnotify-s6piatsfbq-uc.a.run.app";

(function () {
    // 1. Firebase 인증 리스너 설정
    if (window.setupAuthListener) {
        window.setupAuthListener();
    }

    // 2. 데이터 로드 후 지도 초기화
    if (window.loadAllClubs) {
        window.loadAllClubs().then(function () {
            if (window.initMarkers) window.initMarkers();
            if (window.initUrgentTicker) window.initUrgentTicker();
            if (window.applyFilters) window.applyFilters();
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
