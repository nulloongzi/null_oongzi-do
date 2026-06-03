// i18n.js
// 경량 다국어 엔진 (KO/EN 수동 토글). classic script, window.* 전역.
// - window.t(key): 현재 언어의 문자열 반환 (동적 JS 문자열용)
// - window.applyI18n(): DOM의 [data-i18n] / [data-i18n-placeholder] / [data-i18n-html] 일괄 적용
// - window.setLang(lang) / window.toggleLang(): 언어 전환 + localStorage 저장 + 재적용
// - 'nurungji:langchange' 이벤트를 document에 dispatch → 다른 모듈이 동적 UI 재렌더링
// Depends on: 없음 (가장 먼저 로드)

(function () {
    var LS_LANG_KEY = 'nulloong_lang';
    var SUPPORTED = ['ko', 'en'];

    // 외국인 타겟: 정적 UI 크롬(chrome) + 핵심 발견 흐름 문자열.
    // 클럽 데이터(이름/주소/일정 텍스트 등)는 한국어 원본이라 번역 대상이 아니다.
    var DICT = {
        // 검색
        search_ph: { ko: '팀명, 지역으로 검색...', en: 'Search by team or area...' },

        // 도시락(북마크)
        lb_title: { ko: '도시락 🍱', en: 'Lunchbox 🍱' },
        lb_add: { ko: '🍙 직접추가', en: '🍙 Add team' },
        lb_edit: { ko: '🍽 편집', en: '🍽 Edit' },
        lb_diet: { ko: '📅 식단표 (스케줄 확인)', en: '📅 Meal plan (schedule)' },

        // 로그인 / 프로필
        login_google: { ko: '구글로 간편 로그인', en: 'Sign in with Google' },
        or: { ko: '또는', en: 'or' },
        email_ph: { ko: '이메일 입력', en: 'Email' },
        pw_ph: { ko: '비밀번호 (6자리 이상)', en: 'Password (6+ characters)' },
        login: { ko: '로그인', en: 'Log in' },
        signup: { ko: '회원가입', en: 'Sign up' },
        no_saved_team: { ko: '찜한 팀이 없어요', en: 'No saved teams yet' },
        joined: { ko: '가입일: ', en: 'Joined: ' },
        no_data: { ko: '데이터 없음', en: 'No data' },
        guest: { ko: '손님', en: 'Guest' },
        logout: { ko: '로그아웃', en: 'Log out' },
        share_wrap: { ko: '🎁 포장하기', en: '🎁 Share my card' },

        // 필터 시트
        filter_title: { ko: '검색 조건 설정', en: 'Filters' },
        region_label: { ko: '📍 지역 (중복 선택 가능)', en: '📍 Region (multi-select)' },
        r_seoul: { ko: '서울', en: 'Seoul' },
        r_gyeonggi: { ko: '경기', en: 'Gyeonggi' },
        r_incheon: { ko: '인천', en: 'Incheon' },
        r_gangwon: { ko: '강원', en: 'Gangwon' },
        r_chungcheong: { ko: '충청', en: 'Chungcheong' },
        r_jeolla: { ko: '전라', en: 'Jeolla' },
        r_gyeongsang: { ko: '경상', en: 'Gyeongsang' },
        r_jeju: { ko: '제주', en: 'Jeju' },
        day_label: { ko: '📅 요일', en: '📅 Day' },
        d_mon: { ko: '월', en: 'Mon' },
        d_tue: { ko: '화', en: 'Tue' },
        d_wed: { ko: '수', en: 'Wed' },
        d_thu: { ko: '목', en: 'Thu' },
        d_fri: { ko: '금', en: 'Fri' },
        d_sat: { ko: '토', en: 'Sat' },
        d_sun: { ko: '일', en: 'Sun' },
        target_label: { ko: '🏐 대상 및 특징', en: '🏐 Who & features' },
        t_adult: { ko: '성인', en: 'Adults' },
        t_college: { ko: '대학생', en: 'College' },
        t_youth: { ko: '청소년', en: 'Youth' },
        t_women: { ko: '여성전용', en: 'Women only' },
        t_men: { ko: '남성전용', en: 'Men only' },
        t_expro: { ko: '선출가능', en: 'Ex-players OK' },
        t_6s: { ko: '6인제', en: '6s (6-a-side)' },
        reset: { ko: '초기화', en: 'Reset' },
        apply: { ko: '적용하기', en: 'Apply' },

        // 바텀시트 (클럽 상세)
        sheet_title_ph: { ko: '팀 이름', en: 'Team name' },
        btn_copy: { ko: '📍 주소 복사', en: '📍 Copy address' },
        btn_way: { ko: '🚀 길찾기', en: '🚀 Directions' },
        btn_share: { ko: '🔗 공유', en: '🔗 Share' },
        expand_hint: { ko: '▴ 위로 올려서 상세 정보 보기', en: '▴ Pull up for details' },
        collapse_hint: { ko: '▾ 아래로 내려서 요약 보기', en: '▾ Pull down for summary' },
        home_tag: { ko: '🏠 홈페이지', en: '🏠 Website' },
        schedule: { ko: '일정', en: 'Schedule' },
        no_info: { ko: '정보없음', en: 'No info' },
        no_fee: { ko: '회비 정보 없음', en: 'No fee info' },
        day_suffix: { ko: '요일', en: '' },

        // 미리보기(공유 캡처)
        preview_close: { ko: '닫기', en: 'Close' },
        preview_save: { ko: '💾 저장하기', en: '💾 Save' },

        // 팀 등록 모달
        reg_title: { ko: '팀 등록하기', en: 'Register a team' },
        reg_tip: {
            ko: '<strong>tip:</strong> 요일별로 체육관 위치가 다른 경우, 정확한 핀 표시를 위해 <strong>장소별로 각각 등록</strong> 부탁드립니다!',
            en: '<strong>Tip:</strong> If your gym location differs by day, please <strong>register each location separately</strong> so the map pins are accurate!'
        },
        reg_name_label: { ko: '팀 이름 (필수)', en: 'Team name (required)' },
        reg_name_ph: { ko: '예: GVT 배구클럽', en: 'e.g. GVT Volleyball Club' },
        reg_target_label: { ko: '대상 (필수)', en: 'Who it\'s for (required)' },
        reg_target_ph: { ko: '예: 성인, 대학생, 청소년', en: 'e.g. Adults, College, Youth' },
        reg_addr_label: { ko: '주소 (필수) - 실제 체육관 주소', en: 'Address (required) — actual gym address' },
        reg_addr_ph: { ko: '예: 서울 송파구 올림픽로 424', en: 'e.g. 424 Olympic-ro, Songpa-gu, Seoul' },
        reg_addr_find: { ko: '지도에서 찾기', en: 'Find on map' },
        reg_sched_label: { ko: '운동 시간 (스케줄)', en: 'Practice times (schedule)' },
        reg_add: { ko: '+ 추가', en: '+ Add' },
        reg_price_label: { ko: '회비 및 게스트비', en: 'Fees & guest fee' },
        reg_price_ph: { ko: '예: 월 3만원 / 게스트 1만원', en: 'e.g. ₩30,000/mo / Guest ₩10,000' },
        reg_insta_label: { ko: '인스타그램 핸들 (선택)', en: 'Instagram handle (optional)' },
        reg_link_label: { ko: '가입/문의 링크 (선택)', en: 'Join/contact link (optional)' },
        reg_submit: { ko: '등록하기', en: 'Register' },

        // 지도 위치 선택
        mp_confirm: { ko: '이 위치로 주소 설정', en: 'Set address to this spot' },
        mp_cancel: { ko: '취소', en: 'Cancel' }
    };

    function readLang() {
        var saved = null;
        try { saved = localStorage.getItem(LS_LANG_KEY); } catch (e) { saved = null; }
        if (SUPPORTED.indexOf(saved) !== -1) return saved;
        return 'ko';
    }

    window.currentLang = readLang();

    // 동적 JS 문자열용. key가 사전에 없으면 fallback(또는 key) 반환.
    window.t = function (key, fallback) {
        var entry = DICT[key];
        if (entry && entry[window.currentLang] != null) return entry[window.currentLang];
        if (fallback != null) return fallback;
        return key;
    };

    // 한글 요일 글자 → 현재 언어 표기. (스케줄 파싱 키는 한글 유지, 표시만 변환)
    var DAY_KEY = { '월': 'd_mon', '화': 'd_tue', '수': 'd_wed', '목': 'd_thu', '금': 'd_fri', '토': 'd_sat', '일': 'd_sun' };
    window.i18nDay = function (kchar) {
        var k = DAY_KEY[kchar];
        return k ? window.t(k) : kchar;
    };

    window.applyI18n = function () {
        var i, els;

        els = document.querySelectorAll('[data-i18n]');
        for (i = 0; i < els.length; i++) {
            els[i].textContent = window.t(els[i].getAttribute('data-i18n'));
        }

        els = document.querySelectorAll('[data-i18n-placeholder]');
        for (i = 0; i < els.length; i++) {
            els[i].setAttribute('placeholder', window.t(els[i].getAttribute('data-i18n-placeholder')));
        }

        // 통제된 번역 문자열만 사용(사용자 입력 없음) → innerHTML 허용
        els = document.querySelectorAll('[data-i18n-html]');
        for (i = 0; i < els.length; i++) {
            els[i].innerHTML = window.t(els[i].getAttribute('data-i18n-html'));
        }

        // 토글 버튼 라벨: 전환할 대상 언어를 보여준다.
        var label = document.getElementById('langToggleLabel');
        if (label) label.textContent = window.currentLang === 'ko' ? 'EN' : '한';
    };

    window.setLang = function (lang) {
        if (SUPPORTED.indexOf(lang) === -1) return;
        window.currentLang = lang;
        try { localStorage.setItem(LS_LANG_KEY, lang); } catch (e) { /* ignore */ }

        document.documentElement.setAttribute('lang', lang);
        document.body.classList.toggle('lang-en', lang === 'en');

        window.applyI18n();

        // 동적 UI(바텀시트 등) 재렌더링 신호
        document.dispatchEvent(new CustomEvent('nurungji:langchange', { detail: { lang: lang } }));
    };

    window.toggleLang = function () {
        window.setLang(window.currentLang === 'ko' ? 'en' : 'ko');
    };

    // 초기 적용 (이 스크립트는 body 하단에서 로드되므로 UI DOM은 이미 존재)
    document.documentElement.setAttribute('lang', window.currentLang);
    if (document.body) document.body.classList.toggle('lang-en', window.currentLang === 'en');
    window.applyI18n();
})();
