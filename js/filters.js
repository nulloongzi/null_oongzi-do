// filters.js
// Filter logic, search, region/day/target filtering, GPS location
// Depends on: map-core.js (window.map, window.markers, window.clusterer, window.updateLabelVisibility, window.gpsImage, window.myMarker)

window.activeFilters = { region: [], day: [], target: [] };

window.toggleFilter = function (category, value, element) {
    var index = window.activeFilters[category].indexOf(value);
    if (index === -1) {
        window.activeFilters[category].push(value);
        element.classList.add('selected');
    } else {
        window.activeFilters[category].splice(index, 1);
        element.classList.remove('selected');
    }
};

window.resetFilters = function () {
    window.activeFilters = { region: [], day: [], target: [] };
    document.querySelectorAll('.chip').forEach(function (el) { el.classList.remove('selected'); });
    document.getElementById('topSearchInput').value = "";
    window.applyFilters();
};

window.applyFilters = function () {
    if (window.event && window.event.type === 'click') window.closeFilterSheet();

    var keyword = document.getElementById('topSearchInput').value.trim();
    var filterCount = window.activeFilters.region.length + window.activeFilters.day.length + window.activeFilters.target.length;

    // Update filter badge
    var badge = document.getElementById('filterBadge');
    if (badge) {
        if (filterCount > 0) badge.classList.add('active');
        else badge.classList.remove('active');
    }

    window.clusterer.clear();
    var visibleNormalMarkers = [];
    var bounds = new kakao.maps.LatLngBounds();

    window.markers.forEach(function (item) {
        var club = item.club;

        // Region match
        var regionMatch = true;
        if (window.activeFilters.region.length > 0) {
            regionMatch = false;
            for (var i = 0; i < window.activeFilters.region.length; i++) {
                var r = window.activeFilters.region[i];
                if (r === "충청" && (club.address.startsWith("충남") || club.address.startsWith("충북") || club.address.startsWith("대전") || club.address.startsWith("세종"))) regionMatch = true;
                else if (r === "전라" && (club.address.startsWith("전남") || club.address.startsWith("전북") || club.address.startsWith("광주"))) regionMatch = true;
                else if (r === "경상" && (club.address.startsWith("경남") || club.address.startsWith("경북") || club.address.startsWith("대구") || club.address.startsWith("부산") || club.address.startsWith("울산"))) regionMatch = true;
                else if (club.address.startsWith(r)) regionMatch = true;
            }
        }

        // Day match
        var dayMatch = true;
        if (window.activeFilters.day.length > 0) {
            dayMatch = false;
            var cleanSchedule = (club.schedule || '').replace(/요일/g, "");
            if (cleanSchedule.includes("매일")) {
                dayMatch = true;
            } else {
                for (var i = 0; i < window.activeFilters.day.length; i++) {
                    if (cleanSchedule.includes(window.activeFilters.day[i])) dayMatch = true;
                }
            }
        }

        // Target match
        var targetMatch = true;
        if (window.activeFilters.target.length > 0) {
            targetMatch = false;
            var hasSpecialFilter = false;
            var specialFilters = ["여성전용", "남성전용", "선출가능", "6인제"];
            for (var s = 0; s < window.activeFilters.target.length; s++) {
                if (specialFilters.indexOf(window.activeFilters.target[s]) !== -1) { hasSpecialFilter = true; break; }
            }
            for (var i = 0; i < window.activeFilters.target.length; i++) {
                if (club.target.includes(window.activeFilters.target[i])) targetMatch = true;
            }
            if (!hasSpecialFilter && club.target.includes("무관")) targetMatch = true;
        }

        // Keyword match
        var keywordMatch = true;
        if (keyword.length > 0) {
            if (!club.name.includes(keyword) && !club.address.includes(keyword)) {
                keywordMatch = false;
            }
        }

        if (regionMatch && dayMatch && targetMatch && keywordMatch) {
            item.isVisible = true;
            if (club.is_urgent) {
                item.marker.setMap(window.map);
            } else {
                visibleNormalMarkers.push(item.marker);
            }
            bounds.extend(item.marker.getPosition());
        } else {
            item.isVisible = false;
            item.marker.setMap(null);
            item.overlay.setMap(null);
        }
    });

    window.clusterer.addMarkers(visibleNormalMarkers);
    window.updateLabelVisibility();

    if (!bounds.isEmpty() && (keyword.length > 0 || filterCount > 0)) {
        window.map.setBounds(bounds);
    }
};

// ── Filter sheet open/close ──

window.openFilterSheet = function () {
    document.getElementById('filterSheet').style.transform = "translateY(0)";
};

window.closeFilterSheet = function () {
    document.getElementById('filterSheet').style.transform = "translateY(-100%)";
};

window.toggleFilterSheet = function () {
    var sheet = document.getElementById('filterSheet');
    if (sheet.style.transform === "translateY(0px)" || sheet.style.transform === "") {
        window.closeFilterSheet();
    } else {
        window.openFilterSheet();
    }
};

// ── Filter sheet touch/mouse drag handlers ──

(function () {
    var filterSheet = document.getElementById('filterSheet');
    var filterHandle = document.getElementById('filterHandle');
    var fStartY = 0, fCurrentY = 0, fIsDragging = false;

    function fHandleStart(e) {
        fStartY = e.touches ? e.touches[0].clientY : e.clientY;
        fIsDragging = true;
        filterSheet.style.transition = 'none';
    }

    function fHandleMove(e) {
        if (!fIsDragging) return;
        if (e.cancelable && e.type.indexOf('touch') === 0) e.preventDefault();
        fCurrentY = e.touches ? e.touches[0].clientY : e.clientY;
        var deltaY = fCurrentY - fStartY;
        if (deltaY < 0) {
            filterSheet.style.transform = 'translateY(' + deltaY + 'px)';
        }
    }

    function fHandleEnd(e) {
        if (!fIsDragging) return;
        fIsDragging = false;
        var endY = e.changedTouches ? e.changedTouches[0].clientY : fCurrentY;
        if (!e.touches && fCurrentY === 0) endY = fStartY;
        var deltaY = endY - fStartY;
        filterSheet.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        if (deltaY < -50) {
            window.closeFilterSheet();
        } else {
            filterSheet.style.transform = "translateY(0)";
        }
        fCurrentY = 0;
        fStartY = 0;
    }

    filterHandle.addEventListener('touchstart', fHandleStart, { passive: true });
    filterHandle.addEventListener('touchmove', fHandleMove, { passive: false });
    filterHandle.addEventListener('touchend', fHandleEnd);
    filterHandle.addEventListener('mousedown', fHandleStart);
    window.addEventListener('mousemove', fHandleMove);
    window.addEventListener('mouseup', fHandleEnd);
})();

// ── GPS: move to my location ──

window.moveToMyLocation = function () {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var lat = position.coords.latitude, lon = position.coords.longitude;
            var locPosition = new kakao.maps.LatLng(lat, lon);
            if (window.myMarker) window.myMarker.setMap(null);
            window.myMarker = new kakao.maps.Marker({ map: window.map, position: locPosition, image: window.gpsImage });
            window.map.panTo(locPosition);
        });
    } else {
        alert('위치 정보를 사용할 수 없습니다.');
    }
};
