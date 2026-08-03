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

    // 레벨 4단계. 값은 저장 그대로, 표시 라벨만 언어별로 다르다(i18n.js):
    //   KO 입문/중급/상급/선출·대학팀급  ·  EN B/BB/A/AA·Open (USAV 성인부 관행)
    // 외국인은 USAV 문자 등급을 이미 알고, 한국인은 모른다 — 그래서 값 하나에 라벨 둘.
    // USAV는 B/BB/A/AA/Open 5단계지만 서울 픽업 규모에선 AA·Open이 사실상 한 칸이라 접었다.
    window.PICKUP_LEVELS = ['beginner', 'intermediate', 'advanced', 'elite'];

    // 레벨 매칭. 외국인에게 크루를 소개할 때 "나 초보인데 가도 되나"가 핵심 질문이라
    // 지역 다음으로 중요한 필터다.
    //
    // 가치필터 #1(랭킹·별점 금지)과 충돌하지 않는다 — 이건 크루의 우열이 아니라
    // "나랑 맞나"(적합·소속) 정보다. PHILOSOPHY 후기 원칙이 허용하는 성격 태그 쪽.
    //
    // 'any'(레벨무관) 크루는 어떤 레벨 필터에도 걸린다 — 누구나 환영이라는 뜻이므로
    // 초보가 '입문'으로 걸러도 후보에서 빠지면 안 된다.
    window.pickupLevelMatch = function (spot, level) {
        if (!level) return true;
        if (!spot) return false;
        var l = spot.level || 'any';
        return l === 'any' || l === level;
    };

    // 목록 필터. opts = { region, level, englishOnly, keyword }
    window.filterPickupSpots = function (spots, opts) {
        opts = opts || {};
        var kw = (opts.keyword || '').trim().toLowerCase();
        var region = opts.region || '';
        var level = opts.level || '';
        var englishOnly = !!opts.englishOnly;

        return (spots || []).filter(function (g) {
            if (englishOnly && !g.english_ok) return false;
            if (!window.pickupRegionMatch(g, region)) return false;
            if (!window.pickupLevelMatch(g, level)) return false;
            if (!kw) return true;
            return (g.title || '').toLowerCase().indexOf(kw) !== -1
                || (g.venue_name || '').toLowerCase().indexOf(kw) !== -1
                || (g.address || '').toLowerCase().indexOf(kw) !== -1
                || (g.insta || '').toLowerCase().indexOf(kw) !== -1;
        });
    };
})();
