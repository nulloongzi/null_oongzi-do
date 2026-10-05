// urgent.js
// 급구 · 식구 모집의 순수 계산(화면을 만지지 않는다). classic script, window.* 전역.
//   - 급구 문구 검사(urgentMsgProblem) — functions/lib/pure.js · 앱과 같은 정규식
//   - 다가오는 운동 고르기(urgentNextSessions) — 급구 폼의 운동 칩
//   - 마감 표시(urgentDeadlineParts / urgentDeadlineLabel) — 상세 배너
//   (예전 급구 티커는 🍚 여기 자리 있어요?(this-week.js)로 바뀌었다 — 순서도 거기서 시간순)
// 화면(폼·버튼)은 club-detail.js 가 그린다.
// Depends on: dom-utils.js (window.tsMillis). i18n.js(window.tf · i18nDay)는 라벨을 만들 때만.

(function () {
    var MIN = 60 * 1000;
    var DAY = 24 * 60 * MIN;

    // 급구는 7일 안의 운동만. 끝나기 5분도 안 남은 운동은 칩에서 뺀다(서버도 'past' 로 거절).
    window.URGENT_MSG_MAX = 60;
    window.URGENT_MIN_LEAD_MS = 5 * MIN;
    window.URGENT_PICK_AHEAD_MS = 7 * DAY;  // 칩·'다른 날'이 고를 수 있는 범위
    window.URGENT_MAX_AHEAD_MS = 8 * DAY;   // 서버(postUrgent)가 받는 상한 — 하루 여유

    // functions/lib/pure.js 와 글자 하나까지 같아야 한다(tests/urgent.test.js 가 대조한다).
    var LINK_RE = /(https?:\/\/|www\.|open\.kakao|[a-z0-9-]+\.(com|net|org|kr|co|io|me|ly|gl|link|app|page)\b)/i;
    var PHONE_RE = /(01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/;

    // 문구 문제 → 'msg_empty' | 'msg_too_long' | 'msg_link' | 'msg_phone' | null.
    // 길이는 코드 포인트로 센다(이모지 1개 = 1) — 앱 runes.length 와 같게.
    window.urgentMsgProblem = function (msg) {
        var s = typeof msg === 'string' ? msg.trim() : '';
        if (!s) return 'msg_empty';
        if (Array.from(s).length > window.URGENT_MSG_MAX) return 'msg_too_long';
        if (LINK_RE.test(s)) return 'msg_link';
        if (PHONE_RE.test(s)) return 'msg_phone';
        return null;
    };

    // 모집 문구는 비워도 된다 — 빈 칸만 빼고 같은 검사.
    window.recruitMsgProblem = function (msg) {
        var s = typeof msg === 'string' ? msg.trim() : '';
        if (!s) return null;
        return window.urgentMsgProblem(s);
    };

    var KO_DAYS = ['일', '월', '화', '수', '목', '금', '토']; // Date.getDay() 순서

    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function hhmm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
    function localMidnight(ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

    // 시간표(parseScheduleText 결과 {요일: {startH,startM,endH,endM}})에서 다가오는 운동.
    // 기기 시각 기준으로 **끝**이 now+5분 뒤 ~ now+7일 안인 것 중 가장 이른 limit 개.
    // 끝이 시작보다 이르면(22:00~01:00) 다음 날 끝나는 운동이다.
    // 어제 시작해 오늘 새벽에 끝나는 운동도 잡으려고 어제부터 본다.
    window.urgentNextSessions = function (scheduleMap, nowMs, limit) {
        var map = scheduleMap || {};
        var now = nowMs == null ? Date.now() : nowMs;
        var max = limit == null ? 3 : limit;
        var base = new Date(now);
        var out = [];
        for (var off = -1; off <= 7; off++) {
            var day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + off);
            var slot = map[KO_DAYS[day.getDay()]];
            if (!slot) continue;
            var start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), slot.startH, slot.startM);
            var end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), slot.endH, slot.endM);
            if (end.getTime() <= start.getTime()) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, slot.endH, slot.endM);
            var endMs = end.getTime();
            if (endMs <= now + window.URGENT_MIN_LEAD_MS || endMs > now + window.URGENT_PICK_AHEAD_MS) continue;
            out.push({ day: KO_DAYS[start.getDay()], dow: start.getDay(), startMs: start.getTime(), endMs: endMs });
        }
        out.sort(function (a, b) { return a.endMs - b.endMs; });
        return out.slice(0, max);
    };

    // 운동 칩 글자: "수 10/8 19:00~21:00" · "Wed 10/8 19:00–21:00". dayName 은 요일 표기 함수(없으면 한글).
    window.urgentSessionLabel = function (session, lang, dayName) {
        var s = new Date(session.startMs), e = new Date(session.endMs);
        var dn = dayName ? dayName(KO_DAYS[s.getDay()]) : KO_DAYS[s.getDay()];
        var dash = lang === 'en' ? '–' : '~';
        return dn + ' ' + (s.getMonth() + 1) + '/' + s.getDate() + ' ' + hhmm(s) + dash + hhmm(e);
    };

    // '다른 날': 날짜('YYYY-MM-DD') + 끝나는 시각('HH:MM') → 기기 시각 ms. 틀린 값이면 null.
    window.urgentOtherDayUntil = function (dateStr, timeStr) {
        var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
        var tm = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ''));
        if (!dm || !tm) return null;
        var d = new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
        return isFinite(d.getTime()) ? d.getTime() : null;
    };

    // 날짜 입력칸 값('YYYY-MM-DD'). '다른 날'의 min(오늘)·max(+7일)에 쓴다.
    window.urgentDateInputValue = function (ms) {
        var d = new Date(ms);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    };

    // 마감 표시의 재료: { key, params: { time, n, dow } } | null.
    //   같은 날 → ug_until_today · 다음 날 → ug_until_tomorrow · 그 뒤 → ug_until_day(D-n)
    // 날짜 차이는 기기 달력 날짜로 센다(24시간 단위가 아니라). 기한이 없거나 지났으면 null.
    window.urgentDeadlineParts = function (untilMs, nowMs) {
        if (untilMs == null || !isFinite(untilMs)) return null;
        var now = nowMs == null ? Date.now() : nowMs;
        if (untilMs <= now) return null;
        var n = Math.round((localMidnight(untilMs) - localMidnight(now)) / DAY);
        var u = new Date(untilMs);
        var params = { time: hhmm(u), n: n, dow: u.getDay() };
        if (n <= 0) return { key: 'ug_until_today', params: params };
        if (n === 1) return { key: 'ug_until_tomorrow', params: params };
        return { key: 'ug_until_day', params: params };
    };

    // 팀의 급구 마감 글자. 예전 급구(urgent_until 없음)는 ''.
    window.urgentDeadlineLabel = function (club, nowMs) {
        var until = club ? window.tsMillis(club.urgent_until) : null;
        var p = window.urgentDeadlineParts(until, nowMs);
        if (!p || !window.tf) return '';
        var dayName = window.i18nDay ? window.i18nDay(KO_DAYS[p.params.dow]) : KO_DAYS[p.params.dow];
        return window.tf(p.key, { time: p.params.time, n: p.params.n, day: dayName });
    };

    // 🍚 식구 모집(회원 모집) 중인가. 단순한 표시라 is_recruiting 하나로 본다(pure.js · 앱과 같다).
    window.isRecruitingActive = function (club) {
        return !!club && club.is_recruiting === true;
    };
})();
