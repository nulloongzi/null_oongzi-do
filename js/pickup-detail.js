// pickup-detail.js
// 픽업 게임 상세 바텀시트: 정보 + RSVP(참가/대기/취소) + 송금(링크아웃) + 호스트 정산 로스터.
// Depends on: pickup-data.js, pickup-ui.js, pickup-host.js, i18n.js, dom-utils.js(sanitizeUrl)

(function () {
    var t = window.t, tf = window.tf;
    window.currentPickupId = null;

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function chip(text, cls) { return el('span', 'pl-chip' + (cls ? ' ' + cls : ''), text); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function whenText(game) {
        var s = window.pkFormatWhen(game);
        var de = window.toJsDate(game.datetime_end);
        if (de) s += ' ~ ' + pad(de.getHours()) + ':' + pad(de.getMinutes());
        return s;
    }

    function infoRow(icon, textOrNode) {
        var r = el('div', 'info-row');
        r.appendChild(el('span', 'info-icon', icon));
        if (typeof textOrNode === 'string') r.appendChild(document.createTextNode(' ' + textOrNode));
        else r.appendChild(textOrNode);
        return r;
    }

    // ── 시트 열기/닫기 ──
    function openSheet() {
        var s = document.getElementById('pickupSheet');
        if (s) s.classList.add('open');
    }
    window.closePickupSheet = function () {
        var s = document.getElementById('pickupSheet');
        if (s) s.classList.remove('open');
        window.currentPickupId = null;
    };

    window.openPickupDetail = function (id, opts) {
        opts = opts || {};
        var game = window.findPickupGame(id);
        if (!game) return;
        window.currentPickupId = id;

        if (!opts.silent) {
            if (window.track) window.track('view_pickup', { id: id });
            try {
                if (game.lat && game.lng && window.map) {
                    window.map.setLevel(Math.min(window.map.getLevel(), 5), { animate: true });
                    var ll = new kakao.maps.LatLng(game.lat, game.lng);
                    var proj = window.map.getProjection();
                    var pt = proj.pointFromCoords(ll);
                    var np = new kakao.maps.Point(pt.x, pt.y + Math.min(window.innerHeight * 0.2, 220));
                    window.map.panTo(proj.coordsFromPoint(np));
                }
            } catch (e) { /* 지도 이동 실패해도 상세는 표시 */ }
        }

        openSheet();

        // 내 참가상태 + 로스터를 함께 로드 후 1회 렌더
        Promise.all([window.getMyParticipation(id), window.loadParticipants(id)])
            .then(function (res) {
                if (window.currentPickupId !== id) return; // 그새 다른 게임으로 전환됨
                renderSheet(game, res[0], res[1]);
            })
            .catch(function (e) {
                console.error('pickup detail load error:', e);
                renderSheet(game, null, []);
            });
    };

    function refreshAfterChange(id) {
        window.openPickupDetail(id, { silent: true });
        if (window.renderPickupList) window.renderPickupList();
        if (window.renderPickupMarkers) window.renderPickupMarkers();
    }

    // ── 렌더 ──
    function renderSheet(game, myPart, roster) {
        roster = roster || [];
        var host = window.isPickupHost(game);
        var c = document.getElementById('pickupSheetContent');
        if (!c) return;
        c.innerHTML = '';

        // 제목 + 태그 (XSS: 제목은 textContent)
        c.appendChild(el('div', 'ps-title', game.title || ''));
        var tags = el('div', 'ps-tags');
        tags.appendChild(chip(window.pkSportLabel(game.sport), 'sport'));
        tags.appendChild(chip(window.pkLevelLabel(game.level)));
        if (game.beginner_friendly) tags.appendChild(chip(t('pk_beginner_ok'), 'beginner'));
        c.appendChild(tags);

        // 일시
        c.appendChild(infoRow('🗓', whenText(game)));

        // 장소 (체육관/주소 + 복사)
        var where = el('span', 'ps-where-text');
        if (game.venue_name) { where.appendChild(el('b', null, game.venue_name)); where.appendChild(document.createElement('br')); }
        where.appendChild(document.createTextNode(game.address || ''));
        var whereRow = infoRow('📍', where);
        if (game.address) {
            var copyBtn = el('button', 'ps-mini-btn', t('btn_copy'));
            copyBtn.onclick = function () { if (window.copyAddress) window.copyAddress(game.address); };
            whereRow.appendChild(copyBtn);
        }
        c.appendChild(whereRow);

        // 호스트
        c.appendChild(infoRow('👤', t('pk_host') + ': ' + (game.host_nickname || '—')));

        // 게임비 + 송금
        var feeText = game.fee ? (t('pk_fee_label') + ' ' + window.i18nPrice(game.fee)) : t('pk_fee_onsite');
        c.appendChild(infoRow('💰', feeText));
        var payRow = el('div', 'ps-pay-row');
        var safePay = game.pay_link ? window.sanitizeUrl(game.pay_link) : '';
        if (safePay && safePay !== '#') {
            var a = el('a', 'ps-pay-btn', t('pk_pay_send'));
            a.href = safePay; a.target = '_blank'; a.rel = 'noopener noreferrer';
            payRow.appendChild(a);
        }
        if (game.pay_account) {
            var ab = el('button', 'ps-acct-btn', t('pk_pay_account'));
            ab.onclick = function () { pkCopyAccount(game.pay_account); };
            payRow.appendChild(ab);
        }
        if (payRow.children.length) c.appendChild(payRow);

        // 정원
        var count = game.attending_count || 0, cap = game.capacity || 0, full = count >= cap;
        var spotsNode = el('span', full ? 'full' : null, tf('pk_count', { c: count, cap: cap }) + (full ? ' · ' + t('pk_full') : ''));
        c.appendChild(infoRow('🏐', spotsNode));

        // RSVP
        c.appendChild(buildRsvp(game, myPart));

        // 로스터 / 정산
        c.appendChild(buildRoster(game, roster, host));

        // 문의/단톡
        if (game.contact_link) {
            var safeC = window.sanitizeUrl(game.contact_link);
            if (safeC && safeC !== '#') {
                var cb = el('a', 'ps-contact-btn', '💬 ' + t('pk_contact'));
                cb.href = safeC; cb.target = '_blank'; cb.rel = 'noopener noreferrer';
                c.appendChild(cb);
            }
        }

        // 메모
        if (game.notes) c.appendChild(el('div', 'ps-notes', game.notes));

        // 호스트 컨트롤
        if (host) {
            var hc = el('div', 'ps-host-controls');
            var edit = el('button', 'ps-edit-btn', t('pk_edit'));
            edit.onclick = function () { window.closePickupSheet(); window.openPickupEditModal(game); };
            hc.appendChild(edit);
            var del = el('button', 'ps-delete-btn', t('pk_delete'));
            del.onclick = function () { pkDelete(game.id); };
            hc.appendChild(del);
            c.appendChild(hc);
        }
    }

    function buildRsvp(game, myPart) {
        var area = el('div', 'ps-rsvp');
        if (!window.currentUser) {
            var login = el('button', 'ps-join-btn', t('pk_login_to_join'));
            login.onclick = function () { if (window.toggleProfileCard) window.toggleProfileCard(); };
            area.appendChild(login);
        } else if (myPart && myPart.status === 'in') {
            area.appendChild(el('div', 'ps-joined-badge', t('pk_joined')));
            area.appendChild(cancelBtn(game.id));
        } else if (myPart && myPart.status === 'waitlist') {
            area.appendChild(el('div', 'ps-wait-badge', t('pk_waitlisted')));
            area.appendChild(cancelBtn(game.id));
        } else {
            var full = (game.attending_count || 0) >= (game.capacity || 0);
            var join = el('button', 'ps-join-btn', full ? t('pk_join_waitlist') : t('pk_join'));
            join.onclick = function () { pkJoin(game.id); };
            area.appendChild(join);
        }
        return area;
    }
    function cancelBtn(id) {
        var b = el('button', 'ps-cancel-btn', t('pk_cancel_spot'));
        b.onclick = function () { pkLeave(id); };
        return b;
    }

    function buildRoster(game, roster, host) {
        var wrap = el('div', 'ps-roster');
        var head = el('div', 'ps-roster-head');
        head.appendChild(el('span', 'ps-roster-title', t('pk_roster') + ' ' + roster.length));
        if (host) {
            var paidN = roster.filter(function (p) { return p.paid; }).length;
            head.appendChild(el('span', 'ps-paid-count', tf('pk_paid_count', { p: paidN, t: roster.length })));
        }
        wrap.appendChild(head);

        roster.forEach(function (p) {
            var row = el('div', 'ps-roster-row');
            row.appendChild(el('span', 'ps-roster-name', p.nickname || '—'));
            if (p.status === 'waitlist') row.appendChild(el('span', 'ps-badge wait', t('pk_waitlisted')));
            if (host) {
                var pb = el('button', 'ps-paid-btn' + (p.paid ? ' paid' : ''), p.paid ? t('pk_paid') : t('pk_unpaid'));
                pb.onclick = function () { pkTogglePaid(game.id, p.uid, !p.paid); };
                row.appendChild(pb);
            } else if (p.paid) {
                row.appendChild(el('span', 'ps-badge paid', t('pk_paid')));
            }
            wrap.appendChild(row);
        });
        return wrap;
    }

    // ── 액션 ──
    function pkJoin(id) {
        if (!window.currentUser) { alert(t('pk_login_to_join')); return; }
        window.joinPickupGame(id).then(function (status) {
            alert(status === 'in' ? t('pk_joined_in') : t('pk_joined_wait'));
            refreshAfterChange(id);
        }).catch(function (e) { alert(t('pk_join_err') + (e.message || e)); });
    }
    function pkLeave(id) {
        if (!confirm(t('pk_cancel_confirm'))) return;
        window.leavePickupGame(id).then(function () {
            alert(t('pk_canceled'));
            refreshAfterChange(id);
        }).catch(function (e) { alert(t('pk_join_err') + (e.message || e)); });
    }
    function pkTogglePaid(id, uid, paid) {
        window.setParticipantPaid(id, uid, paid).then(function () {
            window.openPickupDetail(id, { silent: true });
        }).catch(function (e) { alert(e.message || e); });
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
    function pkCopyAccount(acct) {
        function done() { alert(t('pk_acct_copied')); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(acct).then(done);
        } else {
            var i = document.createElement('input');
            i.value = acct;
            document.body.appendChild(i);
            i.select();
            document.execCommand('copy');
            document.body.removeChild(i);
            done();
        }
    }

    // 언어 전환 시 열린 상세 재렌더
    document.addEventListener('nurungji:langchange', function () {
        var s = document.getElementById('pickupSheet');
        if (window.currentPickupId && s && s.classList.contains('open')) {
            window.openPickupDetail(window.currentPickupId, { silent: true });
        }
    });
})();
