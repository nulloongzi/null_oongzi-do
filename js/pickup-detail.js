// pickup-detail.js
// 픽업 스팟 상세 바텀시트 (발견형): 일정·장소·게임비 정보 + "이번주" 배너 + 들어가는 문(단톡).
// 결제·RSVP·정산 없음. 소유자는 수정/삭제.
// Depends on: pickup-data.js, pickup-ui.js, pickup-host.js, i18n.js, dom-utils.js (sanitizeUrl)

(function () {
    var t = window.t;
    window.currentPickupId = null;

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function chip(text, cls) { return el('span', 'pl-chip' + (cls ? ' ' + cls : ''), text); }

    function openSheet() { var s = document.getElementById('pickupSheet'); if (s) s.classList.add('open'); }
    window.closePickupSheet = function () {
        var s = document.getElementById('pickupSheet');
        if (s) s.classList.remove('open');
        window.currentPickupId = null;
    };

    window.openPickupDetail = function (id, opts) {
        opts = opts || {};
        var spot = window.findPickupGame(id);
        if (!spot) return;
        window.currentPickupId = id;

        if (!opts.silent) {
            if (window.track) window.track('view_pickup', { id: id });
            try {
                if (spot.lat && spot.lng && window.map) {
                    window.map.setLevel(Math.min(window.map.getLevel(), 5), { animate: true });
                    var ll = new kakao.maps.LatLng(spot.lat, spot.lng);
                    var proj = window.map.getProjection();
                    var pt = proj.pointFromCoords(ll);
                    var np = new kakao.maps.Point(pt.x, pt.y + Math.min(window.innerHeight * 0.2, 220));
                    window.map.panTo(proj.coordsFromPoint(np));
                }
            } catch (e) { /* 지도 이동 실패해도 상세는 표시 */ }
        }

        renderSheet(spot);
        openSheet();
    };

    function infoRow(icon, textOrNode) {
        var r = el('div', 'info-row');
        r.appendChild(el('span', 'info-icon', icon));
        if (typeof textOrNode === 'string') r.appendChild(document.createTextNode(' ' + textOrNode));
        else r.appendChild(textOrNode);
        return r;
    }

    function renderSheet(spot) {
        var host = window.isPickupHost(spot);
        var c = document.getElementById('pickupSheetContent');
        if (!c) return;
        c.innerHTML = '';

        // 제목 + 태그 (XSS: 사용자 입력은 textContent)
        c.appendChild(el('div', 'ps-title', spot.title || ''));
        var tags = el('div', 'ps-tags');
        tags.appendChild(chip(window.pkSportLabel(spot.sport), 'sport'));
        tags.appendChild(chip(window.pkLevelLabel(spot.level)));
        if (spot.beginner_friendly) tags.appendChild(chip(t('pk_beginner_ok'), 'beginner'));
        if (spot.english_ok) tags.appendChild(chip(t('pk_english_ok'), 'english'));
        c.appendChild(tags);

        // "이번주" 배너 (가벼운 시한 공지)
        if (spot.this_week) {
            var tw = el('div', 'ps-thisweek');
            tw.appendChild(el('span', 'ps-tw-badge', t('pk_thisweek_badge')));
            tw.appendChild(document.createTextNode(' ' + spot.this_week));
            c.appendChild(tw);
        }

        // 보통 일정(구조화) + 메모(비정기)
        if (spot.schedule || spot.schedule_text) {
            c.appendChild(infoRow('🗓', spot.schedule || spot.schedule_text));
            if (spot.schedule && spot.schedule_text) c.appendChild(infoRow('📝', spot.schedule_text));
        }

        // 장소 + 주소 복사
        var where = el('span', 'ps-where-text');
        if (spot.venue_name) { where.appendChild(el('b', null, spot.venue_name)); where.appendChild(document.createElement('br')); }
        where.appendChild(document.createTextNode(spot.address || ''));
        var whereRow = infoRow('📍', where);
        if (spot.address) {
            var copyBtn = el('button', 'ps-mini-btn', t('btn_copy'));
            copyBtn.onclick = function () { if (window.copyAddress) window.copyAddress(spot.address); };
            whereRow.appendChild(copyBtn);
        }
        c.appendChild(whereRow);

        // 게임비 정보 (텍스트만, 거래 없음)
        if (spot.fee_info) c.appendChild(infoRow('💰', spot.fee_info));

        // 들어가는 문: 단톡/Meetup 링크 (주 CTA)
        var safeContact = spot.contact_link ? window.sanitizeUrl(spot.contact_link) : '';
        if (safeContact && safeContact !== '#') {
            var cta = el('a', 'ps-join-btn', t('pk_contact_cta'));
            cta.href = safeContact; cta.target = '_blank'; cta.rel = 'noopener noreferrer';
            // 물꼬 계측: 단톡 들어가기 = 픽업의 first-contact 순간 (Q2 지표)
            cta.onclick = function () { if (window.track) window.track('pickup_contact', { id: spot.id, sport: spot.sport }); };
            var wrap = el('div', 'ps-rsvp');
            wrap.appendChild(cta);
            c.appendChild(wrap);
        }

        // 공유 (?spot= 딥링크)
        var shareBtn = el('button', 'ps-share-btn', t('btn_share'));
        shareBtn.onclick = function () { if (window.sharePickup) window.sharePickup(spot); };
        c.appendChild(shareBtn);

        // 메모
        if (spot.notes) c.appendChild(el('div', 'ps-notes', spot.notes));

        // 소유자: 수정/삭제
        if (host) {
            var hc = el('div', 'ps-host-controls');
            var edit = el('button', 'ps-edit-btn', t('pk_edit'));
            edit.onclick = function () { window.closePickupSheet(); window.openPickupEditModal(spot); };
            hc.appendChild(edit);
            var del = el('button', 'ps-delete-btn', t('pk_delete'));
            del.onclick = function () { pkDelete(spot.id); };
            hc.appendChild(del);
            c.appendChild(hc);
        }
    }

    function pkDelete(id) {
        var g = window.findPickupGame(id);
        if (!g || !window.isPickupHost(g)) return;
        if (!confirm(t('pk_delete_confirm'))) return;
        window.deletePickupGame(id).then(function () {
            alert(t('pk_deleted'));
            window.closePickupSheet();
            if (window.renderPickupMarkers) window.renderPickupMarkers();
            if (window.renderPickupList) window.renderPickupList();
        }).catch(function (e) { alert(e.message || e); });
    }

    // 언어 전환 시 열린 상세 재렌더
    document.addEventListener('nurungji:langchange', function () {
        var s = document.getElementById('pickupSheet');
        if (window.currentPickupId && s && s.classList.contains('open')) {
            window.openPickupDetail(window.currentPickupId, { silent: true });
        }
    });
})();
