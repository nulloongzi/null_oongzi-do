// data-trust.js
// 데이터 신뢰도 표시와 신고 통로. guidelines.html 이 약속한 두 가지를 화면에서 잇는다:
//   · "6개월마다 점검, 30일 무응답 시 표시 중단"  → 최종 확인일 표시 + 오래되면 '확인 필요'
//   · "잘못된 정보 신고 시 영업일 7일 이내 확인"   → 상세에서 바로 보내는 신고 메일
//
// 레거시 문서 대응: last_verified_at 이 없는 기존 항목은 metadata.updated_at →
// metadata.created_at 순으로 폴백한다. 마이그레이션 없이 첫 배포부터 값이 나온다.
// Depends on: i18n.js, dom-utils.js(sanitizeUrl)

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

    // 신고 메일 링크. 항목 이름·id 를 본문에 미리 넣어 확인 시간을 줄인다.
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

        var a = document.createElement('a');
        a.className = 'dt-report';
        a.href = window.buildReportUrl(kind, item.id, item.name || item.title || '');
        a.textContent = window.t('dt_report');
        a.rel = 'noopener noreferrer';
        a.onclick = function () {
            if (window.track) window.track('report_open', { kind: kind, id: item.id });
        };
        host.appendChild(a);
    };
})();
