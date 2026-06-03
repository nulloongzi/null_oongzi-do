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

        // 도시락(북마크) — 밥/도시락/식단 메타포 유지
        lb_title: { ko: '도시락 🍱', en: 'Lunchbox 🍱' },
        lb_add: { ko: '🍙 직접추가', en: '🍙 Add team' },
        lb_edit: { ko: '🍽 편집', en: '🍽 Edit' },
        lb_diet: { ko: '📅 식단표 (스케줄 확인)', en: '📅 Weekly menu' },

        // 로그인 / 프로필
        login_google: { ko: '구글로 간편 로그인', en: 'Sign in with Google' },
        or: { ko: '또는', en: 'or' },
        email_ph: { ko: '이메일 입력', en: 'Email' },
        pw_ph: { ko: '비밀번호 (6자리 이상)', en: 'Password (6+ characters)' },
        login: { ko: '로그인', en: 'Log in' },
        signup: { ko: '회원가입', en: 'Sign up' },
        no_saved_team: { ko: '찜한 팀이 없어요', en: 'Your lunchbox is empty 🍱' },
        joined: { ko: '가입일: ', en: 'Joined: ' },
        no_data: { ko: '데이터 없음', en: 'No data' },
        guest: { ko: '손님', en: 'Guest' },
        logout: { ko: '로그아웃', en: 'Log out' },
        share_wrap: { ko: '🎁 포장하기', en: '🎁 Wrap it up' },

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
        reg_insta_ph: { ko: '예: gvt__official', en: 'e.g. gvt__official' },
        reg_link_label: { ko: '가입/문의 링크 (선택)', en: 'Join/contact link (optional)' },
        reg_link_ph: { ko: '예: https://open.kakao.com/o/...', en: 'e.g. https://open.kakao.com/o/...' },
        reg_submit: { ko: '등록하기', en: 'Register' },

        // 지도 위치 선택
        mp_confirm: { ko: '이 위치로 주소 설정', en: 'Set address to this spot' },
        mp_cancel: { ko: '취소', en: 'Cancel' },

        // ── 동적(JS) 문자열 ──
        // 도시락 식단표 슬롯 / 동작 — 밥·국·반찬 메타포 유지
        lb_slot_rice: { ko: '밥을<br>담아주세요🍚', en: 'Add rice 🍚' },
        lb_slot_soup: { ko: '국을<br>담아주세요🥘', en: 'Add soup 🥘' },
        lb_slot_side1: { ko: '반찬1🍳', en: 'Side 1 🍳' },
        lb_slot_side2: { ko: '반찬2🥗', en: 'Side 2 🥗' },
        lb_slot_side3: { ko: '반찬3🥢', en: 'Side 3 🥢' },
        lb_done: { ko: '✅ 완료', en: '✅ Done' },
        lb_diet_collapse: { ko: '📅 식단표 접기', en: '📅 Hide weekly menu' },
        lb_add_prompt: { ko: '🍙 추가할 팀/일정 이름을 입력하세요', en: '🍙 Name the team or session to pack' },
        lb_add_default: { ko: '개인운동', en: 'Solo practice' },
        lb_time_prompt: { ko: '시간을 입력하세요 (예: 월 19:00~21:00)', en: 'Enter the time (e.g. 월 19:00~21:00)' },
        lb_time_default: { ko: '월 19:00~21:00', en: '월 19:00~21:00' },
        lb_custom_target: { ko: '나만의 메뉴', en: 'My own menu' },
        lb_custom_addr: { ko: '사용자 추가', en: 'Added by you' },
        lb_already: { ko: '이미 도시락에 담긴 팀입니다! 🍱', en: 'This team is already in your lunchbox! 🍱' },
        lb_full: { ko: '도시락이 꽉 찼습니다! (최대 5개) 🍱\n기존 팀을 빼고 담아주세요.', en: 'Your lunchbox is full! (5 max) 🍱\nTake one out to pack a new team.' },
        lb_added_custom: { ko: '나만의 메뉴가 추가되었습니다! 🍙', en: 'Packed into your menu! 🍙' },
        lb_added_team: { ko: '도시락에 팀을 담았습니다! 🍱', en: 'Packed into your lunchbox! 🍱' },
        lb_bookmark_fail: { ko: '찜하기 실패: ', en: 'Couldn\'t pack it: ' },
        lb_deleted_team: { ko: '삭제된 팀', en: 'Deleted team' },
        lb_remove_confirm: { ko: '이 반찬을 도시락에서 뺄까요?', en: 'Take this dish out of your lunchbox?' },

        // 공유
        sh_pick_shape: { ko: '📸 저장할 모양을 선택해주세요!\n\n[확인] = 🍱 피드용 (네임카드+도시락+식단표)\n[취소] = 📱 스토리용 (네임카드+도시락)', en: '📸 Choose a layout to save!\n\n[OK] = 🍱 Feed (name card + lunchbox + meal plan)\n[Cancel] = 📱 Story (name card + lunchbox)' },
        sh_login_required: { ko: '로그인이 필요합니다.', en: 'Please log in first.' },
        sh_weekly_plan: { ko: '📅 주간 식단표', en: '📅 Weekly menu' },
        sh_error: { ko: '오류 발생: ', en: 'Error: ' },
        sh_run_fail: { ko: '기능 실행 실패: ', en: 'Failed to run: ' },
        no_image: { ko: '저장할 이미지가 없습니다.', en: 'No image to save.' },
        link_copied: { ko: '링크가 복사되었습니다! 📋', en: 'Link copied! 📋' },
        sh_view_club_text: { ko: '누룽지도에서 동호회 보기', en: 'View this club on Nurungjido' },
        sh_club_fallback: { ko: '배구 동호회', en: 'Volleyball club' },
        sh_view_on: { ko: '누룽지도에서 보기', en: 'View on Nurungjido' },
        sh_view_club_btn: { ko: '동호회 보기', en: 'View club' },

        // 주소 복사
        addr_copied: { ko: '주소가 복사되었습니다! 📋', en: 'Address copied! 📋' },

        // 팀 등록
        reg_title_urgent: { ko: '급구/제보하기', en: 'Post an urgent call' },
        reg_edit_title: { ko: '팀 정보 수정', en: 'Edit team info' },
        reg_edit_submit: { ko: '수정하기', en: 'Save changes' },
        reg_no_edit_perm: { ko: '수정 권한이 없습니다.', en: 'You don\'t have permission to edit.' },
        reg_owner_hint: { ko: '현재 소유자: {nick} (비우면 변경 안 됨)', en: 'Current owner: {nick} (leave blank to keep)' },
        reg_owner_none: { ko: '소유자 없음 (레거시) · 이메일 입력하여 지정', en: 'No owner (legacy) · enter an email to assign' },
        reg_map_loc: { ko: '지도에서 선택된 위치', en: 'Location picked on map' },
        reg_login_required: { ko: '팀을 등록하려면 먼저 로그인해주세요.', en: 'Please log in to register a team.' },
        reg_required: { ko: '팀 이름, 대상, 주소는 필수 입력값입니다.', en: 'Team name, who it\'s for, and address are required.' },
        reg_name_max: { ko: '팀 이름은 60자 이하로 입력해주세요.', en: 'Team name must be 60 characters or fewer.' },
        reg_target_max: { ko: '대상은 30자 이하로 입력해주세요.', en: 'Target must be 30 characters or fewer.' },
        reg_addr_max: { ko: '주소는 200자 이하로 입력해주세요.', en: 'Address must be 200 characters or fewer.' },
        reg_price_max: { ko: '회비 설명은 100자 이하로 입력해주세요.', en: 'Fee description must be 100 characters or fewer.' },
        reg_insta_invalid: { ko: '인스타그램 핸들은 영문/숫자/언더스코어/점 1~30자만 가능합니다. (@ 제외)', en: 'Instagram handle allows only letters/numbers/underscore/dot, 1–30 chars. (no @)' },
        reg_link_invalid: { ko: '홈페이지 링크는 http:// 또는 https://로 시작해야 합니다.', en: 'Website link must start with http:// or https://.' },
        processing: { ko: '처리중...', en: 'Processing...' },
        reg_addr_notfound: { ko: '주소를 찾을 수 없거나 올바르지 않습니다. 정확히 입력해주세요.', en: 'Address not found or invalid. Please enter it accurately.' },
        reg_cf_uninit: { ko: 'Cloud Functions가 초기화되지 않아 소유자 재할당을 진행할 수 없습니다.', en: 'Cloud Functions is not initialized, so owner reassignment cannot proceed.' },
        reg_owner_fail: { ko: '소유자 재할당 실패', en: 'Owner reassignment failed' },
        reg_updated: { ko: '팀 정보가 수정되었습니다!', en: 'Team info updated!' },
        reg_registered: { ko: '팀 정보가 성공적으로 등록되었습니다!', en: 'Team registered successfully!' },
        reg_error: { ko: '등록 중 오류가 발생했습니다: ', en: 'An error occurred during registration: ' },

        // 로그인/인증(auth)
        au_login_fail: { ko: '로그인 실패: ', en: 'Login failed: ' },
        au_enter_info: { ko: '정보를 입력해주세요.', en: 'Please enter your information.' },
        au_logout_confirm: { ko: '로그아웃 하시겠습니까?', en: 'Log out?' },
        au_welcome: { ko: '환영합니다! [{name}]님이 되셨습니다!', en: 'Welcome! Your rice name is [{name}] 🍚' },

        // 인증 신청(verification)
        vf_title: { ko: '인증 신청', en: 'Request verification' },
        vf_desc: { ko: '팀 단체사진 또는 대회 참가 사진을 첨부해주세요.<br>관리자 확인 후 인증 배지가 부여됩니다.', en: 'Attach a team group photo or a tournament photo.<br>A badge is granted after admin review.' },
        vf_photo_label: { ko: '인증 사진 (필수)', en: 'Verification photo (required)' },
        vf_submit: { ko: '인증 신청하기', en: 'Submit request' },
        vf_login_required: { ko: '인증 신청은 로그인 후 가능합니다.', en: 'Please log in to request verification.' },
        vf_photo_required: { ko: '인증 사진을 첨부해주세요.', en: 'Please attach a verification photo.' },
        vf_done: { ko: '인증 신청이 완료되었습니다!\n관리자 확인 후 인증 배지가 부여됩니다.', en: 'Verification request submitted!\nA badge is granted after admin review.' },
        vf_error: { ko: '인증 신청 중 오류가 발생했습니다: ', en: 'An error occurred during the request: ' },
        vf_apply_btn: { ko: '✅ 인증 신청', en: '✅ Get verified' },
        vf_pending: { ko: '⏳ 인증 심사 중입니다.<br><span style="font-size:12px;color:#666;">관리자 확인 후 인증 배지가 부여됩니다.</span>', en: '⏳ Verification under review.<br><span style="font-size:12px;color:#666;">A badge is granted after admin review.</span>' },
        vf_no_reason: { ko: '사유가 기재되지 않았습니다.', en: 'No reason was provided.' },
        vf_rejected: { ko: '❌ 인증이 거절되었습니다', en: '❌ Verification rejected' },
        vf_reason: { ko: '사유: ', en: 'Reason: ' },
        vf_reapply: { ko: '🔄 인증 재신청', en: '🔄 Re-apply' },

        // 클럽 상세 - 관리/급구/삭제
        cd_edit: { ko: '✏ 팀 정보 수정', en: '✏ Edit team' },
        cd_delete: { ko: '🗑 팀 삭제', en: '🗑 Delete team' },
        cd_urgent_off: { ko: '🔥 급구 내리기', en: '🔥 End urgent call' },
        cd_urgent_on: { ko: '🔥 급구 올리기', en: '🔥 Post urgent call' },
        cd_no_delete_perm: { ko: '삭제 권한이 없습니다.', en: 'You don\'t have permission to delete.' },
        role_admin: { ko: '관리자', en: 'admin' },
        role_owner: { ko: '소유자', en: 'owner' },
        cd_delete_confirm: { ko: '[{name}]\n정말 이 팀을 삭제하시겠습니까?\n\n(삭제 후 복구 불가 · {role} 권한)', en: '[{name}]\nReally delete this team?\n\n(Cannot be undone · {role} privilege)' },
        cd_deleted: { ko: '팀이 삭제되었습니다.', en: 'Team deleted.' },
        cd_delete_error: { ko: '삭제 중 오류가 발생했습니다: ', en: 'An error occurred while deleting: ' },
        cd_no_urgent_perm: { ko: '급구 토글 권한이 없습니다.\n팀 등록자(소유자) 또는 관리자만 변경할 수 있습니다.', en: 'No permission to toggle urgent.\nOnly the owner or an admin can change this.' },
        cd_urgent_prompt: { ko: '급구 메시지를 입력해주세요! (예: 라이트 1명 급구)', en: 'Enter an urgent message! (e.g. Need 1 right-side hitter)' },
        cd_urgent_default: { ko: '센터 1명 급구합니다!', en: 'Urgently looking for 1 center!' },
        cd_urgent_max: { ko: '급구 메시지는 200자 이하로 입력해주세요.', en: 'Urgent message must be 200 characters or fewer.' },
        cd_urgent_posted: { ko: '🔥 급구가 등록되었습니다!', en: '🔥 Urgent call posted!' },
        cd_urgent_closed: { ko: '급구가 마감되었습니다.', en: 'Urgent call closed.' },
        cd_update_error: { ko: '업데이트 중 오류가 발생했습니다.', en: 'An error occurred during the update.' }
    };

    // "{name}" 같은 토큰을 치환하는 헬퍼. window.t(key)와 함께 사용.
    window.tf = function (key, params) {
        var s = window.t(key);
        if (params) {
            Object.keys(params).forEach(function (p) {
                s = s.split('{' + p + '}').join(params[p]);
            });
        }
        return s;
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
