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

    // 인스타 공개 게시물/릴스 permalink만 통과(임베드용). 정규 permalink로 정규화해 반환,
    // 무효/그 외 URL은 '' 반환. 쿼리·해시·유저네임 프리픽스는 버리고 {p|reel|tv}/{shortcode}만 사용.
    // (data-instgrm-permalink 속성에 박히므로 화이트리스트로 강하게 제한 — XSS/오용 방지)
    window.sanitizeInstaPostUrl = function (value) {
        if (!value) return '';
        var s = String(value).trim();
        // 허용: https://(www.)instagram.com[/<user>]/{p|reel|reels|tv}/<shortcode>
        var m = s.match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
        if (!m) return '';
        var type = m[1].toLowerCase();
        if (type === 'reels') type = 'reel';     // 정규화
        return 'https://www.instagram.com/' + type + '/' + m[2] + '/';
    };

    // 업로드 파일명을 안전한 형식으로 변환. 디렉터리 구분자/공백/특수문자 차단.
    // 결과 길이는 80자 이하로 제한 (Storage rules의 fileName 100자 한도 여유).
    window.sanitizeFilename = function (value) {
        if (!value) return 'photo';
        var s = String(value).trim();
        // 경로 구분자/제어문자 제거
        s = s.replace(/[\/\\:\x00-\x1f]/g, '_');
        // 영문/숫자/.-_ 외 문자는 _로 치환
        s = s.replace(/[^A-Za-z0-9._-]/g, '_');
        // 연속된 _ 압축
        s = s.replace(/_+/g, '_');
        if (s.length > 80) {
            // 확장자 보존하며 자르기
            var dot = s.lastIndexOf('.');
            if (dot > 0 && dot > s.length - 12) {
                var ext = s.substring(dot);
                s = s.substring(0, 80 - ext.length) + ext;
            } else {
                s = s.substring(0, 80);
            }
        }
        return s || 'photo';
    };
})();
