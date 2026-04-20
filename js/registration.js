// registration.js
// In-app team registration with Firebase Storage photo upload
// Depends on: firebase-init.js, map-core.js (window.map, window.allClubs, window.refreshMarkers, window.initMarkers, window.clusterer, window.markers)

window.selectedCoords = null;
window.editingClubId = null; // 편집 모드: club.id 설정 시 submitRegistration이 수정 경로로 분기

window.generateTimeOptions = function () {
    var options = '';
    for (var i = 6; i <= 23; i++) {
        var hour = i < 10 ? '0' + i : '' + i;
        options += '<option value="' + hour + ':00">' + hour + ':00</option>';
        options += '<option value="' + hour + ':30">' + hour + ':30</option>';
    }
    return options;
};

window.addScheduleRow = function () {
    var container = document.getElementById('scheduleContainer');
    var rowCount = container.children.length;
    var row = document.createElement('div');
    row.className = 'sched-row';
    row.id = 'schedRow_' + Date.now() + Math.random().toString(36).substr(2, 5);

    var timeOpts = window.generateTimeOptions();

    var startOpts = timeOpts.replace('"19:00"', '"19:00" selected');
    var endOpts = timeOpts.replace('"22:00"', '"22:00" selected');

    var deleteBtn = '';
    if (rowCount > 0) {
        deleteBtn = '<button type="button" class="del-btn" onclick="this.parentElement.remove()">🗑</button>';
    } else {
        deleteBtn = '<div style="width:33px; margin-left:auto;"></div>';
    }

    row.innerHTML =
        '<select class="sched-day">' +
            '<option value="월">월</option><option value="화">화</option><option value="수">수</option>' +
            '<option value="목">목</option><option value="금">금</option><option value="토">토</option><option value="일">일</option>' +
        '</select>' +
        '<select class="sched-start">' + startOpts + '</select>' +
        '<span>~</span>' +
        '<select class="sched-end">' + endOpts + '</select>' +
        deleteBtn;

    container.appendChild(row);
};

window.getScheduleData = function () {
    var container = document.getElementById('scheduleContainer');
    var rawList = [];
    var textParts = [];

    var rows = container.children;
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var day = row.querySelector('.sched-day').value;
        var start = row.querySelector('.sched-start').value;
        var end = row.querySelector('.sched-end').value;
        rawList.push({ day: day, start: start, end: end });
        textParts.push(day + ' ' + start + '~' + end);
    }

    return {
        raw: rawList,
        text: textParts.join(', ')
    };
};

window.openRegistrationModal = function (isUrgent) {
    try {
        // 편집 모드 초기화 (이전 openEditModal 흔적 제거)
        window.editingClubId = null;
        var submitBtn = document.getElementById('regSubmitBtn');
        if (submitBtn) submitBtn.innerText = '등록하기';
        document.getElementById('regModalTitle').innerText = isUrgent ? '급구/제보하기' : '팀 등록하기';

        var schedContainer = document.getElementById('scheduleContainer');
        if (schedContainer && schedContainer.children.length === 0) {
            window.addScheduleRow();
        }

        document.getElementById('regModalOverlay').style.display = 'flex';
        console.log('Successfully opened registration modal');
    } catch (e) {
        console.error('Error opening registration modal:', e);
    }
};

window.closeRegistrationModal = function () {
    document.getElementById('regModalOverlay').style.display = 'none';
    window.editingClubId = null; // 편집 모드 초기화
    window.selectedCoords = null;
};

// 편집 모달 열기: 기존 등록 폼에 값 미리 채우고, submit 시 update 경로로 분기
window.openEditModal = function (club) {
    if (!club) return;
    if (!window.canModifyClub || !window.canModifyClub(club)) {
        alert('수정 권한이 없습니다.');
        return;
    }
    try {
        // 제목과 버튼 라벨 변경
        var titleEl = document.getElementById('regModalTitle');
        if (titleEl) titleEl.innerText = '팀 정보 수정';
        var submitBtn = document.getElementById('regSubmitBtn');
        if (submitBtn) submitBtn.innerText = '수정하기';

        // 편집 대상 id 설정
        window.editingClubId = club.id;
        window.selectedCoords = null;

        // 기본 필드 채우기
        document.getElementById('regName').value = club.name || '';
        document.getElementById('regTarget').value = club.target || '';
        document.getElementById('regAddress').value = club.address || '';
        document.getElementById('regPrice').value = club.price || '';
        // insta/link는 평탄화된 값이 있을 수 있고, contact 중첩 객체에 있을 수도 있음
        var insta = club.insta || (club.contact && club.contact.insta) || '';
        var link = club.link || (club.contact && club.contact.link) || '';
        document.getElementById('regInsta').value = insta;
        document.getElementById('regLink').value = link;

        // 스케줄 행 재구성
        var sc = document.getElementById('scheduleContainer');
        if (sc) sc.innerHTML = '';
        if (Array.isArray(club.schedule_raw) && club.schedule_raw.length > 0) {
            club.schedule_raw.forEach(function (row) {
                window.addScheduleRow();
                var rows = sc.children;
                var last = rows[rows.length - 1];
                if (row.day) last.querySelector('.sched-day').value = row.day;
                if (row.start) last.querySelector('.sched-start').value = row.start;
                if (row.end) last.querySelector('.sched-end').value = row.end;
            });
        } else {
            window.addScheduleRow();
        }

        document.getElementById('regModalOverlay').style.display = 'flex';
    } catch (e) {
        console.error('Error opening edit modal:', e);
    }
};

function generateId() {
    return Math.random().toString(36).substring(2, 14);
}

// ── Map picker ──

window.startMapPicker = function () {
    window.closeRegistrationModal();
    document.getElementById('mapPickerOverlay').style.display = 'block';
};

window.cancelMapPicker = function () {
    document.getElementById('mapPickerOverlay').style.display = 'none';
    window.openRegistrationModal(false);
};

window.confirmMapPicker = function () {
    if (!window.map) return;
    var center = window.map.getCenter();
    var lat = center.getLat();
    var lng = center.getLng();
    window.selectedCoords = { lat: lat, lng: lng };

    var geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, function (result, status) {
        var detailAddr = "지도에서 선택된 위치";
        if (status === kakao.maps.services.Status.OK && result[0]) {
            detailAddr = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
        }
        document.getElementById('regAddress').value = detailAddr;

        document.getElementById('mapPickerOverlay').style.display = 'none';
        window.openRegistrationModal(false);
    });
};

// ── Submit registration ──

window.submitRegistration = async function () {
    if (!window.currentUser) {
        alert("팀을 등록하려면 먼저 로그인해주세요.");
        return;
    }

    var name = document.getElementById('regName').value.trim();
    var target = document.getElementById('regTarget').value.trim();
    var address = document.getElementById('regAddress').value.trim();

    if (!name || !target || !address) {
        alert("팀 이름, 대상, 주소는 필수 입력값입니다.");
        return;
    }

    var scheduleData = window.getScheduleData();
    var schedule = scheduleData.text;
    var schedule_raw = scheduleData.raw;
    var price = document.getElementById('regPrice').value.trim();
    var insta = document.getElementById('regInsta').value.trim();
    var link = document.getElementById('regLink').value.trim();
    var is_urgent = false;
    var urgent_msg = "";

    var btn = document.getElementById('regSubmitBtn');
    btn.innerText = '처리중...';
    btn.disabled = true;

    try {
        // Geocode address to coordinates
        var coords;
        if (window.selectedCoords) {
            coords = window.selectedCoords;
        } else {
            var geocoder = new kakao.maps.services.Geocoder();
            coords = await new Promise(function (resolve, reject) {
                geocoder.addressSearch(address, function (result, status) {
                    if (status === kakao.maps.services.Status.OK) {
                        resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
                    } else {
                        reject(new Error("주소를 찾을 수 없거나 올바르지 않습니다. 정확히 입력해주세요."));
                    }
                });
            });
        }

        var isEditing = !!window.editingClubId;
        var clubId = isEditing ? window.editingClubId : generateId();

        if (isEditing) {
            // 편집 모드: 소유자/관리자 필드만 업데이트, metadata/is_verified/registered_by 보존
            var updatePayload = {
                name: name,
                target: target,
                address: address,
                coordinates: coords,
                schedule: schedule,
                schedule_raw: schedule_raw,
                price: price,
                contact: { insta: insta, link: link },
                "metadata.updated_at": window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date()
            };

            await window.firebaseDB.collection("clubs").doc(clubId).update(updatePayload);

            alert("팀 정보가 수정되었습니다!");

            // 메모리 내 객체 업데이트 (lat/lng 평탄화 포함)
            var existing = window.allClubs.find(function (c) { return String(c.id) === String(clubId); });
            if (existing) {
                existing.name = name;
                existing.target = target;
                existing.address = address;
                existing.coordinates = coords;
                existing.lat = coords.lat;
                existing.lng = coords.lng;
                existing.schedule = schedule;
                existing.schedule_raw = schedule_raw;
                existing.price = price;
                existing.contact = { insta: insta, link: link };
                existing.insta = insta;
                existing.link = link;
            }
        } else {
            // 신규 등록 모드
            var newClub = {
                id: clubId,
                name: name,
                target: target,
                is_verified: false,
                registered_by: window.currentUser.uid,
                address: address,
                coordinates: coords,
                schedule: schedule,
                schedule_raw: schedule_raw,
                price: price,
                contact: { insta: insta, link: link },
                is_urgent: is_urgent,
                urgent_msg: urgent_msg,
                metadata: {
                    created_at: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(),
                    updated_at: window.firebaseServerTimestamp ? window.firebaseServerTimestamp() : new Date(),
                    status: "approved",
                    submitted_by: window.currentUser.uid
                }
            };

            if (window.firebaseSetDoc && window.firebaseDoc && window.firebaseDB) {
                await window.firebaseSetDoc(window.firebaseDoc(window.firebaseDB, "clubs", newClub.id), newClub);
            } else if (window.firebaseAddDoc && window.firebaseDB) {
                await window.firebaseAddDoc(window.firebaseCollection(window.firebaseDB, "clubs"), newClub);
            } else {
                console.error("Firebase DB is not initialized properly");
            }

            alert("팀 정보가 성공적으로 등록되었습니다!");

            // Update frontend: add to map
            newClub.lat = coords.lat;
            newClub.lng = coords.lng;
            newClub.insta = insta;
            newClub.link = link;
            window.clubs.push(newClub);
            window.allClubs.push(newClub);
        }

        // Re-render markers (수정/등록 모두)
        if (window.clusterer) window.clusterer.clear();
        if (window.markers) {
            window.markers.forEach(function (m) { if (m.marker) m.marker.setMap(null); });
            window.markers.forEach(function (m) { if (m.overlay) m.overlay.setMap(null); });
            window.markers = [];
        }
        if (window.initMarkers) window.initMarkers();

        if (is_urgent && window.initUrgentTicker) {
            window.initUrgentTicker();
        }

        window.closeRegistrationModal();

        // Clear form fields
        var fieldIds = ['regName', 'regTarget', 'regAddress', 'regPrice', 'regInsta', 'regLink'];
        for (var f = 0; f < fieldIds.length; f++) {
            var el = document.getElementById(fieldIds[f]);
            if (el) el.value = '';
        }
        window.selectedCoords = null;
        document.getElementById('scheduleContainer').innerHTML = '';
        window.addScheduleRow();

    } catch (error) {
        console.error(error);
        alert("등록 중 오류가 발생했습니다: " + error.message);
    } finally {
        btn.innerText = '등록하기';
        btn.disabled = false;
    }
};
