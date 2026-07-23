// map-core.js
// Kakao Map initialization, markers, clusterer, overlays
// Depends on: Kakao Maps SDK loaded, data.js (window.allClubs)

var mapContainer = document.getElementById('map');
var mapOption = { center: new kakao.maps.LatLng(37.5665, 126.9780), level: 12 };

window.map = new kakao.maps.Map(mapContainer, mapOption);

window.clusterer = new kakao.maps.MarkerClusterer({
    map: window.map,
    averageCenter: true,
    minLevel: 6,
    styles: [{
        width: '40px', height: '40px',
        background: '#fac710', borderRadius: '50%',
        color: '#000', textAlign: 'center',
        fontWeight: 'bold', lineHeight: '40px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        fontSize: '14px'
    }]
});

window.markers = [];

// Marker images
var defaultImageSrc = './assets/marker_yellow.png';
var urgentImageSrc = './assets/marker_red.png';
var imageSize = new kakao.maps.Size(40, 53);
var imageOption = { offset: new kakao.maps.Point(20, 53) };

var defaultMarkerImage = new kakao.maps.MarkerImage(defaultImageSrc, imageSize, imageOption);
var urgentMarkerImage = new kakao.maps.MarkerImage(urgentImageSrc, imageSize, imageOption);

// GPS marker
var gpsSvg = 'data:image/svg+xml;charset=UTF-8,%3csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3e%3ccircle cx="50" cy="50" r="45" fill="rgba(66, 133, 244, 0.3)"/%3e%3ccircle cx="50" cy="50" r="25" fill="white"/%3e%3ccircle cx="50" cy="50" r="20" fill="%234285F4"/%3e%3c/svg%3e';
var gpsImage = new kakao.maps.MarkerImage(gpsSvg, new kakao.maps.Size(44, 44), { offset: new kakao.maps.Point(22, 22) });
var myMarker = null;

window.gpsImage = gpsImage;
window.myMarker = myMarker;

window.instaCssIcon = '<div class="instagram" title="인스타그램 보러가기"></div>';

// XSS 방지: 카카오맵 CustomOverlay에 사용자 입력(club.id/name)이 박힌 문자열을
// 넘기는 대신 HTMLElement를 직접 생성하고 이벤트 리스너를 부착한다.
var VERIFIED_BADGE_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" style="vertical-align:text-bottom;margin-right:3px;" fill="#1DA1F2"><path d="M22.5 12.5c0-1.58-.87-2.92-2.14-3.58.14-.52.22-1.07.22-1.63 0-3.18-2.58-5.75-5.75-5.75-.56 0-1.11.08-1.63.22C12.54 1.49 11.2 0.62 9.62 0.62 6.44 0.62 3.87 3.2 3.87 6.38c0 .56.08 1.11.22 1.63C2.82 8.67 1.95 10 1.95 11.58c0 3.18 2.58 5.75 5.75 5.75.56 0 1.11-.08 1.63-.22.66 1.27 2 2.14 3.58 2.14 3.18 0 5.75-2.58 5.75-5.75 0-.56-.08-1.11-.22-1.63 1.27-.66 2.14-2 2.14-3.58zm-12.26 3.63L6 11.89l1.41-1.41 2.83 2.83 6.36-6.36 1.41 1.41-7.77 7.77z"/></svg>';

// 릴스 발견 신호(앱 마커 링 배지 대응): 인스타 그라데이션 링 + 재생 삼각형.
// 지도만 훑어도 '분위기를 보여주는 팀'을 알아보고 → 라벨 롱프레스로 피크.
function buildReelBadgeEl() {
    var b = document.createElement('span');
    b.setAttribute('style',
        'display:inline-flex;align-items:center;justify-content:center;vertical-align:text-bottom;' +
        'width:15px;height:15px;margin-left:4px;border-radius:50%;' +
        'background:linear-gradient(45deg,#FEDA75,#FA7E1E,#D62976,#962FBF,#4F5BD5);' +
        'border:1.5px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.25);');
    // 정적 재생 삼각형 SVG(사용자 입력 없음)
    b.innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>';
    return b;
}

function buildClubLabelEl(club, includeVerifiedBadge) {
    var el = document.createElement('div');
    el.className = club.is_urgent ? 'label urgent' : 'label';
    if (includeVerifiedBadge && club.is_verified) {
        var badgeSpan = document.createElement('span');
        badgeSpan.innerHTML = VERIFIED_BADGE_SVG; // 정적 SVG, 사용자 입력 없음
        el.appendChild(badgeSpan);
    }
    if (club.is_urgent) {
        el.appendChild(document.createTextNode('🔥 '));
    }
    el.appendChild(document.createTextNode(club.name || ''));
    // 릴스 있는 팀: 이름 뒤에 미세한 발견 링(앱 패리티). insta_reels 배열 우선, insta_reel 단일 폴백.
    if ((club.insta_reels && club.insta_reels.length) || club.insta_reel) {
        el.appendChild(buildReelBadgeEl());
    }
    // 라벨 롱프레스(550ms) → 릴스 피크(앱 패리티 W2). 발화 직후 click(상세 열림)은 억제.
    var peekTimer = null, peekFired = false;
    function peekStart() {
        peekFired = false;
        peekTimer = setTimeout(function () { peekFired = true; showReelPeek(club); }, 550);
    }
    function peekCancel() { if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; } }
    el.addEventListener('touchstart', peekStart, { passive: true });
    el.addEventListener('touchmove', peekCancel, { passive: true });
    el.addEventListener('touchend', peekCancel);
    el.addEventListener('mousedown', peekStart);
    el.addEventListener('mouseup', peekCancel);
    el.addEventListener('mouseleave', peekCancel);
    el.addEventListener('click', function (e) {
        if (peekFired) { peekFired = false; e.stopImmediatePropagation(); e.preventDefault(); }
    });
    el.addEventListener('click', function () {
        window.openClubDetail(club.id);
    });
    return el;
}

// 릴스 피크 오버레이(앱 마커 롱프레스 대응): 블러 딤 + 팀명 + 첫 릴스 임베드. 바깥 탭 닫기.
function showReelPeek(club) {
    var urls = (club.insta_reels && club.insta_reels.length)
        ? club.insta_reels : (club.insta_reel ? [club.insta_reel] : []);
    if (!urls.length) return; // 릴스 없는 팀: 무시(라벨 클릭=상세로 충분)
    var ov = document.createElement('div');
    ov.setAttribute('style',
        'position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(93,64,55,.45);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
        'animation:fadeIn .25s;');
    var card = document.createElement('div');
    card.setAttribute('style',
        'width:88%;max-width:360px;max-height:80vh;overflow:auto;background:#fff;border-radius:20px;' +
        'padding:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);animation:slideUp .3s cubic-bezier(.34,1.56,.64,1);');
    var title = document.createElement('div');
    title.setAttribute('style', 'font-weight:800;color:#4e342e;margin:2px 4px 8px;');
    title.textContent = (club.is_urgent ? '🔥 ' : '') + (club.name || '');
    var box = document.createElement('div');
    card.appendChild(title);
    card.appendChild(box);
    ov.appendChild(card);
    ov.addEventListener('click', function (e) {
        if (e.target === ov) document.body.removeChild(ov);
    });
    document.body.appendChild(ov);
    // 커버 있으면 정지 커버 포스터 → 탭하면 임베드(빠른 감 잡기). 없으면 기존 임베드.
    var covers = club.insta_reel_covers;
    var cover = (covers && window.reelCodeFromUrl) ? (covers[window.reelCodeFromUrl(urls[0])] || '') : '';
    if (window.renderReelPoster) window.renderReelPoster(box, urls[0], cover);
    else if (window.renderInstaEmbed) window.renderInstaEmbed(box, urls[0]);
    if (window.track) window.track('reel_peek', { via: 'label' });
}

window.initMarkers = function () {
    window.markers = [];

    window.allClubs.forEach(function (club) {
        if (!club.lat || !club.lng) return;
        var latlng = new kakao.maps.LatLng(club.lat, club.lng);
        var marker;
        if (club.is_urgent) {
            marker = new kakao.maps.Marker({ position: latlng, image: urgentMarkerImage, zIndex: 9999 });
            marker.setMap(window.map);
        } else {
            marker = new kakao.maps.Marker({ position: latlng, image: defaultMarkerImage });
        }

        var content = buildClubLabelEl(club, true);
        var xAnc = 0.5, yAnc = 1;
        if (club.angle !== undefined) xAnc = 0.5 - (Math.cos(club.angle) * 0.5);
        var overlay = new kakao.maps.CustomOverlay({ position: latlng, content: content, xAnchor: xAnc, yAnchor: yAnc, zIndex: 9999 });

        if (club.is_urgent) overlay.setMap(window.map);
        kakao.maps.event.addListener(marker, 'click', function () { window.openClubDetail(club.id); });

        window.markers.push({ marker: marker, overlay: overlay, club: club, isVisible: true });
    });

    // Add non-urgent to clusterer
    var clusterMarkers = [];
    window.markers.forEach(function (item) {
        if (!item.club.is_urgent) clusterMarkers.push(item.marker);
    });
    window.clusterer.addMarkers(clusterMarkers);
    window.updateLabelVisibility();
};

window.triggerMarkerClick = function (id) {
    var target = window.markers.find(function (m) { return m.club.id === id; });
    if (target && target.marker) kakao.maps.event.trigger(target.marker, 'click');
};

window.updateLabelVisibility = function () {
    var level = window.map.getLevel();
    var showNormalLabels = (level <= 5);
    var showUrgentLabels = (level <= 8);
    window.markers.forEach(function (item) {
        if (!item.isVisible) return;
        if (item.club.is_urgent) {
            if (showUrgentLabels) item.overlay.setMap(window.map); else item.overlay.setMap(null);
        } else {
            if (showNormalLabels) item.overlay.setMap(window.map); else item.overlay.setMap(null);
        }
    });
};

window.refreshMarkers = function () {
    var existingIds = {};
    window.markers.forEach(function (item) {
        existingIds[item.club.id] = true;
    });

    var newClusterMarkers = [];
    window.allClubs.forEach(function (club) {
        if (existingIds[club.id]) return;
        if (!club.lat || !club.lng) return;

        var latlng = new kakao.maps.LatLng(club.lat, club.lng);
        var marker;
        if (club.is_urgent) {
            marker = new kakao.maps.Marker({ position: latlng, image: urgentMarkerImage, zIndex: 9999 });
            marker.setMap(window.map);
        } else {
            marker = new kakao.maps.Marker({ position: latlng, image: defaultMarkerImage });
            newClusterMarkers.push(marker);
        }

        var content = buildClubLabelEl(club, false);
        var xAnc = 0.5, yAnc = 1;
        if (club.angle !== undefined) xAnc = 0.5 - (Math.cos(club.angle) * 0.5);
        var overlay = new kakao.maps.CustomOverlay({ position: latlng, content: content, xAnchor: xAnc, yAnchor: yAnc, zIndex: 9999 });

        if (club.is_urgent) overlay.setMap(window.map);
        kakao.maps.event.addListener(marker, 'click', function () { window.openClubDetail(club.id); });

        window.markers.push({ marker: marker, overlay: overlay, club: club, isVisible: true });
    });

    if (newClusterMarkers.length > 0) {
        window.clusterer.addMarkers(newClusterMarkers);
    }
    window.updateLabelVisibility();
};

// Zoom change listener
kakao.maps.event.addListener(window.map, 'zoom_changed', window.updateLabelVisibility);
