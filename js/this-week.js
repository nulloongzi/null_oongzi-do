// this-week.js
// 🍚 여기 자리 있어요?(이전 이름 '이번 주 차림표' — 키·파일은 tw_* · this-week)의 순수 계산(화면을 만지지 않는다). classic script, window.* 전역.
// 앞으로 7일 안에 "가서 뛸 수 있는 곳"을 한 줄로 세운다:
//   - 'guest'   🔥 게스트 급구 — 급구가 떠 있는 팀. 끝 = urgent_until
//   - 'drop_in' 🥄 맛보기 환영 — 식구 모집 + 맛보기를 켠 팀의 운동(팀당 3개까지)
//   - 'pickup'  픽업 — 만료 안 된 픽업 스팟의 운동(크루당 3개까지)
// 항목 = { kind, start(ms|null), end(ms), title, place, msg, refId, refType:'club'|'pickup' }
// 앱(Flutter)도 같은 규칙으로 만든다(공통 계약). 화면(띠·시트)은 this-week-ui.js 가 그린다.
// Depends on: dom-utils.js (tsMillis · isUrgentActive), urgent.js (isRecruitingActive · URGENT_MIN_LEAD_MS)

(function () {
    var MIN = 60 * 1000;
    var DAY = 24 * 60 * MIN;
    window.TW_WINDOW_MS = 7 * DAY;
    window.TW_PER_REF_MAX = 3;
    var KIND_ORDER = { guest: 0, drop_in: 1, pickup: 2 };
    var KO_DAYS = ['일', '월', '화', '수', '목', '금', '토']; // Date.getDay() 순서
    var WEEK = ['월', '화', '수', '목', '금', '토', '일'];

    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    window.twHhmm = function (ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
    // 기기 달력 날짜의 자정(ms) — 시트의 날짜 묶음·날짜 칩 열쇠
    window.twDayKey = function (ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    window.twWeekdayKo = function (ms) { return KO_DAYS[new Date(ms).getDay()]; };

    function hm(s) {
        var m = /(\d{1,2}):(\d{2})/.exec(String(s || ''));
        return m ? { h: +m[1], m: +m[2] } : null;
    }

    // 일정 → 요일별 시간 칸 [{ day:'월', startH, startM, endH, endM }].
    // schedule_raw([{day,start,end}])가 있으면 그걸(가장 정확, 앱 eventsFromRaw 와 같은 순서),
    // 없으면 글자(schedule → schedule_text)를 parseText(= parseScheduleText)로 읽는다.
    window.twScheduleSlots = function (doc, parseText) {
        var out = [];
        if (!doc) return out;
        if (Array.isArray(doc.schedule_raw) && doc.schedule_raw.length) {
            doc.schedule_raw.forEach(function (r) {
                if (!r || WEEK.indexOf(r.day) === -1) return;
                var s = hm(r.start), e = hm(r.end);
                if (!s || !e) return;
                out.push({ day: r.day, startH: s.h, startM: s.m, endH: e.h, endM: e.m });
            });
            if (out.length) return out;
        }
        var text = doc.schedule || doc.schedule_text || '';
        var map = (parseText && text) ? (parseText(text) || {}) : {};
        WEEK.forEach(function (d) {
            var v = map[d];
            if (v) out.push({ day: d, startH: v.startH, startM: v.startM, endH: v.endH, endM: v.endM });
        });
        return out;
    };

    // 시간 칸들의 실제 회차(기기 시각). 끝이 시작보다 이르면(22:00~01:00) 다음 날 끝난다.
    // 어제 시작해 오늘 새벽 끝나는 회차도 잡으려고 어제부터 본다(urgentNextSessions 와 같다).
    window.twOccurrences = function (slots, fromMs, days) {
        var base = new Date(fromMs);
        var out = [];
        for (var off = -1; off <= days; off++) {
            var day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + off);
            var dk = KO_DAYS[day.getDay()];
            (slots || []).forEach(function (sl) {
                if (sl.day !== dk) return;
                var start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sl.startH, sl.startM).getTime();
                var end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sl.endH, sl.endM).getTime();
                if (end <= start) end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, sl.endH, sl.endM).getTime();
                out.push({ start: start, end: end });
            });
        }
        out.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
        // 같은 회차가 두 줄로 적힌 일정(raw 중복)은 하나로
        return out.filter(function (o, i) { return i === 0 || o.start !== out[i - 1].start || o.end !== out[i - 1].end; });
    };

    // '여기 자리 있어요?' 창: 끝이 now+5분 뒤 ~ now+7일 안인 회차(급구 칩과 같은 기준)
    function inWindow(o, now) {
        return o.end > now + (window.URGENT_MIN_LEAD_MS || 5 * MIN) && o.end <= now + window.TW_WINDOW_MS;
    }

    // 주소 → 짧은 곳 이름: 앞 두 낱말("서울 성북구 …" → "서울 성북구")
    window.twShortPlace = function (addr) {
        var parts = String(addr || '').trim().split(/\s+/).filter(Boolean);
        return parts.slice(0, 2).join(' ');
    };

    function trimStr(v) { return typeof v === 'string' ? v.trim() : ''; }

    // 연락 출처 표시(GA contact_click 의 flag): 누른 순간 팀 상태
    window.contactFlag = function (club, nowMs) {
        if (!club) return 'none';
        if (window.isUrgentActive(club, nowMs)) return 'guest';
        if (window.isRecruitingActive(club)) return club.recruit_drop_in === true ? 'drop_in' : 'recruit';
        return 'none';
    };

    // 🥄 맛보기 환영이 화면에 뜨는가 — 식구 모집이 켜져 있을 때만
    window.isDropInActive = function (club) {
        return window.isRecruitingActive(club) && club.recruit_drop_in === true;
    };

    // 지도 라벨·미리보기 제목 앞 표시: 🔥(게스트 급구) → 🍚(식구 모집) → 🥄(맛보기 환영). 없으면 ''
    window.clubFlagMarks = function (club, nowMs) {
        var m = '';
        if (window.isUrgentActive(club, nowMs)) m += '🔥';
        if (window.isRecruitingActive(club)) m += '🍚';
        if (window.isDropInActive(club)) m += '🥄';
        return m;
    };

    // '여기 자리 있어요?' 항목. input = { clubs, pickups, parseText }. 시간순((start ?? end) 오름차순).
    window.thisWeekItems = function (input, nowMs) {
        var now = nowMs == null ? Date.now() : nowMs;
        var parseText = input && input.parseText;
        var items = [];

        (input && input.clubs || []).forEach(function (c) {
            if (!c || c.id == null) return;
            var slots = null;
            function clubSlots() { if (!slots) slots = window.twScheduleSlots(c, parseText); return slots; }
            var guestEnd = null;
            if (window.isUrgentActive(c, now)) {
                // 기한 없는 예전 급구는 뺀다 — 매시간 정리가 곧 7일 기한을 붙인다
                var until = window.tsMillis(c.urgent_until);
                if (until != null) {
                    guestEnd = until;
                    // 시작 = 끝이 급구 기한과 같은 회차(같은 날·같은 시각). 없으면 null("~21:00")
                    var match = window.twOccurrences(clubSlots(), now, 8).filter(function (o) { return o.end === until; })[0];
                    items.push({
                        kind: 'guest', start: match ? match.start : null, end: until,
                        title: c.name || '', place: window.twShortPlace(c.address),
                        msg: trimStr(c.urgent_msg), refId: c.id, refType: 'club'
                    });
                }
            }
            if (window.isDropInActive(c)) {
                window.twOccurrences(clubSlots(), now, 7)
                    .filter(function (o) { return inWindow(o, now) && o.end !== guestEnd; })
                    .slice(0, window.TW_PER_REF_MAX)
                    .forEach(function (o) {
                        items.push({
                            kind: 'drop_in', start: o.start, end: o.end,
                            title: c.name || '', place: window.twShortPlace(c.address),
                            msg: trimStr(c.recruit_msg), refId: c.id, refType: 'club'
                        });
                    });
            }
        });

        (input && input.pickups || []).forEach(function (g) {
            if (!g || g.id == null) return;
            var exp = window.tsMillis(g.expire_at);
            if (exp != null && exp <= now) return;
            window.twOccurrences(window.twScheduleSlots(g, parseText), now, 7)
                .filter(function (o) { return inWindow(o, now); })
                .slice(0, window.TW_PER_REF_MAX)
                .forEach(function (o) {
                    items.push({
                        kind: 'pickup', start: o.start, end: o.end,
                        title: g.title || '', place: trimStr(g.venue_name) || trimStr(g.region) || window.twShortPlace(g.address),
                        msg: trimStr(g.this_week), refId: g.id, refType: 'pickup'
                    });
                });
        });

        return items.map(function (it, i) { return { it: it, i: i }; }).sort(function (a, b) {
            var ta = a.it.start != null ? a.it.start : a.it.end;
            var tb = b.it.start != null ? b.it.start : b.it.end;
            if (ta !== tb) return ta - tb;
            if (a.it.kind !== b.it.kind) return KIND_ORDER[a.it.kind] - KIND_ORDER[b.it.kind];
            return a.i - b.i;
        }).map(function (x) { return x.it; });
    };

    // 항목의 정렬·묶음 시각
    window.twItemTime = function (it) { return it.start != null ? it.start : it.end; };

    // 띠에 적는 '{n}곳' — 서로 다른 팀·크루 수
    window.twPlaceCount = function (items) {
        var seen = {};
        (items || []).forEach(function (it) { seen[it.refType + ':' + it.refId] = true; });
        return Object.keys(seen).length;
    };

    // 시트 칩으로 거르기. kinds = { guest, drop_in, pickup }(true 만 남김), day = 자정 ms 또는 null(전체)
    window.twFilterItems = function (items, kinds, day) {
        return (items || []).filter(function (it) {
            if (kinds && kinds[it.kind] === false) return false;
            if (day != null && window.twDayKey(window.twItemTime(it)) !== day) return false;
            return true;
        });
    };

    // 날짜 칩: 오늘부터 7일(항목이 7일째 뒤 새벽까지 있으면 그날까지)
    window.twDayChips = function (items, nowMs) {
        var today = window.twDayKey(nowMs == null ? Date.now() : nowMs);
        var last = today + 6 * DAY;
        (items || []).forEach(function (it) {
            var k = window.twDayKey(window.twItemTime(it));
            if (k > last) last = k;
        });
        var out = [];
        var d0 = new Date(today);
        for (var i = 0; ; i++) {
            var k2 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i).getTime(); // 서머타임에도 자정
            if (k2 > last) break;
            out.push(k2);
        }
        return out;
    };

    // 날짜별 묶음 [{ day: 자정 ms, items: [...] }] — 이미 시간순인 목록을 받는다
    window.twGroupByDay = function (items) {
        var groups = [];
        (items || []).forEach(function (it) {
            var k = window.twDayKey(window.twItemTime(it));
            var g = groups.length ? groups[groups.length - 1] : null;
            if (!g || g.day !== k) { g = { day: k, items: [] }; groups.push(g); }
            g.items.push(it);
        });
        return groups;
    };
})();
