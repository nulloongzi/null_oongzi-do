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
            ['월', '화', '수', '목', '금', '토', '일'].map(function (d) {
                return '<option value="' + d + '">' + window.i18nDay(d) + '</option>';
            }).join('') +
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

// ── 대상(target) 칩 입력 ──
// 저장 포맷은 기존과 동일한 쉼표결합 한글 문자열 → 필터·기존 데이터와 하위호환.
window.toggleRegChip = function (el) {
    el.classList.toggle('selected');
};

window.getRegTargetValue = function () {
    var chips = document.querySelectorAll('#regTargetChips .reg-target-chip.selected');
    var vals = Array.prototype.map.call(chips, function (c) { return c.getAttribute('data-val'); });
    var base = vals.join(', ');
    var noteEl = document.getElementById('regTargetNote');
    var note = noteEl ? noteEl.value.trim() : '';
    if (note) base += (base ? ' (' + note + ')' : note);
    return base;
};

// 기존 target 문자열 → 칩 프리셀렉트 (부분일치). 잔여 표현은 메모로 복원 못 하므로 비움.
window.setRegTargetValue = function (targetStr) {
    targetStr = targetStr || '';
    document.querySelectorAll('#regTargetChips .reg-target-chip').forEach(function (c) {
        c.classList.toggle('selected', targetStr.indexOf(c.getAttribute('data-val')) !== -1);
    });
    var noteEl = document.getElementById('regTargetNote');
    if (noteEl) noteEl.value = '';
};

window.openRegistrationModal = function (isUrgent) {
    try {
        // 편집 모드 초기화 (이전 openEditModal 흔적 제거)
        window.editingClubId = null;
        var submitBtn = document.getElementById('regSubmitBtn');
        if (submitBtn) submitBtn.innerText = window.t('reg_submit');
        window.setRegTargetValue(''); // 칩/메모 초기화
        document.getElementById('regModalTitle').innerText = isUrgent ? window.t('reg_title_urgent') : window.t('reg_title');
        // 관리자 전용 필드는 신규 등록 시에는 숨김
        var ownerGroup = document.getElementById('adminOwnerGroup');
        if (ownerGroup) ownerGroup.style.display = 'none';

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
        alert(window.t('reg_no_edit_perm'));
        return;
    }
    try {
        // 제목과 버튼 라벨 변경
        var titleEl = document.getElementById('regModalTitle');
        if (titleEl) titleEl.innerText = window.t('reg_edit_title');
        var submitBtn = document.getElementById('regSubmitBtn');
        if (submitBtn) submitBtn.innerText = window.t('reg_edit_submit');

        // 편집 대상 id 설정
        window.editingClubId = club.id;
        window.selectedCoords = null;

        // 기본 필드 채우기
        document.getElementById('regName').value = club.name || '';
        window.setRegTargetValue(club.target || '');
        document.getElementById('regAddress').value = club.address || '';
        document.getElementById('regPrice').value = club.price || '';
        // insta/link는 평탄화된 값이 있을 수 있고, contact 중첩 객체에 있을 수도 있음
        var insta = club.insta || (club.contact && club.contact.insta) || '';
        var link = club.link || (club.contact && club.contact.link) || '';
        document.getElementById('regInsta').value = insta;
        document.getElementById('regLink').value = link;

        // 관리자 전용: 소유자 지정 필드
        var ownerGroup = document.getElementById('adminOwnerGroup');
        var ownerInput = document.getElementById('regOwnerEmail');
        if (ownerGroup && ownerInput) {
            if (window.isAdmin) {
                ownerGroup.style.display = 'block';
                ownerInput.value = ''; // 기본 비움 (미변경)
                // 현재 소유자의 닉네임으로 힌트 표시 (이메일은 비공개 서브컬렉션으로 이동됨)
                if (club.registered_by) {
                    window.firebaseDB.collection('users').doc(club.registered_by).get()
                        .then(function (d) {
                            if (d.exists) {
                                var nick = d.data().full_nickname || d.data().nickname || club.registered_by;
                                ownerInput.placeholder = window.tf('reg_owner_hint', { nick: nick });
                            }
                        }).catch(function () { /* ignore */ });
                } else {
                    ownerInput.placeholder = window.t('reg_owner_none');
                }
            } else {
                ownerGroup.style.display = 'none';
            }
        }

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
    // 암호학적 난수 기반 12자 id (Math.random 충돌·추측 위험 제거)
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var crypto = window.crypto || window.msCrypto;
    if (crypto && crypto.getRandomValues) {
        var arr = new Uint8Array(12);
        crypto.getRandomValues(arr);
        var s = '';
        for (var i = 0; i < arr.length; i++) s += chars.charAt(arr[i] % 36);
        return s;
    }
    // 폴백 (구형 브라우저)
    return Math.random().toString(36).substring(2, 14);
}

// ── Map picker ──

// 지도 picker 사용 중에도 편집 모드 상태를 보존하기 위해, 모달 닫기/재열기 대신
// overlay visibility만 토글 (editingClubId 유지)
window.startMapPicker = function () {
    document.getElementById('regModalOverlay').style.display = 'none';
    document.getElementById('mapPickerOverlay').style.display = 'block';
};

window.cancelMapPicker = function () {
    document.getElementById('mapPickerOverlay').style.display = 'none';
    document.getElementById('regModalOverlay').style.display = 'flex';
};

window.confirmMapPicker = function () {
    if (!window.map) return;
    var center = window.map.getCenter();
    var lat = center.getLat();
    var lng = center.getLng();
    window.selectedCoords = { lat: lat, lng: lng };

    var geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, function (result, status) {
        var detailAddr = window.t('reg_map_loc');
        if (status === kakao.maps.services.Status.OK && result[0]) {
            detailAddr = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
        }
        document.getElementById('regAddress').value = detailAddr;

        document.getElementById('mapPickerOverlay').style.display = 'none';
        document.getElementById('regModalOverlay').style.display = 'flex';
    });
};

// ── Submit registration ──

window.submitRegistration = async function () {
    if (!window.currentUser) {
        alert(window.t('reg_login_required'));
        return;
    }

    // 편집 모드 여부를 진입 시점에 즉시 캡처 (async 흐름 중 변경 방지)
    var __capturedEditingClubId = window.editingClubId;

    var name = document.getElementById('regName').value.trim();
    var target = window.getRegTargetValue();
    var address = document.getElementById('regAddress').value.trim();

    if (!name || !target || !address) {
        alert(window.t('reg_required'));
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

    // 길이 가드 (DoS · 도큐먼트 비대화 방지)
    if (name.length > 60) { alert(window.t('reg_name_max')); return; }
    if (target.length > 80) { alert(window.t('reg_target_max')); return; }
    if (address.length > 200) { alert(window.t('reg_addr_max')); return; }
    if (price.length > 100) { alert(window.t('reg_price_max')); return; }

    // insta 핸들 검증: 빈 값은 허용, 입력했으면 형식 통과해야 함
    if (insta) {
        var safeInsta = window.sanitizeInstaHandle(insta);
        if (!safeInsta) {
            alert(window.t('reg_insta_invalid'));
            return;
        }
        insta = safeInsta;
    }

    // link 검증: 빈 값은 허용, 입력했으면 http(s) 스킴이어야 함
    if (link) {
        var safeLink = window.sanitizeUrl(link);
        if (safeLink === '#' || !safeLink) {
            alert(window.t('reg_link_invalid'));
            return;
        }
        link = safeLink;
    }

    var btn = document.getElementById('regSubmitBtn');
    btn.innerText = window.t('processing');
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
                        reject(new Error(window.t('reg_addr_notfound')));
                    }
                });
            });
        }

        var isEditing = !!__capturedEditingClubId;
        var clubId = isEditing ? __capturedEditingClubId : generateId();

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

            // 관리자 전용: 소유자 지정. users.email이 비공개 서브컬렉션으로
            // 옮겨졌으므로 Cloud Function adminReassignOwner(onCall)를 호출하여
            // Admin SDK로 email→uid 조회 + clubs.registered_by 업데이트한다.
            var newOwnerUid = null;
            if (window.isAdmin) {
                var ownerEmailEl = document.getElementById('regOwnerEmail');
                var ownerEmail = ownerEmailEl ? ownerEmailEl.value.trim().toLowerCase() : '';
                if (ownerEmail) {
                    var reassign = window.firebaseCallable && window.firebaseCallable('adminReassignOwner');
                    if (!reassign) {
                        throw new Error(window.t('reg_cf_uninit'));
                    }
                    try {
                        var result = await reassign({ clubId: clubId, email: ownerEmail });
                        newOwnerUid = result && result.data && result.data.uid;
                    } catch (e) {
                        var msg = (e && e.message) ? e.message : window.t('reg_owner_fail');
                        throw new Error(msg);
                    }
                }
            }

            // adminReassignOwner이 이미 registered_by를 갱신했으므로 update payload에서는 제외.
            await window.firebaseDB.collection("clubs").doc(clubId).update(updatePayload);

            alert(window.t('reg_updated'));

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
                if (newOwnerUid) existing.registered_by = newOwnerUid;
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

            alert(window.t('reg_registered'));

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

        if (window.track) window.track('club_register', { mode: isEditing ? 'edit' : 'create' });

        window.closeRegistrationModal();

        // Clear form fields
        var fieldIds = ['regName', 'regAddress', 'regPrice', 'regInsta', 'regLink'];
        for (var f = 0; f < fieldIds.length; f++) {
            var el = document.getElementById(fieldIds[f]);
            if (el) el.value = '';
        }
        window.setRegTargetValue(''); // 대상 칩/메모 초기화
        window.selectedCoords = null;
        document.getElementById('scheduleContainer').innerHTML = '';
        window.addScheduleRow();

    } catch (error) {
        console.error(error);
        alert(window.t('reg_error') + error.message);
    } finally {
        btn.innerText = window.t('reg_submit');
        btn.disabled = false;
    }
};
