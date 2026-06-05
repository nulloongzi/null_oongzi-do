// pickup-host.js
// 픽업 게임 개설/수정 모달 제어 + 제출(주소 지오코딩·검증).
// Depends on: pickup-data.js, i18n.js, dom-utils.js (window.sanitizeUrl), kakao maps services

(function () {
    window.editingPickupId = null;

    // 단일선택 칩 (종목/레벨): 같은 그룹에서 하나만 selected
    window.pkSelectChip = function (el) {
        var group = el.parentElement;
        group.querySelectorAll('.pk-chip').forEach(function (c) { c.classList.remove('selected'); });
        el.classList.add('selected');
    };

    function selectedVal(containerId, fallback) {
        var el = document.querySelector('#' + containerId + ' .pk-chip.selected');
        return el ? el.getAttribute('data-val') : fallback;
    }
    function selectChipByVal(containerId, val) {
        document.querySelectorAll('#' + containerId + ' .pk-chip').forEach(function (c) {
            c.classList.toggle('selected', c.getAttribute('data-val') === val);
        });
    }
    function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); }
    function getVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function pad(n) { return (n < 10 ? '0' : '') + n; }

    window.openPickupCreateModal = function () {
        if (!window.currentUser) { alert(window.t('pk_login_required')); return; }
        window.editingPickupId = null;
        document.getElementById('pkModalTitle').innerText = window.t('pk_create_title');
        document.getElementById('pkSubmitBtn').innerText = window.t('pk_create_submit');

        ['pkTitle', 'pkVenue', 'pkAddress', 'pkCapacity', 'pkFee', 'pkPayLink', 'pkPayAccount', 'pkContact', 'pkNotes']
            .forEach(function (id) { setVal(id, ''); });
        selectChipByVal('pkSportChips', '6s');
        selectChipByVal('pkLevelChips', 'any');
        var bc = document.getElementById('pkBeginnerChip'); if (bc) bc.classList.remove('selected');

        var now = new Date();
        setVal('pkDate', now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()));
        setVal('pkStart', '19:00');
        setVal('pkEnd', '22:00');

        document.getElementById('pkModalOverlay').style.display = 'flex';
    };

    window.openPickupEditModal = function (game) {
        if (!game || !window.isPickupHost(game)) { alert(window.t('reg_no_edit_perm')); return; }
        window.editingPickupId = game.id;
        document.getElementById('pkModalTitle').innerText = window.t('pk_edit_title');
        document.getElementById('pkSubmitBtn').innerText = window.t('pk_save_submit');

        setVal('pkTitle', game.title);
        setVal('pkVenue', game.venue_name);
        setVal('pkAddress', game.address);
        setVal('pkCapacity', game.capacity);
        setVal('pkFee', game.fee);
        setVal('pkPayLink', game.pay_link);
        setVal('pkPayAccount', game.pay_account);
        setVal('pkContact', game.contact_link);
        setVal('pkNotes', game.notes);
        selectChipByVal('pkSportChips', game.sport || 'mixed');
        selectChipByVal('pkLevelChips', game.level || 'any');
        var bc = document.getElementById('pkBeginnerChip'); if (bc) bc.classList.toggle('selected', !!game.beginner_friendly);

        var ds = window.toJsDate(game.datetime_start);
        var de = window.toJsDate(game.datetime_end);
        if (ds) {
            setVal('pkDate', ds.getFullYear() + '-' + pad(ds.getMonth() + 1) + '-' + pad(ds.getDate()));
            setVal('pkStart', pad(ds.getHours()) + ':' + pad(ds.getMinutes()));
        }
        setVal('pkEnd', de ? (pad(de.getHours()) + ':' + pad(de.getMinutes())) : '');

        document.getElementById('pkModalOverlay').style.display = 'flex';
    };

    window.closePickupModal = function () {
        document.getElementById('pkModalOverlay').style.display = 'none';
        window.editingPickupId = null;
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
        if (!window.currentUser) { alert(window.t('pk_login_required')); return; }
        var capturedEditId = window.editingPickupId; // async 흐름 중 변경 방지

        var title = getVal('pkTitle');
        var address = getVal('pkAddress');
        var dateStr = getVal('pkDate');
        var startStr = getVal('pkStart');
        var endStr = getVal('pkEnd');
        var capacity = parseInt(getVal('pkCapacity'), 10);

        if (!title || !address || !dateStr || !startStr) { alert(window.t('pk_req_fields')); return; }
        if (!capacity || capacity < 1 || capacity > 200) { alert(window.t('pk_bad_capacity')); return; }

        var startDt = new Date(dateStr + 'T' + startStr);
        var endDt = endStr ? new Date(dateStr + 'T' + endStr) : null;
        if (isNaN(startDt.getTime())) { alert(window.t('pk_req_fields')); return; }
        if (endDt && endDt <= startDt) { alert(window.t('pk_bad_time')); return; }
        // 신규 개설 시에만 과거시간 차단 (수정은 과거 데이터 보존 허용)
        if (!capturedEditId && startDt.getTime() < Date.now() - 60000) { alert(window.t('pk_past_time')); return; }

        // 선택 링크 검증 (http/https만)
        var payLink = getVal('pkPayLink');
        var contact = getVal('pkContact');
        if (payLink) { var sp = window.sanitizeUrl(payLink); if (!sp || sp === '#') { alert(window.t('reg_link_invalid')); return; } payLink = sp; }
        if (contact) { var sc = window.sanitizeUrl(contact); if (!sc || sc === '#') { alert(window.t('reg_link_invalid')); return; } contact = sc; }

        var beginnerChip = document.getElementById('pkBeginnerChip');
        var fields = {
            title: title,
            sport: selectedVal('pkSportChips', 'mixed'),
            level: selectedVal('pkLevelChips', 'any'),
            beginner_friendly: !!(beginnerChip && beginnerChip.classList.contains('selected')),
            venue_name: getVal('pkVenue'),
            address: address,
            capacity: capacity,
            fee: getVal('pkFee'),
            pay_link: payLink,
            pay_account: getVal('pkPayAccount'),
            contact_link: contact,
            notes: getVal('pkNotes')
        };

        var btn = document.getElementById('pkSubmitBtn');
        var origText = btn.innerText;
        btn.disabled = true;
        btn.innerText = window.t('processing');

        try {
            fields.coordinates = await geocode(address);
            fields.datetime_start = startDt;
            fields.datetime_end = endDt;

            if (capturedEditId) {
                await window.updatePickupGame(capturedEditId, fields);
                alert(window.t('pk_updated'));
            } else {
                await window.createPickupGame(fields);
                alert(window.t('pk_created'));
            }

            window.closePickupModal();

            // 다가오는 게임 재정렬을 위해 재로딩 후 렌더
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
            btn.innerText = origText;
        }
    };
})();
