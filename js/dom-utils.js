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

    // 인스타 공개 게시물/릴스 permalink만 통과(릴스 카드용). 정규 permalink로 정규화해 반환,
    // 무효/그 외 URL은 '' 반환. 쿼리·해시·유저네임 프리픽스는 버리고 {p|reel|tv}/{shortcode}만 사용.
    // (탭 시 window.open 으로 열리고 Firestore 에 저장되므로 화이트리스트로 강하게 제한 — XSS/오용 방지)
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
        s = s.replace(/[/\\:\x00-\x1f]/g, '_');
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

// ── 위치 공개 수준 ──────────────────────────────────────────────
// 팀은 대개 학교·구민 체육관을 빌려 쓴다. 장소와 시간표를 같이 공개하면
// "그 체육관 그 시간에 누가 쓰는지"가 누구에게나 보인다 — 대관에서 밀린 사람이
// 찾아가 민원을 넣은 일이 실제로 있었다(2026-09).
//
// 'area' 를 고른 팀은 **정확한 좌표를 아예 저장하지 않는다.** clubs 는
// allow read: if true 라서, 화면에서만 흐리면 Firestore 를 직접 읽어 그대로
// 꺼낼 수 있다. firestore.rules 의 gridAligned() 가 저장 단계에서 강제한다.
//
// 이 세 함수는 functions/lib/pure.js 와 **같은 규칙**이어야 한다
// (tests/club-admins.test.js 가 대조한다).
window.AREA_GRID_DIVISOR = 200; // 1/0.005° ≈ 위도 550m

window.roundToAreaGrid = function (v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    return Math.round(n * window.AREA_GRID_DIVISOR) / window.AREA_GRID_DIVISOR;
};

window.areaLabel = function (address) {
    var SIDO = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청|전라|경상)/;
    var raw = String(address == null ? '' : address)
        .replace(/[()[\]]/g, ' ')
        .trim().replace(/\s+/g, ' ');
    if (!raw) return '';
    var parts = raw.split(' ');
    var start = -1;
    for (var i = 0; i < parts.length; i++) {
        if (SIDO.test(parts[i])) { start = i; break; }
    }
    if (start === -1) return '';
    var out = [parts[start]];
    for (var j = start + 1; j < parts.length && out.length < 3; j++) {
        if (!/[시군구]$/.test(parts[j])) break;
        out.push(parts[j]);
    }
    return out.join(' ');
};

// 기본은 '정확히'. 필드가 없는 기존 문서를 조용히 뭉개면 팀은 모르는 사이에
// 자기 팀이 지도에서 옮겨진 것처럼 보게 된다.
window.isAreaOnly = function (club) {
    return !!club && club.location_precision === 'area';
};

// ── 장소 검색 질의 변형 ─────────────────────────────────────────
// 주소 검색이 0건일 때 카카오 키워드 검색에 던질 질의들. 좁은 것부터 넓은 것 순.
// functions/lib/pure.js 의 placeQueryVariants 와 **같은 규칙**이어야 한다
// (tests/club-admins.test.js 가 대조한다).
//
// 뒤에서 떼는 말은 정해진 목록으로만 한정한다 — 아무 토큰이나 떼면
// "서울 강남구 삼성로135길 42" 에서 번지가 날아가 엉뚱한 곳을 찍는다.
window.placeQueryVariants = function (raw) {
    var FACILITY_TAIL = [
        '국민체육센터', '다목적체육관', '실내체육관', '체육센터', '체육관',
        '다목적', '실내', '강당', '경기장', '운동장', '코트', '센터', '관'
    ];
    var base = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
    if (!base) return [];

    var out = [];
    function push(v) {
        var t = String(v || '').trim().replace(/\s+/g, ' ');
        if (t && out.indexOf(t) === -1) out.push(t);
    }

    push(base);
    push(base.replace(/\s+/g, ''));

    var parts = base.split(' ');
    var changed = false;
    while (parts.length > 1) {
        if (FACILITY_TAIL.indexOf(parts[parts.length - 1]) === -1) break;
        parts.pop();
        changed = true;
    }
    if (changed) {
        push(parts.join(' '));
        push(parts.join(''));
    }

    // 질의 한 번이 곧 API 호출 한 번이다. 네 번에서 끊는다.
    return out.slice(0, 4);
};
