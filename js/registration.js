// registration.js
// In-app team registration with Firebase Storage photo upload
// Depends on: firebase-init.js, map-core.js (window.map, window.allClubs, window.refreshMarkers, window.initMarkers, window.clusterer, window.markers)

window.selectedCoords = null;

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
    var name = document.getElementById('regName').value.trim();
    var target = document.getElementById('regTarget').value.trim();
    var address = document.getElementById('regAddress').value.trim();

    if (!name || !target || !address) {
        alert("팀 이름, 대상, 주소는 필수 입력값입니다.");
        return;
    }

    var photoInput = document.getElementById('regPhoto');
    var photoFile = photoInput.files[0];
    if (!photoFile) {
        alert("팀 활동/체육관 사진을 꼭 첨부해주세요! (인증용)");
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
        // Upload photo to Firebase Storage
        var photo_url = '';
        if (window.firebaseStorage && window.firebaseRef) {
            var photoRef = window.firebaseRef(window.firebaseStorage, 'club_photos/' + Date.now() + '_' + photoFile.name);
            var snapshot = await window.firebaseUploadBytes(photoRef, photoFile);
            photo_url = await snapshot.ref.getDownloadURL();
        }

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

        var newClub = {
            id: generateId(),
            name: name,
            target: target,
            is_verified: false,
            photo_url: photo_url,
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
                submitted_by: "in_app_form"
            }
        };

        // Save to Firestore
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

        // Re-render markers
        window.clusterer.clear();
        window.markers.forEach(function (m) { m.marker.setMap(null); });
        window.markers.forEach(function (m) { if (m.overlay) m.overlay.setMap(null); });
        window.markers = [];
        window.initMarkers();

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
        document.getElementById('regPhoto').value = '';
        window.addScheduleRow();

    } catch (error) {
        console.error(error);
        alert("등록 중 오류가 발생했습니다: " + error.message);
    } finally {
        btn.innerText = '등록하기';
        btn.disabled = false;
    }
};
