// data-trust.js
// 데이터 신뢰도 표시와 신고 통로. guidelines.html 이 약속한 두 가지를 화면에서 잇는다:
//   · "6개월마다 점검, 30일 무응답 시 표시 중단"  → 최종 확인일 표시 + 오래되면 '확인 필요'
//   · "잘못된 정보 신고 시 영업일 7일 이내 확인"   → 상세에서 바로 보내는 인앱 신고
//
// 레거시 문서 대응: last_verified_at 이 없는 기존 항목은 metadata.updated_at →
// metadata.created_at 순으로 폴백한다. 마이그레이션 없이 첫 배포부터 값이 나온다.
// 신고는 reports 컬렉션에 쓴다 — 인증 배지 심사와 같은 파이프(Cloud Function이 운영자
// 카톡으로 알림)를 타고, 이력이 데이터로 남아 처리 소요일을 나중에 셀 수 있다.
// mailto는 Firestore가 없거나 쓰기가 실패할 때의 폴백으로만 남는다.
// Depends on: i18n.js, dom-utils.js(sanitizeUrl), firebase-init.js(window.firebaseDB)

(function () {
    var SUPPORT_EMAIL = 'paulyoo999@gmail.com';
    var STALE_MONTHS = 6; // guidelines.html 2-3 의 점검 주기와 같은 값

    function toDate(v) {
        if (!v) return null;
        if (window.toJsDate) { var d = window.toJsDate(v); if (d) return d; }
        if (v.seconds) return new Date(v.seconds * 1000);
        var p = new Date(v);
        return isNaN(p.getTime()) ? null : p;
    }

    // 확인일: last_verified_at > metadata.updated_at > metadata.created_at
    window.lastVerifiedDate = function (item) {
        if (!item) return null;
        var meta = item.metadata || {};
        return toDate(item.last_verified_at) || toDate(meta.updated_at) || toDate(meta.created_at);
    };

    // 오래됐는가? 관리자가 data_status 를 명시했으면 그 값이 우선한다.
    window.isStaleClub = function (item) {
        if (!item) return false;
        if (item.data_status === 'needs_check' || item.data_status === 'dormant') return true;
        var d = window.lastVerifiedDate(item);
        if (!d) return false; // 확인일을 모르면 낙인찍지 않는다
        var cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - STALE_MONTHS);
        return d.getTime() < cutoff.getTime();
    };

    function fmt(d) {
        return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
    }

    // 신고 메일 링크 — Firestore 쓰기가 막혔을 때의 폴백. 항목 이름·id 를 미리 넣는다.
    window.buildReportUrl = function (kind, id, title) {
        var body = window.t('report_body') + '\n\n'
            + '- ' + (title || '') + '\n'
            + '- ' + kind + ' id: ' + id + '\n'
            + '- ' + window.t('report_what') + '\n\n';
        var url = 'mailto:' + SUPPORT_EMAIL
            + '?subject=' + encodeURIComponent(window.t('report_subject'))
            + '&body=' + encodeURIComponent(body);
        return window.sanitizeUrl ? window.sanitizeUrl(url) : url;
    };

    // ── 인앱 신고 모달 ────────────────────────────────────────────────
    var pending = null;   // { kind, id, title }
    var reason = '';

    function overlay() { return document.getElementById('reportModalOverlay'); }
    function showError(msg) {
        var e = document.getElementById('reportError');
        if (!e) return;
        e.textContent = msg || '';
        e.style.display = msg ? 'block' : 'none';
    }

    window.openReportModal = function (kind, id, title) {
        var o = overlay();
        if (!o) return;
        pending = { kind: kind, id: id, title: title || '' };
        reason = '';

        var target = document.getElementById('reportTarget');
        if (target) target.textContent = pending.title;   // XSS: 사용자 입력은 textContent
        var detail = document.getElementById('reportDetail');
        if (detail) detail.value = '';
        var chips = document.querySelectorAll('#reportReasonChips .rp-reason-chip');
        for (var i = 0; i < chips.length; i++) chips[i].classList.remove('selected');
        showError('');

        var btn = document.getElementById('reportSubmitBtn');
        if (btn) { btn.disabled = false; btn.textContent = window.t('rp_submit'); }

        o.style.display = 'flex';
        if (window.track) window.track('report_open', { kind: kind, id: id });
    };

    window.closeReportModal = function () {
        var o = overlay();
        if (o) o.style.display = 'none';
        pending = null;
    };

    window.selectReportReason = function (chip) {
        var chips = document.querySelectorAll('#reportReasonChips .rp-reason-chip');
        for (var i = 0; i < chips.length; i++) chips[i].classList.remove('selected');
        chip.classList.add('selected');
        reason = chip.getAttribute('data-val') || '';
        showError('');
    };

    // 무로그인 신고: 제3자는 신고하려고 로그인하지 않는다 → 익명 인증으로 uid만 확보.
    // (firestore.rules 가 reporter_uid == auth.uid 를 요구한다)
    function ensureUid() {
        if (window.currentUser) return Promise.resolve(window.currentUser.uid);
        if (!window.firebase || !firebase.auth) return Promise.reject(new Error('no-auth'));
        return firebase.auth().signInAnonymously().then(function (cred) { return cred.user.uid; });
    }

    window.submitReport = function () {
        if (!pending) return;
        if (!reason) { showError(window.t('rp_need_reason')); return; }

        var btn = document.getElementById('reportSubmitBtn');
        if (btn) { btn.disabled = true; btn.textContent = window.t('rp_sending'); }

        var detailEl = document.getElementById('reportDetail');
        var detail = detailEl ? detailEl.value.trim().slice(0, 500) : '';
        var item = pending;

        ensureUid().then(function (uid) {
            if (!window.firebaseDB) throw new Error('no-db');
            // 필드 집합은 firestore.rules 의 화이트리스트와 정확히 같아야 한다.
            return window.firebaseDB.collection('reports').add({
                kind: item.kind,
                target_id: item.id,
                target_name: (item.title || '').slice(0, 120),
                reason: reason,
                detail: detail,
                reporter_uid: uid,
                status: 'open',
                created_at: window.firebaseServerTimestamp
                    ? window.firebaseServerTimestamp() : new Date()
            });
        }).then(function () {
            if (window.track) window.track('report_submit', { kind: item.kind, id: item.id, reason: reason });
            window.closeReportModal();
            alert(window.t('rp_done'));
        }).catch(function (e) {
            console.warn('신고 전송 실패:', e && e.message);
            // 통로 자체가 막히면 안 된다 — 메일로 폴백해서 신고를 잃지 않는다.
            showError(window.t('rp_fail_mail'));
            if (btn) { btn.disabled = false; btn.textContent = window.t('rp_submit'); }
            var url = window.buildReportUrl(item.kind, item.id, item.title);
            if (url && url !== '#') window.open(url, '_blank', 'noopener');
        });
    };

    // 상세 하단 블록을 그린다. host 는 비워지고 다시 채워진다.
    // kind: 'club' | 'pickup'
    window.renderDataTrust = function (host, item, kind) {
        if (!host) return;
        host.innerHTML = '';
        if (!item) return;

        var d = window.lastVerifiedDate(item);
        var stale = window.isStaleClub(item);

        var line = document.createElement('div');
        line.className = 'dt-line' + (stale ? ' dt-stale' : '');
        if (d) {
            line.textContent = (stale ? '⚠️ ' : '🕒 ')
                + window.t('dt_last_verified') + ' ' + fmt(d)
                + (stale ? ' · ' + window.t('dt_needs_check') : '');
        } else {
            line.textContent = '🕒 ' + window.t('dt_unknown');
        }
        host.appendChild(line);

        // 버튼(a 아님) — 페이지를 떠나지 않고 그 자리에서 접수된다.
        var btn = document.createElement('button');
        btn.className = 'dt-report';
        btn.type = 'button';
        btn.textContent = window.t('dt_report');
        btn.onclick = function () { window.openReportModal(kind, item.id, item.name || item.title || ''); };
        host.appendChild(btn);
    };
})();
