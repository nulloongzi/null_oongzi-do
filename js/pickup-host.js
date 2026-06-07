// pickup-host.js
// 픽업 스팟 등록/수정 모달 + 제출(주소 지오코딩). 누구나 등록(무로그인=익명 인증).
// 결제/정원 없음 — 보통 일정·게임비 정보(텍스트)·단톡 링크·"이번주" 메모만.
// Depends on: pickup-data.js, i18n.js, dom-utils.js (window.sanitizeUrl), kakao services

(function () {
    window.editingPickupId = null;

    // 단일선택 칩 (종목/레벨)
    window.pkSelectChip = function (el) {
        el.parentElement.querySelectorAll('.pk-chip').forEach(function (c) { c.classList.remove('selected'); });
        el.classList.add('selected');
    };
    function selectedVal(id, fb) { var el = document.querySelector('#' + id + ' .pk-chip.selected'); return el ? el.getAttribute('data-val') : fb; }
    function selectChipByVal(id, val) { document.querySelectorAll('#' + id + ' .pk-chip').forEach(function (c) { c.classList.toggle('selected', c.getAttribute('data-val') === val); }); }
    function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); }
    function getVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

    var TEXT_FIELDS = ['pkTitle', 'pkVenue', 'pkAddress', 'pkSchedule', 'pkThisWeek', 'pkFee', 'pkContact', 'pkNotes', 'pkReel'];

    window.openPickupCreateModal = function () {
        window.editingPickupId = null;
        document.getElementById('pkModalTitle').innerText = window.t('pk_create_title');
        document.getElementById('pkSubmitBtn').innerText = window.t('pk_create_submit');
        TEXT_FIELDS.forEach(function (id) { setVal(id, ''); });
        selectChipByVal('pkSportChips', '6s');
        selectChipByVal('pkLevelChips', 'any');
        var bc = document.getElementById('pkBeginnerChip'); if (bc) bc.classList.remove('selected');
        var ec = document.getElementById('pkEnglishChip'); if (ec) ec.classList.remove('selected');
        window.selectedCoords = null;
        var sc = document.getElementById('pkScheduleContainer');
        if (sc) { sc.innerHTML = ''; window.addScheduleBlock(null, 'pkScheduleContainer'); }
        document.getElementById('pkModalOverlay').style.display = 'flex';
    };

    window.openPickupEditModal = function (spot) {
        if (!spot || !window.canModifyPickup(spot)) { alert(window.t('reg_no_edit_perm')); return; }
        window.editingPickupId = spot.id;
        document.getElementById('pkModalTitle').innerText = window.t('pk_edit_title');
        document.getElementById('pkSubmitBtn').innerText = window.t('pk_save_submit');
        setVal('pkTitle', spot.title);
        setVal('pkVenue', spot.venue_name);
        setVal('pkAddress', spot.address);
        setVal('pkSchedule', spot.schedule_text);
        setVal('pkThisWeek', spot.this_week);
        setVal('pkFee', spot.fee_info);
        setVal('pkContact', spot.contact_link);
        setVal('pkNotes', spot.notes);
        setVal('pkReel', spot.insta_reel);
        selectChipByVal('pkSportChips', spot.sport || '6s');
        selectChipByVal('pkLevelChips', spot.level || 'any');
        var bc = document.getElementById('pkBeginnerChip'); if (bc) bc.classList.toggle('selected', !!spot.beginner_friendly);
        var ec = document.getElementById('pkEnglishChip'); if (ec) ec.classList.toggle('selected', !!spot.english_ok);
        window.selectedCoords = null;

        // 구조화 일정 복원: 같은 (시작~종료) 시간대끼리 묶어 한 블록에 여러 요일 칩으로 (동호회 편집과 동일)
        var sc = document.getElementById('pkScheduleContainer');
        if (sc) sc.innerHTML = '';
        if (Array.isArray(spot.schedule_raw) && spot.schedule_raw.length > 0) {
            var groups = [], gi = {};
            spot.schedule_raw.forEach(function (row) {
                if (!row || !row.start || !row.end || !row.day) return;
                var key = row.start + '|' + row.end;
                if (!gi.hasOwnProperty(key)) { gi[key] = groups.length; groups.push({ start: row.start, end: row.end, days: [] }); }
                if (groups[gi[key]].days.indexOf(row.day) === -1) groups[gi[key]].days.push(row.day);
            });
            if (groups.length === 0) window.addScheduleBlock(null, 'pkScheduleContainer');
            else groups.forEach(function (g) { window.addScheduleBlock({ days: g.days, start: g.start, end: g.end }, 'pkScheduleContainer'); });
        } else {
            window.addScheduleBlock(null, 'pkScheduleContainer');
        }
        document.getElementById('pkModalOverlay').style.display = 'flex';
    };

    window.closePickupModal = function () {
        document.getElementById('pkModalOverlay').style.display = 'none';
        window.editingPickupId = null;
        window.selectedCoords = null;
    };

    function geocode(address) {
        return new Promise(function (resolve, reject) {
            var geocoder = new kakao.maps.services.Geocoder();
            geocoder.addressSearch(address, function (result, status) {
                if (status === kakao.maps.services.Status.OK && result[0]) {
                    resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
                } else {
                    reject(new Error(window.t('reg_addr_notfound')));
                }
            });
        });
    }

    window.submitPickupGame = async function () {
        var capturedEditId = window.editingPickupId;
        var title = getVal('pkTitle');
        var address = getVal('pkAddress');
        if (!title || !address) { alert(window.t('pk_req_fields')); return; }

        // 링크 검증 (선택): 단톡/Meetup 등 http(s)만
        var contact = getVal('pkContact');
        if (contact) {
            var sc = window.sanitizeUrl(contact);
            if (!sc || sc === '#') { alert(window.t('reg_link_invalid')); return; }
            contact = sc;
        }

        // 릴스/게시물 링크 (선택): 공개 인스타 permalink만
        var reel = getVal('pkReel');
        if (reel) {
            var sr = window.sanitizeInstaPostUrl(reel);
            if (!sr) { alert(window.t('insta_reel_invalid')); return; }
            reel = sr;
        }

        var beginnerChip = document.getElementById('pkBeginnerChip');
        var englishChip = document.getElementById('pkEnglishChip');
        var sd = window.getScheduleData('pkScheduleContainer'); // 구조화 일정 → {raw, text}
        var fields = {
            title: title,
            sport: selectedVal('pkSportChips', '6s'),
            level: selectedVal('pkLevelChips', 'any'),
            beginner_friendly: !!(beginnerChip && beginnerChip.classList.contains('selected')),
            english_ok: !!(englishChip && englishChip.classList.contains('selected')),
            venue_name: getVal('pkVenue'),
            address: address,
            schedule: sd.text,
            schedule_raw: sd.raw,
            schedule_text: getVal('pkSchedule'),
            fee_info: getVal('pkFee'),
            contact_link: contact,
            this_week: getVal('pkThisWeek'),
            insta_reel: reel,
            notes: getVal('pkNotes')
        };

        var btn = document.getElementById('pkSubmitBtn');
        var orig = btn.innerText;
        btn.disabled = true;
        btn.innerText = window.t('processing');
        try {
            // 지도에서 찍었으면 그 좌표, 아니면 주소 지오코딩
            fields.coordinates = window.selectedCoords ? window.selectedCoords : await geocode(address);
            if (capturedEditId) {
                await window.updatePickupGame(capturedEditId, fields);
                alert(window.t('pk_updated'));
            } else {
                await window.createPickupGame(fields); // 무로그인 시 내부에서 익명 인증
                alert(window.t('pk_created'));
            }
            window.closePickupModal();
            if (window.currentTab === 'pickup' && window.loadPickupGames) {
                await window.loadPickupGames();
                if (window.renderPickupMarkers) window.renderPickupMarkers();
                if (window.renderPickupList) window.renderPickupList();
            }
            if (window.track) window.track('pickup_create', { mode: capturedEditId ? 'edit' : 'create' });
        } catch (e) {
            console.error(e);
            alert(window.t('pk_create_err') + (e.message || e));
        } finally {
            btn.disabled = false;
            btn.innerText = orig;
        }
    };
})();
