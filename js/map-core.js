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

window.initMarkers = function () {
    window.markers = [];
    var verifiedBadge = '<svg width="15" height="15" viewBox="0 0 24 24" style="vertical-align:text-bottom;margin-right:3px;" fill="#1DA1F2"><path d="M22.5 12.5c0-1.58-.87-2.92-2.14-3.58.14-.52.22-1.07.22-1.63 0-3.18-2.58-5.75-5.75-5.75-.56 0-1.11.08-1.63.22C12.54 1.49 11.2 0.62 9.62 0.62 6.44 0.62 3.87 3.2 3.87 6.38c0 .56.08 1.11.22 1.63C2.82 8.67 1.95 10 1.95 11.58c0 3.18 2.58 5.75 5.75 5.75.56 0 1.11-.08 1.63-.22.66 1.27 2 2.14 3.58 2.14 3.18 0 5.75-2.58 5.75-5.75 0-.56-.08-1.11-.22-1.63 1.27-.66 2.14-2 2.14-3.58zm-12.26 3.63L6 11.89l1.41-1.41 2.83 2.83 6.36-6.36 1.41 1.41-7.77 7.77z"/></svg>';

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

        var labelClass = club.is_urgent ? 'label urgent' : 'label';
        var iconHtml = club.is_urgent ? '🔥 ' : '';
        if (club.is_verified) iconHtml = verifiedBadge + iconHtml;
        var content = '<div class="' + labelClass + '" onclick="triggerMarkerClick(\'' + club.id + '\')">' + iconHtml + club.name + '</div>';
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

        var labelClass = club.is_urgent ? 'label urgent' : 'label';
        var iconHtml = club.is_urgent ? '🔥 ' : '';
        var content = '<div class="' + labelClass + '" onclick="triggerMarkerClick(\'' + club.id + '\')">' + iconHtml + club.name + '</div>';
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
