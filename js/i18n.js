// i18n.js
// 경량 다국어 엔진 (KO/EN 수동 토글). classic script, window.* 전역.
// - window.t(key): 현재 언어의 문자열 반환 (동적 JS 문자열용)
// - window.applyI18n(): DOM의 [data-i18n] / [data-i18n-placeholder] / [data-i18n-html] / [data-i18n-aria] 일괄 적용
// - window.setLang(lang) / window.toggleLang(): 언어 전환 + localStorage 저장 + 재적용
// - 'nurungji:langchange' 이벤트를 document에 dispatch → 다른 모듈이 동적 UI 재렌더링
// Depends on: 없음 (가장 먼저 로드)

(function () {
    var LS_LANG_KEY = 'nulloong_lang';
    var SUPPORTED = ['ko', 'en'];

    // 외국인 타겟: 정적 UI 크롬(chrome) + 핵심 발견 흐름 문자열.
    // 클럽 데이터(이름/주소/일정 텍스트 등)는 한국어 원본이라 번역 대상이 아니다.
    var DICT = {
        // 브랜드명 (영어는 로마자 표기)
        brand: { ko: '누룽지도', en: 'Nulloongzi-do' },

        // 앱 설치 유도 배너 (웹→앱 유입 깔때기)
        app_banner_title: { ko: '앱에서 더 부드럽게 🏐', en: 'Smoother in the app 🏐' },
        app_banner_sub: { ko: '누룽지도 앱으로 더 빠르게 배구 팀 찾기', en: 'Find volleyball teams faster in the app' },
        app_banner_sub_deeplink: { ko: '이 팀을 앱에서 열어보세요', en: 'Open this in the app' },
        app_banner_cta: { ko: '앱 받기', en: 'Get app' },
        app_banner_dismiss: { ko: '배너 닫기', en: 'Dismiss banner' },

        // 지도 위 버튼 이름(aria-label·툴팁) — 이모지만 보이는 버튼. 앱 strings.dart 와 같은 키
        fab_lunchbox: { ko: '도시락', en: 'Lunchbox' },
        fab_profile: { ko: '프로필', en: 'Profile' },
        fab_register: { ko: '팀 등록하기', en: 'Register a team' },
        fab_pickup_create: { ko: '픽업 등록', en: 'Add a pickup game' },
        fab_my_location: { ko: '내 위치', en: 'My location' },
        sheet_close: { ko: '닫기', en: 'Close' }, // 시트 손잡이(화면 낭독기·키보드용 이름)
        geo_unavailable: { ko: '이 기기에선 위치를 쓸 수 없어요', en: "Location isn't available on this device." },
        pk_delete_error: { ko: '게임을 지우지 못했어요. 잠시 후 다시 해 주세요.', en: "Couldn't delete the game. Please try again in a moment." },
        // 입력 칸 옆 오류(js/field-error.js)
        reg_err_name: { ko: '팀 이름을 적어 주세요', en: 'Enter the team name.' },
        reg_err_target: { ko: '누구를 모집하는지 골라 주세요', en: 'Pick who the team is for.' },
        reg_err_addr: { ko: '체육관 주소를 적어 주세요', en: 'Enter the gym address.' },
        au_err_email_empty: { ko: '이메일을 적어 주세요', en: 'Enter your email.' },
        au_err_pw_empty: { ko: '비밀번호를 적어 주세요', en: 'Enter your password.' },
        au_err_email_invalid: { ko: '이메일 주소 형식을 확인해 주세요', en: 'Check the email address format.' },
        au_err_wrong: { ko: '이메일이나 비밀번호가 맞지 않아요', en: "The email or password doesn't match." },
        au_err_in_use: { ko: '이미 가입한 이메일이에요. 로그인을 눌러 주세요', en: 'This email already has an account. Tap Log in instead.' },
        au_err_weak_pw: { ko: '비밀번호는 6자 이상이어야 해요', en: 'Passwords need at least 6 characters.' },
        au_err_too_many: { ko: '여러 번 틀려서 잠시 막혔어요. 조금 뒤에 다시 해 주세요', en: 'Too many tries. Please wait a bit and try again.' },
        au_err_network: { ko: '인터넷 연결을 확인해 주세요', en: 'Check your internet connection.' },
        // 공용 팝업(js/dialog.js) — 버튼엔 누르면 일어나는 일을 그대로
        dlg_cancel: { ko: '취소', en: 'Cancel' },
        dlg_close: { ko: '닫기', en: 'Close' },
        au_logout_btn: { ko: '로그아웃', en: 'Log out' },
        claim_send_btn: { ko: '인증 메일 받기', en: 'Send verification email' },
        claim_later: { ko: '나중에', en: 'Later' },
        cd_delete_btn: { ko: '팀 지우기', en: 'Delete team' },
        cd_urgent_title: { ko: '🔥 급구 올리기', en: '🔥 Post an urgent call' },
        cd_urgent_btn: { ko: '급구 올리기', en: 'Post' },
        cd_urgent_empty: { ko: '급구 메시지를 적어 주세요', en: 'Write an urgent message.' },
        lb_add_title: { ko: '🍙 직접 담기', en: '🍙 Pack your own' },
        lb_add_name_label: { ko: '팀·일정 이름', en: 'Team or session name' },
        lb_add_time_label: { ko: '시간', en: 'Time' },
        lb_add_btn: { ko: '도시락에 담기', en: 'Pack it' },
        lb_add_name_empty: { ko: '이름을 적어 주세요', en: 'Enter a name.' },
        lb_add_time_empty: { ko: '시간을 적어 주세요 (예: 월 19:00~21:00)', en: 'Enter a time (e.g. 월 19:00~21:00).' },
        lb_remove_btn: { ko: '빼기', en: 'Take out' },
        pk_delete_btn: { ko: '게임 지우기', en: 'Delete game' },
        ad_leave_btn: { ko: '관리자에서 빠지기', en: 'Leave as admin' },
        copy_manual_title: { ko: '링크를 직접 복사해 주세요', en: 'Copy the link' },
        copy_manual_body: { ko: '자동으로 복사하지 못했어요. 아래 링크를 길게 눌러 복사해 주세요.', en: "Couldn't copy automatically. Press and hold the link below to copy it." },
        nick_title: { ko: '이름 바꾸기', en: 'Change your name' },
        nick_btn: { ko: '바꾸기', en: 'Change' },
        nick_empty: { ko: '새 이름을 적어 주세요', en: 'Enter a new name.' },
        nick_hyphen: { ko: "이름에 하이픈(-)은 쓸 수 없어요. 하이픈은 '밥아저씨'가 지어 준 이름에만 들어가요", en: "Names can't include a hyphen (-). Only auto-generated rice names have one." },
        nick_dup: { ko: '이미 누가 쓰고 있는 이름이에요', en: 'Someone is already using that name.' },
        nick_changed: { ko: '이름을 바꿨어요', en: 'Name updated' },
        nick_change_error: { ko: '이름을 바꾸지 못했어요. 잠시 후 다시 해 주세요.', en: "Couldn't change your name. Please try again in a moment." },

        // 검색
        search_ph: { ko: '팀명, 지역으로 검색...', en: 'Search by team or area...' },

        // 도시락(북마크) — 밥/도시락/식단 메타포 유지
        lb_title: { ko: '도시락 🍱', en: 'Lunchbox 🍱' },
        lb_add: { ko: '🍙 직접추가', en: '🍙 Add team' },
        lb_edit: { ko: '🍽 편집', en: '🍽 Edit' },
        lb_diet: { ko: '📅 식단표 (스케줄 확인)', en: '📅 Weekly menu' },

        // 로그인 / 프로필
        login_google: { ko: '구글로 간편 로그인', en: 'Sign in with Google' },
        login_kakao: { ko: '카카오로 로그인', en: 'Sign in with Kakao' },
        login_naver: { ko: '네이버로 로그인', en: 'Sign in with Naver' },
        login_last_used: { ko: '지난번에 사용', en: 'Last used' },
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
        t_any: { ko: '무관', en: 'Anyone' },
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
            ko: '<strong>tip:</strong> 요일마다 체육관이 다르면 <strong>장소마다 따로 등록</strong>해 주세요. 그래야 지도 핀이 정확해요.',
            en: '<strong>Tip:</strong> If your gym changes by day, <strong>register each location separately</strong> so the map pins are accurate.'
        },
        reg_name_label: { ko: '팀 이름 (필수)', en: 'Team name (required)' },
        reg_name_ph: { ko: '예: GVT 배구클럽', en: 'e.g. GVT Volleyball Club' },
        reg_target_label: { ko: '대상 (필수)', en: 'Who it\'s for (required)' },
        reg_target_ph: { ko: '예: 성인, 대학생, 청소년', en: 'e.g. Adults, College, Youth' },
        reg_target_note_ph: { ko: '기타 조건 (예: 구력 1년 이상) — 선택', en: 'Other notes (e.g. 1+ yr experience) — optional' },
        reg_addr_label: { ko: '주소 (필수) - 실제 체육관 주소', en: 'Address (required) — actual gym address' },
        reg_addr_ph: { ko: '예: 서울 송파구 올림픽로 424', en: 'e.g. 424 Olympic-ro, Songpa-gu, Seoul' },
        reg_addr_find: { ko: '지도에서 찾기', en: 'Find on map' },
        reg_sched_label: { ko: '운동 시간 (스케줄)', en: 'Practice times (schedule)' },
        reg_sched_add: { ko: '＋ 시간대 추가', en: '＋ Add time slot' },
        reg_price_label: { ko: '회비 및 게스트비', en: 'Fees & guest fee' },
        reg_price_ph: { ko: '예: 월 3만원 / 게스트 1만원', en: 'e.g. ₩30,000/mo / Guest ₩10,000' },
        reg_insta_label: { ko: '인스타그램 핸들 (선택)', en: 'Instagram handle (optional)' },
        reg_insta_ph: { ko: '예: gvt__official', en: 'e.g. gvt__official' },
        reg_reel_label: { ko: '인스타 릴스/게시물 링크 (선택)', en: 'Instagram reel/post link (optional)' },
        reg_reel_ph: { ko: '한 줄에 하나씩: https://www.instagram.com/reel/...', en: 'One per line: https://www.instagram.com/reel/...' },
        reels_more_label: { ko: '릴스 더 보기', en: 'More reels' },
        reels_hide: { ko: '접기', en: 'Hide' },
        reels_too_many: { ko: '릴스는 최대 {max}개까지 올릴 수 있어요.', en: 'You can add up to {max} reels.' },
        reels_hidden_notice: { ko: '운영자가 이 릴스를 숨겼어요. 문의는 누룽지도 운영팀으로 해 주세요.', en: 'Reels were hidden by the moderators. Please contact the Nulloongzido team.' },
        insta_reel_title: { ko: '📷 인스타 릴스 · 게시물', en: '📷 Instagram reel · post' },
        insta_reel_open: { ko: '탭하면 인스타그램에서 봐요', en: 'Tap to view on Instagram' },
        fs_keyword_label: { ko: '🔎 키워드', en: '🔎 Keyword' },
        reg_link_label: { ko: '가입/문의 링크 (선택)', en: 'Join/contact link (optional)' },
        reg_link_ph: { ko: '예: https://open.kakao.com/o/...', en: 'e.g. https://open.kakao.com/o/...' },
        reg_submit: { ko: '등록하기', en: 'Register' },
        reg_optional_summary: { ko: '추가 정보 입력 (선택) ▾', en: 'Add more details (optional) ▾' },
        reg_login_hint: { ko: '팀 등록을 마치려면 로그인이 필요해요. 로그인하면 작성한 내용 그대로 이어서 등록돼요.', en: 'Log in to finish registering your team. Your entries are kept and submitted automatically after login.' },
        reg_addr_geocode_fallback: { ko: '주소를 자동으로 찾지 못했어요. 지도에서 위치를 직접 찍어 주세요.', en: "Couldn't locate that address automatically. Please drop a pin on the map." },

        // 지도 위치 선택
        mp_confirm: { ko: '이 위치로 주소 설정', en: 'Set address to this spot' },
        mp_cancel: { ko: '취소', en: 'Cancel' },

        // ── 동적(JS) 문자열 ──
        // 도시락 식단표 슬롯 / 동작 — 밥·국·반찬 메타포 유지
        lb_slot_rice: { ko: '밥을<br>담아 주세요🍚', en: 'Add rice 🍚' },
        lb_slot_soup: { ko: '국을<br>담아 주세요🥘', en: 'Add soup 🥘' },
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
        lb_already: { ko: '이미 도시락에 있어요', en: 'Already in your lunchbox' },
        lb_full: { ko: '도시락이 꽉 찼어요(5칸). 한 팀을 빼면 담을 수 있어요', en: 'Your lunchbox is full (5). Take one out to add another.' },
        lb_added_custom: { ko: '나만의 메뉴를 담았어요 🍙', en: 'Packed into your menu 🍙' },
        lb_added_team: { ko: '도시락에 담았어요 🍱', en: 'Packed into your lunchbox 🍱' },
        lb_bookmark_fail: { ko: '도시락에 담지 못했어요. 잠시 후 다시 해 주세요.', en: 'Couldn\'t pack it. Please try again in a moment.' },
        lb_deleted_team: { ko: '삭제된 팀', en: 'Deleted team' },
        lb_remove_confirm: { ko: '이 반찬을 도시락에서 뺄까요?', en: 'Take this dish out of your lunchbox?' },

        // 공유
        // 포장 형태 칩 — 앱 share_mode_feed / share_mode_story 와 같은 문구
        nickname_reserved: { ko: '누룽지도 공식 계정만 쓸 수 있는 이름이에요. 다른 이름을 골라 주세요.', en: 'That name is reserved for official Nulloongzi accounts. Please pick another.' },
        mc_mode_card: { ko: '네임카드', en: 'Name card' },
        mc_mode_diet: { ko: '식단표', en: 'Schedule' },
        mc_meal_n: { ko: '같은 팀 {n}', en: 'shared teams: {n}' },
        sh_login_required: { ko: '로그인하면 쓸 수 있어요', en: 'Log in to use this.' },
        sh_weekly_plan: { ko: '📅 주간 식단표', en: '📅 Weekly menu' },
        sh_run_fail: { ko: '잠깐 문제가 생겼어요. 다시 해 주세요.', en: 'Something went wrong. Please try again.' },
        no_image: { ko: '저장할 이미지가 없어요', en: 'No image to save' },
        link_copied: { ko: '링크를 복사했어요', en: 'Link copied' },
        sh_view_club_text: { ko: '누룽지도에서 동호회 보기', en: 'View this club on Nulloongzi-do' },
        sh_club_fallback: { ko: '배구 동호회', en: 'Volleyball club' },
        sh_view_on: { ko: '누룽지도에서 보기', en: 'View on Nulloongzi-do' },
        sh_view_club_btn: { ko: '동호회 보기', en: 'View club' },
        sh_card_cta: { ko: 'QR 찍으면 누룽지도에서 열려요', en: 'Scan to open in Nulloongzi-do' },
        sh_menu_title: { ko: '공유 방법 선택', en: 'Share via' },
        sh_menu_story: { ko: '📸 인스타 스토리', en: '📸 Instagram Story' },
        sh_menu_feed: { ko: '🖼 피드 이미지 (3:4)', en: '🖼 Feed image (3:4)' },
        sh_menu_kakao: { ko: '💬 카카오톡', en: '💬 KakaoTalk' },
        sh_menu_copy: { ko: '🔗 링크 복사', en: '🔗 Copy link' },
        sh_menu_more: { ko: '📤 다른 앱으로 (DM 등)', en: '📤 More apps (DM, etc.)' },
        sh_menu_cancel: { ko: '닫기', en: 'Close' },
        sh_menu_story_hint: { ko: '올린 뒤 링크 스티커로 붙여넣기 → 탭 1번 진입', en: 'Paste as a link sticker after posting → 1-tap entry' },
        sh_coach_title: { ko: '보는 사람이 한 번에 들어오게 하려면', en: 'Let viewers in with one tap' },
        sh_coach_steps: { ko: '① 스토리 편집에서 [스티커] → [링크]\n② 붙여넣기 (링크가 복사됐어요!)\n③ 끝 — 보는 사람은 스티커 탭 한 번으로 입장', en: '① In the editor: [Sticker] → [Link]\n② Paste (link is copied!)\n③ Done — viewers tap the sticker to enter' },
        sh_coach_go: { ko: '📸 인스타로 공유하기', en: '📸 Share to Instagram' },

        // 주소 복사
        addr_copied: { ko: '주소를 복사했어요', en: 'Address copied' },

        // 팀 등록
        reg_title_urgent: { ko: '급구/제보하기', en: 'Post an urgent call' },
        reg_edit_title: { ko: '팀 정보 수정', en: 'Edit team info' },
        reg_edit_submit: { ko: '수정하기', en: 'Save changes' },
        reg_no_edit_perm: { ko: '올린 사람이나 관리자만 고칠 수 있어요', en: 'Only the person who posted it or an admin can edit this.' },
        reg_owner_hint: { ko: '현재 소유자: {nick} (비우면 변경 안 됨)', en: 'Current owner: {nick} (leave blank to keep)' },
        reg_owner_none: { ko: '소유자 없음 (레거시) · 이메일 입력하여 지정', en: 'No owner (legacy) · enter an email to assign' },
        reg_map_loc: { ko: '지도에서 선택된 위치', en: 'Location picked on map' },
        reg_login_required: { ko: '로그인하면 팀을 등록할 수 있어요', en: 'Log in to register a team.' },
        reg_name_max: { ko: '팀 이름은 60자까지 쓸 수 있어요', en: 'Team names can be up to 60 characters.' },
        reg_target_max: { ko: '대상은 80자까지 쓸 수 있어요', en: 'Who it\'s for can be up to 80 characters.' },
        reg_addr_max: { ko: '주소는 200자까지 쓸 수 있어요', en: 'Addresses can be up to 200 characters.' },
        reg_price_max: { ko: '회비 설명은 100자까지 쓸 수 있어요', en: 'Fee notes can be up to 100 characters.' },
        reg_insta_invalid: { ko: '인스타 아이디는 영문·숫자·밑줄(_)·점(.)으로 30자까지 적어 주세요 (@ 없이)', en: 'Use letters, numbers, _ or . — up to 30, without @.' },
        reg_link_invalid: { ko: '링크는 http:// 나 https:// 로 시작해야 해요', en: 'Links need to start with http:// or https://' },
        insta_reel_invalid: { ko: '인스타 공개 게시물/릴스 링크 형식이 아니에요. (예: https://www.instagram.com/reel/...)', en: 'That doesn’t look like a public Instagram post/reel link (e.g. https://www.instagram.com/reel/...).' },
        insta_view: { ko: 'Instagram에서 보기', en: 'View on Instagram' },
        processing: { ko: '처리중...', en: 'Processing...' },
        reg_addr_notfound: { ko: '이 주소로는 위치를 못 찾았어요. 도로명 주소로 적거나 지도에서 찍어 주세요', en: 'We couldn\'t find that address. Try a street address or pick it on the map.' },
        reg_cf_uninit: { ko: '소유자를 바꾸지 못했어요. 잠시 후 다시 해 주세요.', en: 'Couldn\'t change the owner. Please try again in a moment.' },
        reg_owner_fail: { ko: '소유자를 바꾸지 못했어요', en: 'Couldn\'t change the owner' },
        reg_updated: { ko: '팀 정보를 고쳤어요', en: 'Team info updated' },
        reg_registered: { ko: '팀을 올렸어요! 이제 지도에서 보여요', en: 'Your team is on the map!' },
        reg_error: { ko: '팀을 저장하지 못했어요. 잠시 후 다시 해 주세요.', en: 'Couldn\'t save the team. Please try again in a moment.' },

        // 로그인/인증(auth)
        au_login_fail: { ko: '로그인하지 못했어요. 잠시 후 다시 해 주세요.', en: 'Couldn\'t log you in. Please try again in a moment.' },
        au_logout_confirm: { ko: '로그아웃할까요?', en: 'Log out?' },
        au_welcome: { ko: '반가워요! 오늘부터 밥이름은 [{name}] 🍚', en: 'Welcome! Your rice name is [{name}] 🍚' },
        au_login_cancelled: { ko: '로그인을 취소했어요', en: 'Login cancelled' },

        // 소셜 로그인 진행 오버레이 (js/auth-loading.js — 동일 키의 최소 사전을 자체 보유)
        auth_signing_in: { ko: '로그인 중이에요', en: 'Signing you in…' },
        auth_signing_in_desc: {
            ko: '계정을 확인하고 있어요. 잠시만 기다려 주세요 🍚',
            en: 'Verifying your account. This only takes a moment 🍚'
        },
        auth_redirecting_kakao: { ko: '카카오로 이동 중이에요', en: 'Redirecting to Kakao…' },
        auth_redirecting_naver: { ko: '네이버로 이동 중이에요', en: 'Redirecting to Naver…' },
        auth_redirect_desc: { ko: '로그인 화면으로 이동하고 있어요.', en: 'Taking you to the login page.' },
        auth_slow_hint: {
            ko: '조금 오래 걸리고 있어요. 네트워크 상태를 확인해 주세요.',
            en: 'This is taking longer than usual. Please check your connection.'
        },
        auth_close: { ko: '닫기', en: 'Close' },

        // 인증 신청(verification)
        // ── 팀 관리자 권한 ──
        // 인증 사진과 요구하는 것이 다르다. 인증은 "이 팀이 활동한다"를, 관리자는
        // "내가 이 팀 사람이다"를 보여야 한다. 공개된 인스타 사진은 앞의 것만
        // 증명하므로, 여기서 그 예를 들면 남의 팀을 가져갈 수 있는 통로가 된다.
        ad_title: { ko: '팀 관리자 신청', en: 'Request team admin' },
        ad_desc: { ko: '관리자가 되면 이 팀 정보를 직접 고칠 수 있어요.<br>본인이 이 팀 사람이라는 걸 알 수 있는 사진을 올려 주세요.<br><br>예) 팀 단톡방 화면 · 팀 유니폼 입고 찍은 사진 · 팀 인스타 계정 관리 화면<br>※ 다른 분 이름이나 연락처는 가리고 올려 주세요.', en: 'Admins can edit this team\'s information directly.<br>Upload a photo showing that you belong to this team.<br><br>e.g. your team group chat, you in the team uniform, the team\'s Instagram account screen<br>※ Please mask other people\'s names and contact details.' },
        ad_photo_label: { ko: '증빙 사진 (필수)', en: 'Proof photo (required)' },
        ad_submit: { ko: '관리자 신청하기', en: 'Submit request' },
        ad_apply_btn: { ko: '🙋 이 팀 관리자 신청', en: '🙋 Request team admin' },
        ad_login_required: { ko: '관리자 신청은 로그인하면 할 수 있어요', en: 'Log in to request admin access.' },
        ad_photo_required: { ko: '확인용 사진을 골라 주세요', en: 'Choose a photo to confirm.' },
        ad_done: { ko: '관리자 신청을 받았어요.\n확인되면 팀 정보를 고칠 수 있어요.', en: 'Request received.\nYou can edit the team once it\'s approved.' },
        ad_error: { ko: '관리자 신청을 보내지 못했어요. 잠시 후 다시 해 주세요.', en: 'Couldn\'t send the request. Please try again in a moment.' },
        ad_pending: { ko: '⏳ 관리자 신청을 확인하고 있어요', en: '⏳ Your admin request is under review.' },
        ad_rejected: { ko: '❌ 관리자 신청이 받아들여지지 않았어요', en: '❌ Admin request was not accepted' },
        ad_reapply: { ko: '🔄 다시 신청', en: '🔄 Apply again' },
        ad_full: { ko: '이 팀은 관리자가 벌써 3명이에요', en: 'This team already has 3 admins.' },
        ad_count: { ko: '관리자 {n}/3명', en: 'Admins {n}/3' },
        ad_leave: { ko: '관리자에서 빠지기', en: 'Leave as admin' },
        ad_leave_confirm: { ko: '이 팀의 관리자에서 빠질까요?\n빠지면 팀 정보를 고칠 수 없어요.', en: 'Leave as an admin of this team?\nYou won\'t be able to edit it anymore.' },
        ad_leave_done: { ko: '관리자에서 빠졌어요', en: 'You\'re no longer an admin' },
        ad_leave_error: { ko: '처리하지 못했어요. 잠시 후 다시 해 주세요.', en: 'Something went wrong. Please try again in a moment.' },
        // ── 위치 공개 수준 ──
        // 학교 체육관을 쓰는 팀이 많다. 장소+시간표가 같이 공개되면 대관에서 밀린
        // 사람이 누가 쓰는지 알 수 있어, 실제로 민원을 받은 팀이 있었다(2026-09).
        reg_area_only: { ko: '대략적인 위치만 공개', en: 'Show approximate location only' },
        reg_area_only_desc: { ko: '지도에 정확한 핀 대신 동네 범위로 표시하고, 주소는 시·군·구까지만 보여요. 체육관 이름과 상세 주소는 저장하지 않아요. 학교나 공공 체육관을 빌려 쓰는 팀에 권해요.', en: 'Shows a neighbourhood area instead of an exact pin, and the address only down to the district. The venue name and full address are not stored. Recommended for teams renting school or public gyms.' },
        reg_area_label_fail: { ko: '이 주소로는 동네 범위를 만들지 못했어요. 지도에서 위치를 찍어 주세요.', en: 'Couldn\'t work out the area from this address. Pick the location on the map.' },
        cd_area_only: { ko: '대략 위치', en: 'Approximate' },
        cd_area_only_note: { ko: '이 팀은 대략적인 위치만 공개해요. 정확한 장소는 팀에 물어봐 주세요.', en: 'This team shares only an approximate location. Ask them for the exact venue.' },
        // 위치 확인 단계. 등록 버튼을 누르면 조용히 지오코딩하고 저장해서,
        // 엉뚱한 곳에 찍혀도 아무도 몰랐다(나중에 신고로 돌아온다).
        mp_confirm_title: { ko: '여기가 맞나요?', en: 'Is this the right spot?' },
        mp_adjust_hint: { ko: '지도를 움직여 정확한 위치로 맞출 수 있어요.', en: 'Drag the map to fine-tune the location.' },
        mp_confirm_here: { ko: '네, 여기예요', en: 'Yes, this is it' },
        mp_matched_place: { ko: '\'{name}\'(으)로 찾았어요', en: 'Matched \'{name}\'' },
        mp_matched_addr: { ko: '주소: {addr}', en: 'Address: {addr}' },
        vf_title: { ko: '인증 신청', en: 'Request verification' },
        vf_desc: { ko: '이 팀이 실제로 운영 중인지 확인하는 용도예요.<br>팀 단체사진이나 대회 참가 사진이면 돼요 — 인스타에 올렸던 사진도 괜찮아요.<br>확인되면 팀 이름 옆에 인증 배지가 붙어요.', en: 'This confirms the team is actually active.<br>A team group photo or a tournament photo works — one you already posted on Instagram is fine.<br>Once confirmed, a badge appears next to the team name.' },
        vf_photo_label: { ko: '인증 사진 (필수)', en: 'Verification photo (required)' },
        vf_submit: { ko: '인증 신청하기', en: 'Submit request' },
        vf_login_required: { ko: '인증 신청은 로그인하면 할 수 있어요', en: 'Log in to request verification.' },
        vf_photo_required: { ko: '인증 사진을 골라 주세요', en: 'Choose a photo for verification.' },
        vf_done: { ko: '인증 신청을 받았어요.\n운영자가 확인하면 인증 배지가 붙어요.', en: 'Verification request received.\nA badge is added after review.' },
        vf_error: { ko: '인증 신청을 보내지 못했어요. 잠시 후 다시 해 주세요.', en: 'Couldn\'t send the request. Please try again in a moment.' },
        vf_apply_btn: { ko: '✅ 인증 신청', en: '✅ Get verified' },
        vf_pending: { ko: '⏳ 인증을 확인하고 있어요.<br><span style="font-size:12px;color:#666;">운영자가 확인하면 인증 배지가 붙어요.</span>', en: '⏳ Verification under review.<br><span style="font-size:12px;color:#666;">A badge is added after review.</span>' },
        vf_no_reason: { ko: '적힌 사유가 없어요.', en: 'No reason given.' },
        vf_rejected: { ko: '❌ 인증이 받아들여지지 않았어요', en: '❌ Verification was not accepted' },
        vf_reason: { ko: '사유: ', en: 'Reason: ' },
        vf_reapply: { ko: '🔄 인증 재신청', en: '🔄 Re-apply' },

        // 클럽 상세 - 관리/급구/삭제
        cd_edit: { ko: '✏ 팀 정보 수정', en: '✏ Edit team' },
        cd_delete: { ko: '🗑 팀 삭제', en: '🗑 Delete team' },
        cd_urgent_off: { ko: '🔥 급구 내리기', en: '🔥 End urgent call' },
        cd_urgent_on: { ko: '🔥 급구 올리기', en: '🔥 Post urgent call' },
        cd_no_delete_perm: { ko: '팀을 올린 사람이나 관리자만 지울 수 있어요', en: 'Only the team owner or an admin can delete this.' },
        role_admin: { ko: '관리자', en: 'admin' },
        role_owner: { ko: '소유자', en: 'owner' },
        cd_delete_confirm: { ko: '[{name}] 팀을 지울까요?', en: 'Delete [{name}]?' },
        cd_delete_body: { ko: '지우면 되돌릴 수 없어요. ({role} 권한)', en: "This can't be undone. ({role})" },
        cd_deleted: { ko: '팀을 지웠어요', en: 'Team deleted' },
        cd_delete_error: { ko: '팀을 지우지 못했어요. 잠시 후 다시 해 주세요.', en: 'Couldn\'t delete the team. Please try again in a moment.' },
        cd_no_urgent_perm: { ko: '급구는 팀을 올린 사람이나 관리자만 켤 수 있어요', en: 'Only the team owner or an admin can post an urgent call.' },
        cd_urgent_prompt: { ko: '어떤 자리를 구하는지 적어 주세요 (예: 라이트 1명)', en: 'Say who you need (e.g. 1 right-side hitter)' },
        cd_urgent_default: { ko: '센터 1명 급구해요', en: 'Need 1 middle blocker' },
        cd_urgent_max: { ko: '급구 메시지는 200자까지 쓸 수 있어요', en: 'Urgent messages can be up to 200 characters.' },
        cd_urgent_posted: { ko: '🔥 급구를 올렸어요', en: '🔥 Urgent call posted' },
        cd_urgent_closed: { ko: '급구를 마감했어요', en: 'Urgent call closed' },
        cd_update_error: { ko: '바꾸지 못했어요. 잠시 후 다시 해 주세요.', en: 'Couldn\'t save the change. Please try again in a moment.' },

        // ── 픽업 게임: 탭 ──
        tab_clubs: { ko: '동호회', en: 'Clubs' },
        tab_pickup: { ko: '픽업', en: 'Pickup' },

        // 픽업 리스트 / FAB / 검색
        pk_list_title: { ko: '여기서 픽업이 열려요', en: 'Where pickup happens' },
        pk_empty: { ko: '아직 등록된 픽업이 없어요.\n첫 픽업을 올려보세요! 🏐', en: 'No pickup spots yet.\nBe the first to add one! 🏐' },
        pk_host_title: { ko: '픽업 등록', en: 'Add a pickup' },
        pk_region_all: { ko: '지역 전체', en: 'All regions' },
        pk_level_all: { ko: '레벨 전체', en: 'All levels' },
        pk_f_curated: { ko: '대신 등록 (관리자)', en: 'Add on behalf (admin)' },
        pk_f_curated_chip: { ko: '🔎 공개 정보로 대신 등록', en: '🔎 Added from public info' },
        pk_f_curated_hint: {
            ko: '켜면 상세에 "공개 인스타 정보로 모은 크루" 안내와 수정/삭제 요청 링크가 보여요. 남의 크루를 대신 올릴 때만 켜 주세요.',
            en: 'Shows a "collected from public Instagram info" notice plus an edit/removal request link on the detail sheet. Only for crews you add on their behalf.'
        },
        pk_curated_note: {
            ko: '공개된 인스타 정보를 보고 누룽지가 모아둔 크루예요. 직접 등록한 팀이 아니에요.',
            en: "Collected by Nulloongzi from public Instagram info — not submitted by the crew itself."
        },
        pk_curated_takedown: { ko: '우리 팀이에요 · 수정/삭제 요청', en: "This is us · request edit/removal" },
        pk_takedown_subject: { ko: '[누룽지도] 픽업 크루 수정/삭제 요청', en: '[Nulloongzi-do] Pickup crew edit/removal request' },
        pk_takedown_body: {
            ko: '아래 크루에 대해 수정 또는 삭제를 요청합니다. (확인 후 바로 처리해 드릴게요)',
            en: 'I request an edit or removal for the crew below. (We will action it as soon as we verify.)'
        },
        pk_list_share: { ko: '🔗 공유', en: '🔗 Share' },
        dt_last_verified: { ko: '최종 확인', en: 'Last checked' },
        dt_needs_check: { ko: '확인 필요', en: 'needs check' },
        dt_unknown: { ko: '최종 확인일 정보 없음', en: 'Last checked: unknown' },
        dt_report: { ko: '정보가 틀렸어요', en: 'Report incorrect info' },
        report_subject: { ko: '[누룽지도] 정보 정정 요청', en: '[Nulloongzi-do] Correction request' },
        report_body: { ko: '아래 항목의 정보가 사실과 다릅니다. 확인 부탁드립니다.', en: 'The information below is inaccurate. Please review.' },
        report_what: { ko: '어느 부분이 틀렸는지: ', en: 'What is wrong: ' },
        // 인앱 신고 모달 (mailto 대체). 사유 값은 firestore.rules 의 enum 과 같아야 한다.
        rp_title: { ko: '잘못된 정보 신고', en: 'Report incorrect info' },
        rp_intro: { ko: '확인하고 영업일 7일 안에 반영해요. 신고한 사람의 정보는 남기지 않아요.', en: 'We review reports within 7 business days. No personal information is stored.' },
        rp_reason_label: { ko: '어떤 문제인가요? (필수)', en: "What's wrong? (required)" },
        rp_wrong_info: { ko: '정보가 틀림', en: 'Incorrect info' },
        rp_closed: { ko: '운영 종료/해체', en: 'No longer active' },
        rp_duplicate: { ko: '중복 등록', en: 'Duplicate' },
        rp_inappropriate: { ko: '부적절한 내용', en: 'Inappropriate' },
        rp_other: { ko: '기타', en: 'Other' },
        rp_detail_label: { ko: '자세히 (선택)', en: 'Details (optional)' },
        rp_detail_ph: { ko: '예: 연습 요일이 화·목으로 바뀌었어요', en: 'e.g. Practice days changed to Tue/Thu' },
        rp_submit: { ko: '신고 보내기', en: 'Send report' },
        rp_sending: { ko: '보내는 중…', en: 'Sending…' },
        rp_need_reason: { ko: '어떤 문제인지 골라 주세요', en: 'Choose what\'s wrong.' },
        rp_done: { ko: '신고를 받았어요. 확인하고 반영할게요. 고마워요!', en: 'Report received. Thanks — we\'ll review it.' },
        // 포장하기(공유 카드). 빈 칸 라벨은 화면 UI의 안내문구에서 명령형만 뺀 형태 —
        // '국을 담아주세요🥘' 는 받아 보는 사람에게 하는 말처럼 읽힌다.
        mc_lunchbox: { ko: '도시락', en: 'Lunchbox' },
        mc_timetable: { ko: '식단표', en: 'Schedule' },
        mc_no_sched: { ko: '찜한 팀의 일정이 없어요', en: 'No schedule for saved teams' },
        mc_rice: { ko: '밥 🍚', en: 'Rice 🍚' },
        mc_soup: { ko: '국 🥘', en: 'Soup 🥘' },
        mc_side1: { ko: '반찬1 🍳', en: 'Side 1 🍳' },
        mc_side2: { ko: '반찬2 🥗', en: 'Side 2 🥗' },
        mc_side3: { ko: '반찬3 🥢', en: 'Side 3 🥢' },
        mc_cta: { ko: '나는 무슨 밥일까?', en: 'What rice are you?' },
        mc_cta_diet: { ko: '같이 뛸 팀 찾기', en: 'Find a team to play with' },
        // 식단표 카드 헤드라인: "화·목·토 저녁형" · "주 3회 · 8시간 코트 위"
        mc_kind_eve: { ko: '저녁형', en: 'evenings' },
        mc_kind_noon: { ko: '낮형', en: 'afternoons' },
        mc_kind_morn: { ko: '아침형', en: 'mornings' },
        mc_diet_ndays: { ko: '주 {n}일', en: '{n} days a week ·' },
        mc_diet_sub: { ko: '주 {n}회 · {h}시간 코트 위', en: '{n} sessions · {h}h on court' },
        mc_diet_empty: { ko: '이번 주 식단표', en: "This week's schedule" },
        // 밥도감(네임카드) — 밥 종류 25가지를 밥친구와 모은다. 단계 이름에 '누룽지'는 쓰지 않는다.
        dex_no: { ko: '밥도감 No.{n}', en: 'Rice-dex No.{n}' },
        dex_r_common: { ko: '흔함', en: 'Common' },
        dex_r_rare: { ko: '드묾', en: 'Rare' },
        dex_r_legend: { ko: '전설', en: 'Legendary' },
        dex_title: { ko: '내 밥상 · 밥도감', en: 'My table · Rice-dex' },
        dex_count: { ko: '{n} / {total}종', en: '{n} / {total} kinds' },
        dex_next: { ko: '{stage}까지 {n}종 남았어요', en: '{n} more to {stage}' },
        dex_done: { ko: '밥도감을 다 모았어요', en: 'Rice-dex complete' },
        dex_st_1: { ko: '혼밥', en: 'Solo meal' },
        dex_st_2: { ko: '밥상', en: 'A table' },
        dex_st_3: { ko: '한상차림', en: 'Full spread' },
        dex_st_4: { ko: '잔칫상', en: 'Feast' },
        dex_st_5: { ko: '수라상', en: 'Royal table' },
        // 밥 종류별 한 줄 성격 — 번호는 profile.js riceData 순서(= 밥도감 번호)
        rice_line_1: { ko: '씹을수록 진가가 나오는 꾸준파', en: 'The steady one — better the more you chew' },
        rice_line_2: { ko: '어느 팀에 둬도 어울리는 기본기 장인', en: 'Fits any team — master of the basics' },
        rice_line_3: { ko: '조용하다가 한 방에 색을 내는 타입', en: 'Quiet, then one big splash of color' },
        rice_line_4: { ko: '소박하지만 든든한, 끝까지 뛰는 체력파', en: 'Humble but hearty — runs till the end' },
        rice_line_5: { ko: '톡톡 튀는 존재감, 코트의 분위기 메이커', en: 'Pops with presence — the mood maker' },
        rice_line_6: { ko: '뭐든 섞어도 맛있는 올라운더', en: 'Mix in anything — the all-rounder' },
        rice_line_7: { ko: '작지만 꽉 찬, 수비에서 빛나는 알갱이', en: 'Small but full — shines on defense' },
        rice_line_8: { ko: '알아보는 사람만 아는 은근한 실력파', en: 'Quiet skill that only insiders notice' },
        rice_line_9: { ko: '경기 끝나고 제일 먼저 찾게 되는 편한 사람', en: 'The comfy one everyone looks for after a game' },
        rice_line_10: { ko: '불 붙으면 못 말리는 화력형', en: 'Unstoppable once fired up' },
        rice_line_11: { ko: '섞일수록 팀워크가 사는 조율형', en: 'Better mixed — the team-play conductor' },
        rice_line_12: { ko: '어디든 따라가는 원정 전문', en: 'Goes anywhere — the away-game specialist' },
        rice_line_13: { ko: '부르면 바로 오는 기동력', en: 'Call and they\'re already there' },
        rice_line_14: { ko: '달콤한 겉모습, 알찬 속', en: 'Sweet outside, packed inside' },
        rice_line_15: { ko: '한 그릇에 다 올리는 올인형', en: 'Piles it all on — the all-in type' },
        rice_line_16: { ko: '믿고 맡기는 뜨끈한 해결사', en: 'Warm and reliable — the problem solver' },
        rice_line_17: { ko: '시간이 걸려도 제대로 뜸 들이는 장인', en: 'Takes time, but steamed just right' },
        rice_line_18: { ko: '팀을 챙기는 달달한 살림꾼', en: 'Sweet devotion — looks after the team' },
        rice_line_19: { ko: '부드럽게 받아내는 리시브 장인', en: 'Soft hands — the receive master' },
        rice_line_20: { ko: '한 번 보면 기억에 남는 사람', en: 'Leaves a scent — hard to forget' },
        rice_line_21: { ko: '좋은 건 다 들어간 팀의 보약', en: 'Everything good inside — the team\'s tonic' },
        rice_line_22: { ko: '마지막 한 점까지 긁어먹는 근성파', en: 'Scrapes the last grain — pure grit' },
        rice_line_23: { ko: '3분이면 준비 완료, 번개 출석왕', en: 'Ready in 3 minutes — first to every pickup' },
        rice_line_24: { ko: '푸짐한 열정, 연습량으로 승부', en: 'A heaping bowl of passion — wins on practice' },
        rice_line_25: { ko: '참 쉽죠? 전설로만 전해지는 밥', en: 'Happy little accidents — a living legend' },
        deleted_team: { ko: '삭제된 팀', en: 'Deleted team' },

        // 팀 소유권 클레임 (구글시트 접수 메일 매칭)
        claim_requested: {
            ko: '등록하신 메일과 같은 팀을 찾았어요. 운영자가 확인하면 팀 정보를 고칠 수 있어요.',
            en: 'We found a team registered with your email. An admin will review and grant edit access.'
        },
        claim_needs_verification: {
            ko: '메일 인증을 마치면 등록하신 팀을 이어 드릴 수 있어요. 인증 메일을 받을까요?',
            en: 'Verify your email to claim your team. Send a verification email?'
        },
        claim_verify_sent: {
            ko: '인증 메일을 보냈어요. 확인한 뒤 다시 로그인해 주세요.',
            en: 'Verification email sent. Please sign in again after confirming.'
        },
        rp_fail_mail: { ko: '신고를 보내지 못했어요. 메일로 보내 주시면 확인할게요.', en: 'Couldn\'t send the report. Please email us instead.' },
        policy_terms: { ko: '이용약관', en: 'Terms' },
        policy_guidelines: { ko: '운영 기준', en: 'Guidelines' },
        policy_privacy: { ko: '개인정보처리방침', en: 'Privacy' },
        pk_back_to_list: { ko: '← 목록으로', en: '← Back to list' },
        pk_list_link_copied: { ko: '이 목록 링크를 복사했어요. 그대로 보내면 같은 목록이 열려요', en: 'List link copied — send it and they\'ll see the same list' },
        pk_search_ph: { ko: '픽업, 장소로 검색...', en: 'Search pickups or venues...' },

        // 픽업 발견형 신규 키 (보통일정 / 이번주 / 들어가는 문)
        pk_f_sched_struct: { ko: '보통 일정 (요일·시간)', en: 'Usual schedule (days · times)' },
        pk_f_schedule: { ko: '일정 메모 (비정기·기타, 선택)', en: 'Schedule note (irregular/other, optional)' },
        pk_f_schedule_ph: { ko: '예: 셋째주 휴무 · 우천시 취소', en: 'e.g. No game 3rd week · cancelled if rain' },
        pk_f_thisweek: { ko: '이번주 공지 (선택)', en: 'This week (optional)' },
        pk_f_thisweek_ph: { ko: '예: 이번주 토 7시 잠실', en: 'e.g. This Sat 7pm, Jamsil' },
        pk_thisweek_badge: { ko: '이번주', en: 'This week' },
        pk_contact_cta: { ko: '💬 단톡 들어가기', en: '💬 Join the group chat' },
        pk_share_story: { ko: '📸 스토리 카드', en: '📸 Story card' },

        // 종목 / 레벨 태그
        pk_sport_6s: { ko: '6인제', en: '6s' },
        pk_sport_9s: { ko: '9인제', en: '9s' },
        pk_sport_mixed: { ko: '혼성·자유', en: 'Mixed' },
        // 레벨 라벨: KO는 한국식, EN은 USAV 성인부 문자 등급(B/BB/A/AA·Open).
        // 저장값은 동일 — 외국인은 문자 등급을 알고 한국인은 모르기 때문에 라벨만 갈랐다.
        pk_lv_beginner: { ko: '입문', en: 'B · Beginner' },
        pk_lv_intermediate: { ko: '중급', en: 'BB · Intermediate' },
        pk_lv_advanced: { ko: '상급', en: 'A · Competitive' },
        pk_lv_elite: { ko: '선출·대학팀급', en: 'AA/Open · Collegiate+' },
        pk_lv_any: { ko: '누구나 환영', en: 'All welcome' },

        // 각 레벨 한 줄 설명 — 등록 폼·필터 양쪽에 노출한다.
        pk_lv_beginner_desc: { ko: '배구 처음 · 기본기 배우는 중', en: 'New to volleyball, learning the basics' },
        pk_lv_intermediate_desc: { ko: '규칙·로테이션 이해 · 패스/셋/스파이크 어느 정도', en: 'Know rules & rotations; pass/set/hit fairly consistently' },
        pk_lv_advanced_desc: { ko: '경험 많고 기본기 탄탄 · 팀 공수 전술 이해', en: 'Experienced, solid skills, knows team offense/defense' },
        pk_lv_elite_desc: { ko: '선수 출신 또는 대학팀급', en: 'Collegiate-level ability or equivalent' },
        pk_lv_any_desc: { ko: '실력 상관없이 누구나', en: 'Anyone, any level' },

        // 자가 선택 가이드 — 미국 오픈짐들이 공통으로 붙이는 문구. 레벨 제도가 굴러가게 하는 장치다.
        pk_level_hint: {
            ko: '애매하면 낮은 쪽을 골라 주세요. 남과 비교하지 말고 설명 기준으로요.',
            en: "When in doubt, pick the lower level. Judge by the description, not by other players."
        },
        pk_beginner_ok: { ko: '🌱 초보환영', en: '🌱 Beginners welcome' },
        pk_english_ok: { ko: '🌐 English OK', en: '🌐 English OK' },
        pk_f_english: { ko: '🌐 외국인 환영 (English OK)', en: '🌐 English OK / foreigners welcome' },

        // 정원 / 상태
        pk_spots_left: { ko: '{n}자리 남음', en: '{n} spots left' },
        pk_full: { ko: '마감', en: 'Full' },
        pk_waitlist_open: { ko: '대기 가능', en: 'Waitlist open' },
        pk_count: { ko: '{c}/{cap}명', en: '{c}/{cap}' },

        // 상세 - 참가(RSVP)
        pk_join: { ko: '참가 신청', en: 'Join this game' },
        pk_join_waitlist: { ko: '대기열 신청', en: 'Join the waitlist' },
        pk_joined: { ko: '참가 확정 ✓', en: "You're in ✓" },
        pk_waitlisted: { ko: '대기열 등록됨', en: 'On the waitlist' },
        pk_cancel_spot: { ko: '신청 취소', en: 'Cancel my spot' },
        pk_login_to_join: { ko: '로그인하면 참가할 수 있어요', en: 'Log in to join.' },
        pk_joined_in: { ko: '참가가 확정됐어요! 게임비를 보내 주세요 💸', en: "You're in! Please send the game fee. 💸" },
        pk_joined_wait: { ko: '정원이 차서 대기열에 등록됐어요.', en: "The game is full — you're on the waitlist." },
        pk_cancel_confirm: { ko: '참가를 취소할까요?', en: 'Cancel your spot?' },
        pk_canceled: { ko: '참가가 취소됐어요.', en: 'Your spot was canceled.' },

        // 결제(송금 링크아웃)
        pk_fee_label: { ko: '게임비', en: 'Game fee' },
        pk_pay_send: { ko: '💸 송금하기', en: '💸 Send fee' },
        pk_pay_account: { ko: '📋 계좌 복사', en: '📋 Copy account' },
        pk_acct_copied: { ko: '계좌번호가 복사됐어요! 📋', en: 'Account number copied! 📋' },
        pk_fee_onsite: { ko: '현장 결제', en: 'Pay on-site' },

        // 상세 - 정보 라벨
        pk_when: { ko: '일시', en: 'When' },
        pk_where: { ko: '장소', en: 'Where' },
        pk_host: { ko: '호스트', en: 'Host' },
        pk_roster: { ko: '참가자', en: 'Players' },
        pk_contact: { ko: '문의·단톡', en: 'Group chat' },

        // 호스트 - 정산
        pk_settle_title: { ko: '참가자 정산', en: 'Player settlement' },
        pk_paid: { ko: '입금완료', en: 'Paid' },
        pk_unpaid: { ko: '미입금', en: 'Unpaid' },
        pk_paid_count: { ko: '입금 {p}/{t}명', en: 'Paid {p}/{t}' },

        // 호스트 - 게임 개설/수정 모달
        pk_create_title: { ko: '픽업 등록하기', en: 'Add a pickup spot' },
        pk_edit_title: { ko: '게임 정보 수정', en: 'Edit game' },
        pk_f_title: { ko: '게임 이름 (필수)', en: 'Game name (required)' },
        pk_f_title_ph: { ko: '예: 토요일 저녁 6인제 픽업', en: 'e.g. Saturday evening 6s pickup' },
        pk_f_sport: { ko: '종목', en: 'Format' },
        pk_f_level: { ko: '레벨', en: 'Level' },
        pk_f_beginner: { ko: '초보 환영', en: 'Beginners welcome' },
        pk_f_date: { ko: '날짜 (필수)', en: 'Date (required)' },
        pk_f_start: { ko: '시작', en: 'Start' },
        pk_f_end: { ko: '종료', en: 'End' },
        pk_f_region: { ko: '지역', en: 'Region' },
        pk_f_insta: { ko: '인스타 아이디 (선택)', en: 'Instagram handle (optional)' },
        pk_f_insta_ph: { ko: '예: nulloongzi (@ 없이)', en: 'e.g. nulloongzi (without @)' },
        pk_f_venue: { ko: '체육관 이름', en: 'Venue name' },
        pk_f_venue_ph: { ko: '예: 잠실학생체육관', en: 'e.g. Jamsil Gym' },
        pk_f_addr: { ko: '주소 (선택 · 없으면 목록에만 표시)', en: 'Address (optional — list only if blank)' },
        pk_f_addr_ph: { ko: '예: 서울 송파구 올림픽로 25', en: 'e.g. 25 Olympic-ro, Songpa-gu, Seoul' },
        pk_f_capacity: { ko: '정원 (필수)', en: 'Capacity (required)' },
        pk_f_capacity_ph: { ko: '예: 12', en: 'e.g. 12' },
        pk_f_fee: { ko: '게임비 정보 (선택)', en: 'Game fee info (optional)' },
        pk_f_fee_ph: { ko: '예: 보통 1만원 · 현장', en: 'e.g. ~₩10,000, on-site' },
        pk_f_paylink: { ko: '송금 링크 (토스/카카오페이) — 선택', en: 'Payment link (Toss/KakaoPay) — optional' },
        pk_f_paylink_ph: { ko: '예: https://toss.me/...', en: 'e.g. https://toss.me/...' },
        pk_f_account: { ko: '입금 계좌 (선택)', en: 'Bank account (optional)' },
        pk_f_account_ph: { ko: '예: 카카오뱅크 3333-00-0000000', en: 'e.g. Kakao Bank 3333-00-0000000' },
        pk_f_contact: { ko: '단톡/문의 링크 (선택)', en: 'Group chat link (optional)' },
        pk_f_contact_ph: { ko: '예: https://open.kakao.com/o/...', en: 'e.g. https://open.kakao.com/o/...' },
        pk_f_notes: { ko: '추가 안내 (선택)', en: 'Notes (optional)' },
        pk_f_notes_ph: { ko: '예: 실내화 필수 · 네트 6인제 높이', en: 'e.g. Indoor shoes required' },
        pk_f_expire: { ko: '언제까지 보일까요? (지나면 자동 숨김)', en: 'Show until? (auto-hidden after)' },
        pk_exp_weekend: { ko: '이번 주말', en: 'This weekend' },
        pk_exp_1m: { ko: '1개월', en: '1 month' },
        pk_exp_3m: { ko: '3개월', en: '3 months' },
        pk_exp_always: { ko: '상시', en: 'Always' },
        pk_f_reel: { ko: '릴스/게시물 링크 (선택)', en: 'Reel/post link (optional)' },
        pk_f_reel_ph: { ko: '예: https://www.instagram.com/reel/...', en: 'e.g. https://www.instagram.com/reel/...' },
        pk_create_submit: { ko: '픽업 등록', en: 'Add pickup' },
        pk_save_submit: { ko: '수정하기', en: 'Save changes' },

        // 호스트 - 검증/메시지
        pk_login_required: { ko: '로그인하면 게임을 열 수 있어요', en: 'Log in to host a game.' },
        pk_req_fields: { ko: '픽업 이름을 적어 주세요', en: 'Enter a name for the game.' },
        pk_bad_capacity: { ko: '정원은 1~200 사이 숫자로 적어 주세요', en: 'Enter a capacity from 1 to 200.' },
        pk_bad_time: { ko: '종료 시간이 시작보다 빨라요.', en: 'End time is before the start time.' },
        pk_past_time: { ko: '지난 시간은 선택할 수 없어요.', en: "You can't pick a time in the past." },
        pk_created: { ko: '픽업 게임이 열렸어요! 🏐', en: 'Your pickup game is live! 🏐' },
        pk_updated: { ko: '게임 정보를 고쳤어요', en: 'Game updated' },
        pk_create_err: { ko: '게임을 저장하지 못했어요. 잠시 후 다시 해 주세요.', en: 'Couldn\'t save the game. Please try again in a moment.' },
        pk_edit: { ko: '✏ 게임 수정', en: '✏ Edit game' },
        pk_delete: { ko: '🗑 게임 삭제', en: '🗑 Delete game' },
        pk_delete_confirm: { ko: '이 게임을 지울까요? 참가자 정보도 함께 사라져요.', en: 'Delete this game? Player info will be removed too.' },
        pk_deleted: { ko: '게임을 지웠어요', en: 'Game deleted' },

        // ── 밥친구 (js/friends.js) ──
        fr_page_card: { ko: '내 카드', en: 'My card' },
        fr_page_friends: { ko: '밥친구', en: 'Bap friends' },
        fr_title_n: { ko: '밥친구 {n}', en: 'Bap friends {n}' },
        fr_add_btn: { ko: '+ 추가', en: '+ Add' },
        fr_back: { ko: '뒤로', en: 'Back' },
        fr_loading: { ko: '불러오는 중…', en: 'Loading…' },
        fr_incoming: { ko: '받은 신청', en: 'Requests' },
        fr_outgoing: { ko: '보낸 신청', en: 'Sent' },
        fr_req_sub: { ko: '밥친구 신청이 왔어요', en: 'Wants to be bap friends' },
        fr_accept: { ko: '수락', en: 'Accept' },
        fr_reject: { ko: '거절', en: 'Decline' },
        fr_cancel: { ko: '취소', en: 'Cancel' },
        fr_waiting: { ko: '수락을 기다리는 중 · 7일 뒤 사라져요', en: 'Waiting · expires in 7 days' },
        fr_accepted_toast: { ko: '{name}님과 밥친구가 됐어요', en: 'You and {name} are bap friends' },
        fr_accepted_short: { ko: '밥친구가 됐어요', en: 'You are now bap friends' },
        fr_sent_toast: { ko: '신청했어요. 상대가 수락하면 밥친구가 돼요', en: 'Request sent. You become friends once they accept' },
        fr_empty_title: { ko: '아직 밥친구가 없어요', en: 'No bap friends yet' },
        fr_empty_body: { ko: '초대코드를 주고받으면 서로의 식단표를 볼 수 있어요.', en: 'Swap invite codes to see each other’s schedule.' },
        fr_since: { ko: '{d}부터 밥친구', en: 'Friends since {d}' },
        fr_friend: { ko: '밥친구', en: 'Bap friend' },
        fr_unknown: { ko: '알 수 없는 밥', en: 'Unknown rice' },
        fr_badge_aria: { ko: '받은 밥친구 신청 {n}개', en: '{n} friend requests' },
        fr_add_title: { ko: '밥친구 추가', en: 'Add a bap friend' },
        fr_my_code: { ko: '내 초대코드', en: 'My invite code' },
        fr_copy: { ko: '복사', en: 'Copy' },
        fr_copy_link: { ko: '초대 링크 복사', en: 'Copy invite link' },
        fr_show_qr: { ko: 'QR', en: 'QR' },
        fr_qr_aria: { ko: '내 초대 링크 QR 코드', en: 'QR code of my invite link' },
        fr_code_copied: { ko: '초대코드를 복사했어요', en: 'Invite code copied' },
        fr_link_copied: { ko: '초대 링크를 복사했어요', en: 'Invite link copied' },
        fr_regen: { ko: '새 코드 받기', en: 'New code' },
        fr_regen_confirm: { ko: '바꾸기', en: 'Replace' },
        fr_regen_note: { ko: '새 코드를 받으면 지금 코드는 바로 쓸 수 없어요. 이미 맺은 밥친구는 그대로예요.', en: 'Your current code stops working right away. Existing friends stay.' },
        fr_regen_done: { ko: '새 초대코드를 받았어요', en: 'New invite code ready' },
        fr_enter_divider: { ko: '친구 코드가 있다면', en: 'Have a friend’s code?' },
        fr_code_ph: { ko: '친구 초대코드 6자리', en: 'Friend’s 6-character code' },
        fr_find: { ko: '찾기', en: 'Find' },
        fr_request: { ko: '신청', en: 'Request' },
        fr_accept_note: { ko: '코드를 넣어도 바로 친구가 되지 않아요. 상대가 수락해야 서로의 식단표가 보여요.', en: 'Entering a code only sends a request. Schedules open after they accept.' },
        fr_lk_loading: { ko: '찾는 중…', en: 'Looking up…' },
        fr_lk_invalid: { ko: '초대코드는 영문·숫자 6자리예요.', en: 'Invite codes are 6 letters and numbers.' },
        fr_lk_not_found: { ko: '없는 코드예요. 친구가 새 코드를 받았는지 확인해 주세요.', en: 'No such code. Ask your friend if they got a new one.' },
        fr_lk_self: { ko: '내 코드예요.', en: 'That’s your own code.' },
        fr_lk_ok: { ko: '밥친구 신청할까요?', en: 'Send a friend request?' },
        fr_lk_friend: { ko: '이미 밥친구예요', en: 'Already friends' },
        fr_lk_sent: { ko: '신청했어요 · 수락을 기다리는 중', en: 'Request sent · waiting' },
        fr_lk_received: { ko: '나에게 먼저 신청했어요', en: 'They already sent you a request' },
        fr_unfriend: { ko: '밥친구 끊기', en: 'Remove friend' },
        fr_unfriend_confirm: { ko: '끊기', en: 'Remove' },
        fr_unfriend_note: { ko: '상대에게 알리지 않아요. 서로의 목록에서 사라져요.', en: 'They won’t be notified. You’ll disappear from each other’s list.' },
        fr_unfriended: { ko: '밥친구를 끊었어요', en: 'Friend removed' },
        fr_err_generic: { ko: '잠시 후 다시 해 주세요.', en: 'Please try again in a moment.' },
        fr_err_full: { ko: '밥친구는 100명까지예요.', en: 'You can have up to 100 bap friends.' },
        fr_share_title: { ko: '밥친구에게 보일 팀을 골라 주세요', en: 'Choose teams your bap friends can see' },
        fr_share_body: { ko: '체크한 팀과 그 운동 시간이 모든 밥친구에게 보여요. 나중에 도시락 편집의 눈 버튼으로 바꿀 수 있어요.', en: 'Checked teams and their times are visible to all bap friends. Change later with the eye button in lunchbox edit.' },
        fr_share_none: { ko: '도시락에 담은 팀이 아직 없어요.', en: 'No teams in your lunchbox yet.' },
        fr_share_ok: { ko: '이대로 보이기', en: 'Share these' },
        fr_share_done: { ko: '밥친구에게 식단표를 보여줘요', en: 'Your schedule is now visible to bap friends' },
        fr_vis_title: { ko: '밥친구에게 내 식단표 보이기', en: 'Show my schedule to bap friends' },
        fr_vis_on: { ko: '켜짐 · 숨길 팀은 도시락 편집에서 눈 버튼으로', en: 'On · hide teams with the eye in lunchbox edit' },
        fr_vis_off: { ko: '꺼짐 · 밥친구에게는 네임카드만 보여요', en: 'Off · friends only see your name card' },
        fr_lb_changed: { ko: '도시락이 바뀌었어요', en: 'Lunchbox updated' },
        fr_lb_title: { ko: '도시락', en: 'Lunchbox' },
        fr_lb_empty: { ko: '보여주는 팀이 없어요', en: 'No teams shared' },
        fr_lb_none: { ko: '아직 식단표를 공개하지 않았어요.', en: 'Hasn’t shared a schedule yet.' },
        fr_lb_hidden: { ko: '식단표를 숨겨 두었어요.', en: 'Schedule is hidden.' },
        fr_tt_title: { ko: '식단표 겹쳐 보기', en: 'Schedules side by side' },
        fr_tt_me: { ko: '나', en: 'Me' },
        fr_tt_friend: { ko: '밥친구', en: 'Friend' },
        fr_tt_empty: { ko: '보여줄 운동 시간이 없어요.', en: 'No workout times to show.' },
        fr_tt_meal: { ko: '합석', en: 'Both' },
        fr_tt_meal_legend: { ko: '합석', en: 'Together' },
        fr_meal_title: { ko: '이번 주 합석', en: 'Eating together this week' },
        fr_meal_tier: { ko: '{tier} · 같은 팀 {n}개', en: '{tier} · shared teams: {n}' },
        fr_meal_zero: { ko: '같은 팀에서 같은 시간에 운동하면 합석이에요.', en: 'Same team, same time = eating together.' },
        fr_meal_hint: { ko: '같은 팀 · 같은 시간에 운동하는 밥친구', en: 'Friends on the same team at the same time' },
        fr_err_daily: { ko: '신청은 하루 30건까지예요. 내일 다시 해 주세요.', en: 'Up to 30 requests a day. Try again tomorrow.' },
        fr_meal_fab: { ko: '이번 주 합석하는 밥친구가 있어요', en: 'You play with bap friends this week' },
        fr_warm_0: { ko: '', en: '' },
        fr_warm_1: { ko: '한 숟갈', en: 'A spoonful' },
        fr_warm_2: { ko: '한 그릇', en: 'A bowlful' },
        fr_warm_3: { ko: '한솥밥', en: 'Same pot' },
        lb_eye_on: { ko: '밥친구에게 보임 (누르면 숨기기)', en: 'Visible to friends (tap to hide)' },
        lb_eye_off: { ko: '밥친구에게 숨김 (누르면 보이기)', en: 'Hidden from friends (tap to show)' }
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

    // ── 데이터 표시 변환 (한글 원본 → 영어 표시) ──
    // 클럽 데이터는 한글로 저장된다. EN 모드에서 "표시"만 영어로 바꾼다.
    // 결정적 어휘/패턴만 변환하고, 모르는 토큰은 원문 유지(best-effort).

    // 대상/특징 어휘 매핑. 긴 토큰부터(부분 겹침 방지: 선출가능 > 선출).
    var TARGET_MAP = [
        ['여성전용', 'Women only'], ['남성전용', 'Men only'],
        ['선출가능', 'Ex-players OK'], ['군미필 상관x', 'pre-service OK'], ['군미필', 'pre-service OK'],
        ['대학생', 'College'], ['청소년', 'Youth'], ['성인', 'Adults'],
        ['6인제', '6s'], ['9인제', '9s'], ['무관', 'Anyone'],
        ['선출', 'Ex-player'], ['구력', 'exp.'], ['이상', '+'],
        ['남', 'M'], ['여', 'W']
    ];
    window.i18nTarget = function (str) {
        if (window.currentLang !== 'en' || !str) return str || '';
        var s = str;
        for (var i = 0; i < TARGET_MAP.length; i++) {
            s = s.split(TARGET_MAP[i][0]).join(TARGET_MAP[i][1]);
        }
        return s;
    };

    // 회비 패턴 파서. 금액(만원/천원)은 결정적, 어휘는 글로사리.
    var PRICE_MAP = [
        ['게스트비', 'Guest fee'], ['게스트', 'Guest'], ['학생', 'Student'],
        ['회비', 'Fee'], ['분기', 'Quarterly'], ['무료', 'Free'],
        ['주1회', '1×/wk'], ['주2회', '2×/wk'], ['주3회', '3×/wk'],
        ['주 1회', '1×/wk'], ['주 2회', '2×/wk'], ['주 3회', '3×/wk'],
        ['월 기준', '/mo'], ['월', 'Monthly'], ['없음', 'none']
    ];
    window.i18nPrice = function (str) {
        if (window.currentLang !== 'en' || !str) return str || '';
        var s = str;
        // 금액: 6.5만원 → ₩65,000 / 8천원 → ₩8,000
        s = s.replace(/(\d+(?:\.\d+)?)\s*만\s*원?/g, function (_m, n) {
            return '₩' + Math.round(parseFloat(n) * 10000).toLocaleString('en-US');
        });
        s = s.replace(/(\d+(?:\.\d+)?)\s*천\s*원?/g, function (_m, n) {
            return '₩' + Math.round(parseFloat(n) * 1000).toLocaleString('en-US');
        });
        for (var i = 0; i < PRICE_MAP.length; i++) {
            s = s.split(PRICE_MAP[i][0]).join(PRICE_MAP[i][1]);
        }
        return s;
    };

    function readLang() {
        var saved = null;
        try { saved = localStorage.getItem(LS_LANG_KEY); } catch (e) { saved = null; }
        if (SUPPORTED.indexOf(saved) !== -1) return saved;
        // 저장된 선호가 없으면 브라우저 언어로 추정: 한국어가 아니면 영어 우선 (외국인 beachhead)
        try {
            var nav = ((navigator.language || navigator.userLanguage) || '').toLowerCase();
            if (nav && nav.indexOf('ko') !== 0) return 'en';
        } catch (e) { /* ignore */ }
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

        // 글자 없는(이모지) 버튼의 이름: 화면 낭독기용 aria-label + 마우스 툴팁 title.
        // data-i18n-aria-only 가 있으면 title 은 달지 않는다(시트 손잡이처럼 마우스로 누를 일이 없는 것)
        els = document.querySelectorAll('[data-i18n-aria]');
        for (i = 0; i < els.length; i++) {
            var name = window.t(els[i].getAttribute('data-i18n-aria'));
            els[i].setAttribute('aria-label', name);
            if (!els[i].hasAttribute('data-i18n-aria-only')) els[i].setAttribute('title', name);
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
        document.title = window.t('brand');

        window.applyI18n();

        if (window.setTrackUserProps) window.setTrackUserProps({ ui_lang: lang });

        // 동적 UI(바텀시트 등) 재렌더링 신호
        document.dispatchEvent(new CustomEvent('nurungji:langchange', { detail: { lang: lang } }));
    };

    window.toggleLang = function () {
        var to = window.currentLang === 'ko' ? 'en' : 'ko';
        window.setLang(to);
        if (window.track) window.track('lang_switch', { to: to });
    };

    // 초기 적용 (이 스크립트는 body 하단에서 로드되므로 UI DOM은 이미 존재)
    document.documentElement.setAttribute('lang', window.currentLang);
    if (document.body) document.body.classList.toggle('lang-en', window.currentLang === 'en');
    document.title = window.t('brand');
    window.applyI18n();
    // 모든 이벤트를 화면 언어로 나눠 볼 수 있게 (외국인 교두보 계측)
    if (window.setTrackUserProps) window.setTrackUserProps({ ui_lang: window.currentLang });
})();
