// pickup-filter.js
// 픽업 스팟 필터 순수 로직 (지역·English OK·키워드). DOM/카카오 SDK 의존 없음 → 단위 테스트 가능.
// 앱의 lib/services/club_filter.dart 와 같은 역할·같은 지역 묶음 규칙을 쓴다.
// Depends on: 없음 (가장 먼저 로드해도 됨)

(function () {
    // 광역 묶음 — 동호회 필터(filters.js / club_filter.dart)와 동일 규칙 유지.
    var REGION_GROUPS = {
        '충청': ['충남', '충북', '대전', '세종'],
        '전라': ['전남', '전북', '광주'],
        '경상': ['경남', '경북', '대구', '부산', '울산']
    };

    window.PICKUP_REGIONS = ['서울', '경기', '인천', '강원', '충청', '전라', '경상', '제주'];

    // 지역 매칭. `region` 칩 값이 있으면 그걸 쓰고, 없으면 주소 prefix 로 폴백한다.
    //
    // 왜 필드를 따로 두는가: 좌표를 선택으로 풀면 주소가 자유 텍스트로 남아 표기가 흔들리고
    // ("서울시 마포구" / "Mapo, Seoul"), 특히 외국인이 직접 등록하면 영문 주소를 써서
    // prefix 매칭이 깨진다. 폴백은 region 칩 도입 이전 문서 호환용.
    window.pickupRegionMatch = function (spot, region) {
        if (!region) return true;
        if (!spot) return false;

        var stored = spot.region || '';
        if (stored) {
            if (stored === region) return true;
            return (REGION_GROUPS[region] || []).indexOf(stored) !== -1;
        }

        var addr = spot.address || '';
        if (!addr) return false; // 지역 미상 → 지역 필터가 걸리면 제외
        var prefixes = REGION_GROUPS[region] || [region];
        for (var i = 0; i < prefixes.length; i++) {
            if (addr.indexOf(prefixes[i]) === 0) return true;
        }
        return false;
    };

    // 목록 필터. opts = { region, englishOnly, keyword }
    window.filterPickupSpots = function (spots, opts) {
        opts = opts || {};
        var kw = (opts.keyword || '').trim().toLowerCase();
        var region = opts.region || '';
        var englishOnly = !!opts.englishOnly;

        return (spots || []).filter(function (g) {
            if (englishOnly && !g.english_ok) return false;
            if (!window.pickupRegionMatch(g, region)) return false;
            if (!kw) return true;
            return (g.title || '').toLowerCase().indexOf(kw) !== -1
                || (g.venue_name || '').toLowerCase().indexOf(kw) !== -1
                || (g.address || '').toLowerCase().indexOf(kw) !== -1
                || (g.insta || '').toLowerCase().indexOf(kw) !== -1;
        });
    };
})();
