// registration.js
// In-app team registration with Firebase Storage photo upload
// Depends on: firebase-init.js, map-core.js (window.map, window.allClubs, window.refreshMarkers, window.initMarkers, window.clusterer, window.markers)

window.selectedCoords = null;
window.editingClubId = null; // 편집 모드: club.id 설정 시 submitRegistration이 수정 경로로 분기
window._regResumePending = false; // 로그인 게이트: 로그인 후 자동 재제출 대기 플래그

// ── 인라인 에러 배너 (alert 대체) ──
// 폼 상단에 메시지를 띄우고 스크롤로 보여줌. alert처럼 흐름을 끊지 않음.
window.showRegError = function (msg) {
    var box = document.getElementById('regError');
    if (!box) { alert(msg); return; } // 폴백
    box.textContent = msg;
    box.style.display = 'block';
    var body = box.parentElement;
    if (body && typeof body.scrollTo === 'function') { body.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (body) { body.scrollTop = 0; }
};

window.clearRegError = function () {
    var box = document.getElementById('regError');
    if (box) { box.textContent = ''; box.style.display = 'none'; }
    // 필수 필드 하이라이트 해제
    ['regName', 'regAddress'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('reg-invalid');
    });
    var chips = document.getElementById('regTargetChips');
    if (chips) chips.classList.remove('reg-invalid');
};

window.generateTimeOptions = function () {
    var options = '';
    for (var i = 6; i <= 23; i++) {
        var hour = i < 10 ? '0' + i : '' + i;
        options += '<option value="' + hour + ':00">' + hour + ':00</option>';
        options += '<option value="' + hour + ':30">' + hour + ':30</option>';
    }
    return options;
};

// 운동시간 "블록": 한 시간대(시작~종료)에 여러 요일을 칩으로 선택.
// 저장 시 선택 요일마다 schedule_raw 엔트리로 전개됨(getScheduleData 참고).
// prefill = { days:['월','수'], start:'19:00', end:'22:00' }
window.addScheduleBlock = function (prefill, containerId) {
    prefill = prefill || {};
    var container = document.getElementById(containerId || 'scheduleContainer');
    var block = document.createElement('div');
    block.className = 'sched-block';

    var days = ['월', '화', '수', '목', '금', '토', '일'];
    var dayKey = { '월': 'd_mon', '화': 'd_tue', '수': 'd_wed', '목': 'd_thu', '금': 'd_fri', '토': 'd_sat', '일': 'd_sun' };
    var selectedDays = prefill.days || [];
    var chipsHtml = days.map(function (d) {
        var sel = selectedDays.indexOf(d) !== -1 ? ' selected' : '';
        return '<div class="chip sched-day-chip' + sel + '" data-day="' + d + '" data-i18n="' + dayKey[d] + '" onclick="toggleRegChip(this)">' + window.i18nDay(d) + '</div>';
    }).join('');

    var timeOpts = window.generateTimeOptions();
    var startVal = prefill.start || '19:00';
    var endVal = prefill.end || '22:00';
    var startOpts = timeOpts.replace('"' + startVal + '"', '"' + startVal + '" selected');
    var endOpts = timeOpts.replace('"' + endVal + '"', '"' + endVal + '" selected');

    block.innerHTML =
        '<div class="sched-day-chips">' + chipsHtml + '</div>' +
        '<div class="sched-time-row">' +
            '<select class="sched-start">' + startOpts + '</select>' +
            '<span class="sched-tilde">~</span>' +
            '<select class="sched-end">' + endOpts + '</select>' +
            '<button type="button" class="sched-block-del" onclick="this.closest(\'.sched-block\').remove()" title="삭제">🗑</button>' +
        '</div>';

    container.appendChild(block);
};
// 하위호환 별칭 (기존 호출부 대비)
window.addScheduleRow = window.addScheduleBlock;

window.getScheduleData = function (containerId) {
    var container = document.getElementById(containerId || 'scheduleContainer');
    if (!container) return { raw: [], text: '' };
    var rawList = [];
    var textParts = [];

    var blocks = container.children;
    for (var b = 0; b < blocks.length; b++) {
        var block = blocks[b];
        var startEl = block.querySelector('.sched-start');
        var endEl = block.querySelector('.sched-end');
        if (!startEl || !endEl) continue;
        var start = startEl.value;
        var end = endEl.value;
        // 선택된 요일 칩마다 한 엔트리로 전개 (요일 0개 블록은 무시)
        var chips = block.querySelectorAll('.sched-day-chip.selected');
        for (var c = 0; c < chips.length; c++) {
            var day = chips[c].getAttribute('data-day');
            rawList.push({ day: day, start: start, end: end });
            textParts.push(day + ' ' + start + '~' + end);
        }
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
        if (window.clearRegError) window.clearRegError();
        // 선택 정보 섹션은 신규 등록 시 접힌 상태로 시작 (체감 길이 축소)
        var optDetails = document.getElementById('regOptional');
        if (optDetails) optDetails.open = false;
        var submitBtn = document.getElementById('regSubmitBtn');
        if (submitBtn) submitBtn.innerText = window.t('reg_submit');
        window.setRegTargetValue(''); // 칩/메모 초기화
        document.getElementById('regModalTitle').innerText = isUrgent ? window.t('reg_title_urgent') : window.t('reg_title');
        // 관리자 전용 필드는 신규 등록 시에는 숨김
        var ownerGroup = document.getElementById('adminOwnerGroup');
        if (ownerGroup) ownerGroup.style.display = 'none';

        var schedContainer = document.getElementById('scheduleContainer');
        if (schedContainer && schedContainer.children.length === 0) {
            window.addScheduleBlock();
        }

        document.getElementById('regModalOverlay').style.display = 'flex';
        if (window.track) window.track('registration_open', { mode: 'create' });
        console.log('Successfully opened registration modal');
    } catch (e) {
        console.error('Error opening registration modal:', e);
    }
};

window.closeRegistrationModal = function () {
    document.getElementById('regModalOverlay').style.display = 'none';
    window.editingClubId = null; // 편집 모드 초기화
    window.selectedCoords = null;
    window._regResumePending = false; // 로그인 게이트 대기 해제
    if (window.clearRegError) window.clearRegError();
};

// 편집 모달 열기: 기존 등록 폼에 값 미리 채우고, submit 시 update 경로로 분기
window.openEditModal = function (club) {
    if (!club) return;
    if (!window.canModifyClub || !window.canModifyClub(club)) {
        alert(window.t('reg_no_edit_perm'));
        return;
    }
    try {
        if (window.clearRegError) window.clearRegError();
        // 편집 시에는 기존 값 확인/수정을 위해 선택 정보 섹션을 펼쳐둠
        var optDetails = document.getElementById('regOptional');
        if (optDetails) optDetails.open = true;
        // 제목과 버튼 라벨 변경
        var titleEl = document.getElementById('regModalTitle');
        if (titleEl) titleEl.innerText = window.t('reg_edit_title');
        var submitBtn = document.getElementById('regSubmitBtn');
        if (submitBtn) submitBtn.innerText = window.t('reg_edit_submit');

        // 편집 대상 id 설정
        window.editingClubId = club.id;
        // 기존 좌표 프리필(앱과 동일): 주소를 안 고치면 재지오코딩 없이 피커로 찍은 핀을 보존한다.
        // 주소 입력을 직접 수정하면 regAddress의 oninput이 selectedCoords를 리셋해 새 주소로 재지오코딩된다.
        window.selectedCoords =
            (club.coordinates && club.coordinates.lat != null && club.coordinates.lng != null)
                ? { lat: club.coordinates.lat, lng: club.coordinates.lng }
                : null;

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
        document.getElementById('regReel').value =
            (club.insta_reels && club.insta_reels.length ? club.insta_reels
                : (club.insta_reel ? [club.insta_reel] : [])).join('\n');

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

        // 스케줄 블록 재구성: 같은 (시작~종료) 시간대끼리 묶어 한 블록에 여러 요일 칩으로 복원
        var sc = document.getElementById('scheduleContainer');
        if (sc) sc.innerHTML = '';
        if (Array.isArray(club.schedule_raw) && club.schedule_raw.length > 0) {
            var groups = []; // [{start, end, days:[]}], 출현순 유지
            var groupIndex = {};
            club.schedule_raw.forEach(function (row) {
                if (!row || !row.start || !row.end || !row.day) return;
                var key = row.start + '|' + row.end;
                if (!groupIndex.hasOwnProperty(key)) {
                    groupIndex[key] = groups.length;
                    groups.push({ start: row.start, end: row.end, days: [] });
                }
                var g = groups[groupIndex[key]];
                if (g.days.indexOf(row.day) === -1) g.days.push(row.day);
            });
            if (groups.length === 0) {
                window.addScheduleBlock();
            } else {
                groups.forEach(function (g) {
                    window.addScheduleBlock({ days: g.days, start: g.start, end: g.end });
                });
            }
        } else {
            window.addScheduleBlock();
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
// overlay visibility만 토글. opts로 복귀 오버레이/주소 입력칸을 받아 동호회·픽업 공용.
window.startMapPicker = function (opts) {
    window._mpReturn = (opts && opts.overlay) || 'regModalOverlay';
    window._mpInput = (opts && opts.input) || 'regAddress';
    document.getElementById(window._mpReturn).style.display = 'none';
    document.getElementById('mapPickerOverlay').style.display = 'block';
};

window.cancelMapPicker = function () {
    document.getElementById('mapPickerOverlay').style.display = 'none';
    document.getElementById(window._mpReturn || 'regModalOverlay').style.display = 'flex';
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
        document.getElementById(window._mpInput || 'regAddress').value = detailAddr;

        document.getElementById('mapPickerOverlay').style.display = 'none';
        document.getElementById(window._mpReturn || 'regModalOverlay').style.display = 'flex';
    });
};

// ── Submit registration ──

window.submitRegistration = async function () {
    if (window.clearRegError) window.clearRegError();

    if (!window.currentUser) {
        // 로그인 게이트: 폼 내용을 버리지 않고 로그인 유도 → 로그인 성공 시 자동 재제출.
        if (window.track) window.track('registration_login_gate');
        window._regResumePending = true;
        document.getElementById('regModalOverlay').style.display = 'none';
        var hint = document.getElementById('regLoginHint');
        if (hint) hint.style.display = 'block';
        document.getElementById('profileOverlay').style.display = 'flex';
        return;
    }

    // 편집 모드 여부를 진입 시점에 즉시 캡처 (async 흐름 중 변경 방지)
    var __capturedEditingClubId = window.editingClubId;

    var name = document.getElementById('regName').value.trim();
    var target = window.getRegTargetValue();
    var address = document.getElementById('regAddress').value.trim();

    if (!name || !target || !address) {
        // 비어있는 필수 필드 하이라이트
        var nameEl = document.getElementById('regName');
        if (nameEl && !name) nameEl.classList.add('reg-invalid');
        var addrEl = document.getElementById('regAddress');
        if (addrEl && !address) addrEl.classList.add('reg-invalid');
        var chipsEl = document.getElementById('regTargetChips');
        if (chipsEl && !target) chipsEl.classList.add('reg-invalid');
        window.showRegError(window.t('reg_required'));
        return;
    }

    var scheduleData = window.getScheduleData();
    var schedule = scheduleData.text;
    var schedule_raw = scheduleData.raw;
    var price = document.getElementById('regPrice').value.trim();
    var insta = document.getElementById('regInsta').value.trim();
    var link = document.getElementById('regLink').value.trim();
    // 멀티 릴스(앱 패리티): 한 줄에 하나, 각각 permalink 검증. reel=첫 항목(웹 호환 단일).
    var reelLines = document.getElementById('regReel').value.split('\n');
    var reels = [];
    for (var rl = 0; rl < reelLines.length; rl++) {
        var rlv = reelLines[rl].trim();
        if (!rlv) continue;
        var rlsafe = window.sanitizeInstaPostUrl(rlv);
        if (!rlsafe) { window.showRegError(window.t('insta_reel_invalid')); return; }
        if (reels.indexOf(rlsafe) === -1) reels.push(rlsafe);
    }
    var reel = reels.length ? reels[0] : '';
    var is_urgent = false;
    var urgent_msg = "";

    // 길이 가드 (DoS · 도큐먼트 비대화 방지)
    if (name.length > 60) { window.showRegError(window.t('reg_name_max')); return; }
    if (target.length > 80) { window.showRegError(window.t('reg_target_max')); return; }
    if (address.length > 200) { window.showRegError(window.t('reg_addr_max')); return; }
    if (price.length > 100) { window.showRegError(window.t('reg_price_max')); return; }

    // insta 핸들 검증: 빈 값은 허용, 입력했으면 형식 통과해야 함
    if (insta) {
        var safeInsta = window.sanitizeInstaHandle(insta);
        if (!safeInsta) {
            window.showRegError(window.t('reg_insta_invalid'));
            return;
        }
        insta = safeInsta;
    }

    // link 검증: 빈 값은 허용, 입력했으면 http(s) 스킴이어야 함
    if (link) {
        var safeLink = window.sanitizeUrl(link);
        if (safeLink === '#' || !safeLink) {
            window.showRegError(window.t('reg_link_invalid'));
            return;
        }
        link = safeLink;
    }

    // 릴스/게시물 링크 검증: 빈 값 허용, 입력했으면 공개 인스타 permalink여야 함
    // (릴스 검증은 위 멀티 릴스 루프에서 완료)

    var btn = document.getElementById('regSubmitBtn');
    btn.innerText = window.t('processing');
    btn.disabled = true;

    try {
        // Geocode address to coordinates
        var coords;
        if (window.selectedCoords) {
            coords = window.selectedCoords;
        } else {
            try {
                var geocoder = new kakao.maps.services.Geocoder();
                coords = await new Promise(function (resolve, reject) {
                    geocoder.addressSearch(address, function (result, status) {
                        if (status === kakao.maps.services.Status.OK && result[0]) {
                            resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
                        } else {
                            reject(new Error('GEOCODE_FAIL'));
                        }
                    });
                });
            } catch (geoErr) {
                // 지오코딩 실패 → 하드 블록 대신 지도 피커로 폴백 유도.
                // 피커에서 위치 확정 시 selectedCoords가 채워지고 주소칸도 갱신되어,
                // 다시 '등록하기'를 누르면 지오코딩 없이 그대로 진행된다.
                if (window.track) window.track('registration_geocode_fail');
                btn.innerText = window.t('reg_submit');
                btn.disabled = false;
                window.showRegError(window.t('reg_addr_geocode_fallback'));
                window.startMapPicker();
                return;
            }
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
                insta_reel: reel,
                insta_reels: reels,
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
                existing.insta_reel = reel;
                existing.insta_reels = reels;
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
                insta_reel: reel,
                insta_reels: reels,
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
            newClub.insta_reel = reel;
            newClub.insta_reels = reels;
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
        var fieldIds = ['regName', 'regAddress', 'regPrice', 'regInsta', 'regLink', 'regReel'];
        for (var f = 0; f < fieldIds.length; f++) {
            var el = document.getElementById(fieldIds[f]);
            if (el) el.value = '';
        }
        window.setRegTargetValue(''); // 대상 칩/메모 초기화
        window.selectedCoords = null;
        document.getElementById('scheduleContainer').innerHTML = '';
        window.addScheduleBlock();

    } catch (error) {
        console.error(error);
        window.showRegError(window.t('reg_error') + error.message);
    } finally {
        btn.innerText = window.t('reg_submit');
        btn.disabled = false;
    }
};

// ── 로그인 게이트 자동 재개 ──
// setupAuthListener가 실제 로그인 성공 직후 호출한다. 로그인 게이트로 중단됐던
// 등록을 폼 내용 그대로 이어서 자동 재제출한다. 사용자가 로그인 없이 오버레이를
// 닫으면 toggleProfileCard가 폼을 복원하고 이 플래그를 해제한다.
window.resumePendingRegistration = function () {
    if (!window._regResumePending) return;
    window._regResumePending = false;
    var hint = document.getElementById('regLoginHint');
    if (hint) hint.style.display = 'none';
    var prof = document.getElementById('profileOverlay');
    if (prof) prof.style.display = 'none';
    document.getElementById('regModalOverlay').style.display = 'flex';
    window.submitRegistration();
};
