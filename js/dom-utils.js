// dom-utils.js
// 출력 단계 escape/sanitize 헬퍼. classic script + window.* 전역 패턴.
// 사용자 입력(팀 이름/급구 메시지/링크/인스타 핸들 등)을 innerHTML이나 href에
// 박기 전에 반드시 이 헬퍼를 거쳐야 한다.

(function () {
    var HTML_ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    // HTML 컨텍스트에 안전하게 박을 수 있도록 특수문자 엔티티 변환
    window.escapeHtml = function (value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, function (ch) {
            return HTML_ESCAPE_MAP[ch];
        });
    };

    // href에 박기 전 URL 스킴 화이트리스트(http/https/mailto/tel). 그 외는 '#' 반환.
    // javascript:, data:, vbscript:, file: 등 차단.
    window.sanitizeUrl = function (value) {
        if (!value) return '';
        var s = String(value).trim();
        if (s === '') return '';
        // 프로토콜 없는 상대/도메인은 허용하지 않고 명시적으로만 통과
        if (/^https?:\/\//i.test(s)) return s;
        if (/^mailto:/i.test(s)) return s;
        if (/^tel:/i.test(s)) return s;
        return '#';
    };

    // 인스타그램 핸들: 영문/숫자/언더스코어/점, 1~30자
    window.sanitizeInstaHandle = function (value) {
        if (!value) return '';
        var s = String(value).trim().replace(/^@/, '');
        if (/^[A-Za-z0-9._]{1,30}$/.test(s)) return s;
        return '';
    };
})();
