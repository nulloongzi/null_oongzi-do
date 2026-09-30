// my-card.js
// 포장하기 — 내 공유 이미지 (Canvas 2D 직접 렌더).
//
// 왜 html2canvas가 아닌가: 이전 판은 화면의 DOM을 복제해 transform:scale(2.8)로
// 키워 찍었다. transform은 레이아웃 박스를 바꾸지 않아서 flex 배치와 시각 크기가
// 어긋났고, 그걸 padding-bottom:450px 같은 보정으로 덮다가 결국
//   · 네임카드가 도시락통보다 작게 나오고
//   · 카드 배경이 확대 아티팩트로 깨지고
//   · 빈 칸의 "국을 담아주세요" 같은 입력 유도 문구가 공유 이미지에 그대로 나가고
//   · QR/유입 경로가 아예 빠지는
// 상태가 됐다. 클럽 스토리 카드(share.js generateStoryCard)는 이미 canvas로
// 그리고 있어서, 같은 기법·같은 헬퍼로 통일한다.
//
// 두 장 — 목적으로 나눈다(규격은 둘 다 스토리 9:16, docs/design-system.md §7-4):
//   · 네임카드 'card' — "나는 어떤 밥이야". 밥색 필드(밥도감 번호·희귀도·밥 이름·한 줄 성격·
//     밥이름·대표팀) + 도시락통 + 밥도감(내 밥상 5×5 도장판 · 상차림 단계)
//   · 식단표 'diet'  — "나 이번 주 이때 운동해". 한 줄 헤드라인(화·목·토 저녁형) + 시간표
// 밥친구는 밥도감의 '밥 종류'로만 들어간다 — 친구 이름·팀·요일·시간은 어느 카드에도 없다.
// 머리글·스텁(QR)·그림자·글자 크기는 share.js 의 공유 카드 키트를 그대로 쓴다.
//
// 도시락통 배치는 화면 UI(css .lunchbox-grid)와 같은 그리드를 쓴다 — 공유 이미지가
// 앱에서 보던 그 도시락통과 다른 물건으로 보이면 안 된다.
//
// Depends on: share.js (storyLoadImage/storyRoundRect/storyDrawQR/storyWrapLines,
//             SITE_BASE_URL), lunchbox.js (window.getShareSlots), data.js (findClub),
//             i18n.js, profile.js (window.currentProfileData, window.riceDex),
//             friends.js (window.loadFriendRices)

(function () {
    var W = 1080, PAD = 80, PAD_W = W - PAD * 2;
    var INK = '#3D2C22', SUB = '#A99A8C', DARK = '#4E342E', BROWN = '#8D6E63', CARD = '#FFFDF8';

    // 도시락 칸 색 — 화면 UI·식단표 블록과 같은 색이어야 도시락통이 곧 범례가 된다.
    var RAIL = ['#FBC02D', '#F57C00', '#689F38', '#D84315', '#8E24AA'];
    var SLOTBG = ['#FFFDE7', '#FFF3E0', '#F1F8E9', '#FBE9E7', '#F3E5F5'];
    // 식단표 블록: 칸 배경과 레일 색의 45% 혼합 — 옅은 배경은 작게 보면 선처럼 읽힌다(앱과 같은 값).
    var SLOTFILL = ['#FDE293', '#FABD7B', '#B3D099', '#EB9E88', '#C68ED3'];

    // 화면 UI(.lunchbox-grid)와 같은 6열 그리드.
    //   행1: 반찬 3칸(각 2열)   행2: 밥(1~3열) | 국(4~6열)  ← 밥·국은 좌우
    // slot 인덱스는 lunchbox.js 의 슬롯 배열과 같다(0=밥 1=국 2~4=반찬).
    var GRID = [
        { slot: 2, row: 0, col: 0, span: 2, key: 'mc_side1' },
        { slot: 3, row: 0, col: 2, span: 2, key: 'mc_side2' },
        { slot: 4, row: 0, col: 4, span: 2, key: 'mc_side3' },
        { slot: 0, row: 1, col: 0, span: 3, key: 'mc_rice' },
        { slot: 1, row: 1, col: 3, span: 3, key: 'mc_soup' }
    ];
    var ROW_FR = [0.8, 1.2]; // 아래(밥·국)가 더 크다 — 화면 UI와 같은 비율
    var DAYS = ['월', '화', '수', '목', '금', '토', '일'];
    var LEGEND_BLUE = '#81D4FA';   // 전설(밥아저씨) — 도감에서 혼자 다른 색이 맞다
    // 규격: 9:16(1080×1920)이되 스토리 안전영역(위아래 250)을 다 비우지 않는다 — 위아래 140.
    // 앱은 인스타 스토리에 '스티커'로 붙이고(배경 위에 축소돼 얹힌다) 웹은 이미지로 저장하니
    // 250을 비워 두면 위아래 빈 띠만 남는다. 다만 저장본을 스토리 배경으로 꽉 채워 올리면
    // 위는 진행 바·프로필 줄, 아래는 답장 바가 덮으니 위아래 조금씩(140) 남긴다.
    var FMT = { h: 1920, top: 140, bottom: 140, qr: 172 };

    function fnt(px, wt) { return window.cardFont(px, wt); }
    function T(k) { return window.t ? window.t(k) : k; }
    function TF(k, p) { return window.tf ? window.tf(k, p) : k; }
    function rr(ctx, x, y, w, h, r) { window.storyRoundRect(ctx, x, y, w, h, r); }

    // 한 줄 말줄임
    function ellip(ctx, text, maxW) {
        text = String(text == null ? '' : text);
        if (ctx.measureText(text).width <= maxW) return text;
        var s = text;
        while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
        return s + '…';
    }
    // 폭에 맞을 때까지 폰트를 줄인다. 밥이름은 길이가 제각각이라, 네임카드의 이름은
    // 말줄임보다 축소가 낫다("현미밥맛있어-a3k" 가 "현미밥맛…"으로 나가면 안 된다).
    function fitFont(ctx, text, maxW, size, min, wt) {
        var sz = size;
        while (sz > min) {
            ctx.font = fnt(sz, wt);
            if (ctx.measureText(text).width <= maxW) return sz;
            sz -= 2;
        }
        ctx.font = fnt(min, wt);
        return min;
    }

    // 공백이 있으면 단어 경계 우선으로 접는다. 없으면(붙여 쓴 한글) 글자 단위 —
    // "월요 리시브반"이 "월요 리 / 시브반"으로 쪼개지면 읽기 나쁘다.
    function wrapWords(ctx, text, maxW, maxLines) {
        var words = String(text == null ? '' : text).split(' ');
        if (words.length < 2) return window.storyWrapLines(ctx, text, maxW, maxLines);
        var lines = [], cur = '';
        for (var i = 0; i < words.length; i++) {
            var cand = cur ? cur + ' ' + words[i] : words[i];
            if (ctx.measureText(cand).width <= maxW) { cur = cand; continue; }
            if (cur) lines.push(cur);
            cur = words[i];
            if (lines.length >= maxLines) break;
        }
        if (cur && lines.length < maxLines) lines.push(cur);
        if (lines.length > maxLines) lines = lines.slice(0, maxLines);
        if (lines.length) lines[lines.length - 1] = ellip(ctx, lines[lines.length - 1], maxW);
        return lines;
    }

    // ── 데이터 수집 ────────────────────────────────────────────────
    // 화면에 보이는 것과 같은 슬롯을 쓴다(편집 중이면 tempSlots).
    // friendRices: 밥친구 전체의 밥 이름(window.loadFriendRices). 밥도감 칸을 채우는 데만 쓴다.
    window.buildMyCardData = function (friendRices) {
        var p = window.currentProfileData || {};
        var slots = (window.getShareSlots ? window.getShareSlots() : null) || [null, null, null, null, null];

        var names = [], events = [];
        for (var i = 0; i < 5; i++) {
            var id = slots[i];
            if (id == null) { names.push(null); continue; }
            var team = window.findClub ? window.findClub(id) : null;
            if (!team) { names.push(window.t('deleted_team') || '삭제된 팀'); continue; }
            names.push(team.name || '');
            if (window.parseScheduleText) {
                var map = window.parseScheduleText(team.schedule) || {};
                for (var day in map) {
                    if (!Object.prototype.hasOwnProperty.call(map, day)) continue;
                    var d = map[day];
                    var di = DAYS.indexOf(day);
                    if (di < 0) continue;
                    events.push({
                        day: di,
                        start: d.startH + (d.startM || 0) / 60,
                        end: d.endH + (d.endM || 0) / 60,
                        slot: i,
                        name: team.name || ''
                    });
                }
            }
        }

        var joined = '';
        if (p.created_at) {
            var dt = window.toJsDate ? window.toJsDate(p.created_at) : new Date(p.created_at);
            if (dt && !isNaN(dt.getTime())) {
                joined = (window.t('joined') || '가입일: ') +
                    dt.getFullYear() + '.' + (dt.getMonth() + 1) + '.' + dt.getDate();
            }
        }
        var full = p.full_nickname || p.nickname || '';
        var riceType = p.nickname || (full ? full.split('-')[0] : '');
        var mainTeam = null;
        for (var k = 0; k < names.length; k++) { if (names[k]) { mainTeam = names[k]; break; } }

        return {
            nickname: full,
            riceType: riceType,
            // 화면 네임카드와 같은 해석기를 쓴다 — 색이 다르면 다른 물건으로 보인다
            bgColor: window.riceColorOf ? window.riceColorOf(riceType) : '#fff9c4',
            joined: joined,
            mainTeam: mainTeam,
            slots: names,
            events: events,
            dex: buildDex(riceType, friendRices || []),
            url: window.SITE_BASE_URL || 'https://do.nulloongzi.com/'
        };
    };

    // 밥도감: 나 + 밥친구 전체의 밥 종류. 도감에 없는 이름(운영자 닉네임 등)은 세지 않는다.
    function buildDex(riceType, friendRices) {
        var X = window.riceDex;
        if (!X) return null;
        var mine = X.info(riceType), owned = {}, count = 0;
        var all = [riceType].concat(friendRices);
        for (var i = 0; i < all.length; i++) {
            var it = X.info(all[i]);
            if (it && !owned[it.name]) { owned[it.name] = true; count++; }
        }
        return { mine: mine, owned: owned, count: count, total: X.total, list: X.list(), stage: X.stage(count) };
    }
    window.myCardDex = buildDex;

    // 식단표 헤드라인: 운동하는 요일 + 시간대 성향("화·목·토 저녁형"), 횟수·시간, 범례로 쓸 팀.
    function dietSummary(d) {
        var ev = d.events || [], days = [], seen = {}, hours = 0, eve = 0, noon = 0, morn = 0;
        for (var i = 0; i < ev.length; i++) {
            if (!seen[ev[i].day]) { seen[ev[i].day] = true; days.push(ev[i].day); }
            hours += Math.max(0, ev[i].end - ev[i].start);
            if (ev[i].start >= 17) eve++; else if (ev[i].start >= 12) noon++; else morn++;
        }
        days.sort(function (a, b) { return a - b; });
        var kind = eve >= noon && eve >= morn ? 'mc_kind_eve' : (noon >= morn ? 'mc_kind_noon' : 'mc_kind_morn');
        var head;
        if (!ev.length) head = T('mc_diet_empty');
        else if (days.length <= 4) {
            head = days.map(function (x) { return window.i18nDay ? window.i18nDay(DAYS[x]) : DAYS[x]; }).join('·') + ' ' + T(kind);
        } else head = TF('mc_diet_ndays', { n: days.length }) + ' ' + T(kind);
        var h = Math.round(hours * 2) / 2;
        var legend = [], used = {};
        for (var j = 0; j < ev.length; j++) {
            if (used[ev[j].slot]) continue;
            used[ev[j].slot] = true;
            legend.push({ slot: ev[j].slot, name: ev[j].name });
        }
        legend.sort(function (a, b) { return a.slot - b.slot; });
        return { head: head, sub: ev.length ? TF('mc_diet_sub', { n: ev.length, h: h }) : '', legend: legend };
    }
    window.myCardDietSummary = dietSummary;

    // ── 배치 ──────────────────────────────────────────────────────
    // 구조(두 장 공통, 스토리 9:16): 전폭 밥색 필드(히어로: 머리글 + 신원) / 본문 카드(필드
    // 아랫단을 덮음) / 티켓 스텁(QR). 규격·토큰은 docs/design-system.md §7, 앱 my_card.dart 와 같다.
    //   · 네임카드 — 신원(가운데 세로 스택) / 도시락통(탄력 280~760) / 밥도감(고정 324)
    //   · 식단표   — 신원(왼쪽 정렬: 밥이름 줄 · 헤드라인 · 요약 · 팀 범례) / 시간표(탄력)
    // 남는 세로는 탄력 요소가 먹는다 — 빈 크림 띠를 남기지 않는다.
    var BENTO = { min: 280, max: 760 };
    var DEX = { h: 324, cell: 44, gap: 10, cols: 5 };
    var ID_CARD = { chip: 52, gapC: 20, rice: 124, riceMin: 72, gapR: 18, line: 36, gapL: 22, nick: 34, gapK: 26, pill: 60 };
    var ID_DIET = { who: 48, gapW: 24, head: 84, headMin: 52, gapH: 12, sub: 38, gapS: 24, chip: 48 };

    function identityCardH(d) {
        var I = ID_CARD, h = I.rice + I.gapL + I.nick;
        if (d.dex && d.dex.mine) h += I.chip + I.gapC + I.gapR + I.line;
        if (d.mainTeam) h += I.gapK + I.pill;
        return h;
    }
    function identityDietH() {
        var I = ID_DIET;
        return I.who + I.gapW + I.head + I.gapH + I.sub + I.gapS + I.chip;
    }

    // 배치 계산(그리기와 분리 — 테스트·앱이 같은 값을 쓴다). mode: 'card' | 'diet'
    window.myCardLayout = function (d, mode) {
        var fmt = FMT;
        var SC = window.SHARE_CARD;
        var stubTop = window.cardStubTop(fmt);
        var headBot = fmt.top + SC.HEADER_H;
        var bodyBot = stubTop - SC.GAP;
        if (mode === 'diet') {
            var dh = identityDietH();
            var tY = headBot + 32 + dh + 40;
            return {
                mode: 'diet', fmt: fmt, stubTop: stubTop, headerY: fmt.top,
                field: { h: tY + SC.OVERLAP },
                identity: { x: SC.M, y: headBot + 32, w: PAD_W, h: dh },
                diet: { x: SC.M, y: tY, w: PAD_W, h: bodyBot - tY },
                bento: null, dex: null
            };
        }
        var idH = identityCardH(d);
        var dexY = bodyBot - DEX.h;
        var bentoBot = dexY - SC.GAP;
        var minTop = headBot + 32 + idH + 40;
        var bentoH = Math.max(BENTO.min, Math.min(BENTO.max, bentoBot - minTop));
        var cardY = bentoBot - bentoH;
        return {
            mode: 'card', fmt: fmt, stubTop: stubTop, headerY: fmt.top,
            field: { h: cardY + SC.OVERLAP },
            // 신원은 머리글 ~ 도시락통 사이 가운데 (남는 세로가 위아래로 고르게)
            identity: { x: SC.M, y: headBot + (cardY - headBot - idH) / 2, w: PAD_W, h: idH },
            bento: { x: SC.M, y: cardY, w: PAD_W, h: bentoH },
            dex: { x: SC.M, y: dexY, w: PAD_W, h: DEX.h },
            diet: null
        };
    };

    // ── 그리기 ────────────────────────────────────────────────────
    function drawCard(ctx, d, mode, logo) {
        var L = window.myCardLayout(d, mode);
        window.cardBackground(ctx, L.fmt.h);
        drawField(ctx, L.field.h, d);
        window.cardHeader(ctx, L.headerY, logo);
        if (mode === 'diet') {
            drawIdentityDiet(ctx, L.identity, d);
            drawTimetable(ctx, L.diet, d, false);
            window.cardStub(ctx, L.fmt, d.url, T('mc_cta_diet'));
        } else {
            drawIdentityCard(ctx, L.identity, d);
            drawBento(ctx, L.bento, d, L.bento.h < 440);
            drawDex(ctx, L.dex, d);
            window.cardStub(ctx, L.fmt, d.url, T('mc_cta'));
        }
    }

    // 밥색 필드: 프로필 밥 색 + 밝힘 + 밥알 무늬(좌표 시드 고정 → 매번 같은 그림).
    function drawField(ctx, h, d) {
        ctx.fillStyle = d.bgColor || '#FFF9C4'; ctx.fillRect(0, 0, W, h);
        // 밥 색이 어떤 값이든 글씨가 읽히도록 살짝 밝힌다
        ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.fillRect(0, 0, W, h);
        var seed = 7;
        function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (var i = 0; i < 70; i++) {
            ctx.save(); ctx.translate(rnd() * W, rnd() * h); ctx.rotate(rnd() * Math.PI);
            ctx.beginPath(); ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        var fade = ctx.createLinearGradient(0, h - 160, 0, h);
        fade.addColorStop(0, 'rgba(251,243,226,0)'); fade.addColorStop(1, 'rgba(251,243,226,1)');
        ctx.fillStyle = fade; ctx.fillRect(0, h - 160, W, 160);
    }

    // 대표팀 알약: 배구공(벡터) + 팀 이름. align: 'center' | 'left'
    function teamPill(ctx, x, y, h, label, maxW, align) {
        var fs = h >= 60 ? 28 : 25;
        ctx.font = fnt(fs, 700);
        var ico = h * 0.44;
        var lb = ellip(ctx, label, maxW - (24 + ico + 12 + 26));
        var pw = 24 + ico + 12 + ctx.measureText(lb).width + 26;
        var px = align === 'center' ? x - pw / 2 : x;
        window.cardPill(ctx, px, y, pw, h);
        window.cardVolley(ctx, px + 24 + ico / 2, y + h / 2, ico / 2, '#E0A800');
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = DARK;
        ctx.fillText(lb, px + 24 + ico + 12, y + h / 2 + 1);
        ctx.textBaseline = 'top';
    }

    function card(ctx, r) {
        window.storyRoundRect(ctx, r.x, r.y, r.w, r.h, 28);
        ctx.fillStyle = CARD; window.cardShadow(ctx, false); ctx.fill(); window.cardNoShadow(ctx);
    }

    function sectionTitle(ctx, x, y, text, right, w) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = fnt(32, 800); ctx.fillStyle = INK;
        ctx.fillText(text, x, y);
        if (right) {
            ctx.font = fnt(24, 700); ctx.fillStyle = SUB; ctx.textAlign = 'right';
            ctx.fillText(right, x + w, y + 6);
            ctx.textAlign = 'left';
        }
    }

    // 가운데 정렬 알약 한 줄(밥도감 번호 · 희귀도). 각 { text, bg, fg }
    function chipRow(ctx, cx, y, h, chips) {
        ctx.font = fnt(24, 800);
        var gap = 12, ws = [], total = 0;
        for (var i = 0; i < chips.length; i++) { ws[i] = ctx.measureText(chips[i].text).width + 44; total += ws[i]; }
        total += gap * (chips.length - 1);
        var x = cx - total / 2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var j = 0; j < chips.length; j++) {
            rr(ctx, x, y, ws[j], h, h / 2); ctx.fillStyle = chips[j].bg; ctx.fill();
            ctx.fillStyle = chips[j].fg; ctx.fillText(chips[j].text, x + ws[j] / 2, y + h / 2 + 1);
            x += ws[j] + gap;
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // 네임카드 신원: [밥도감 No.01 · 흔함] / 밥 이름(크게) / 한 줄 성격 / 밥이름 · 가입일 / 대표팀
    function drawIdentityCard(ctx, r, d) {
        var I = ID_CARD, cx = r.x + r.w / 2, y = r.y, mine = d.dex && d.dex.mine;
        if (mine) {
            chipRow(ctx, cx, y, I.chip, [
                { text: TF('dex_no', { n: pad2(mine.no) }), bg: INK, fg: CARD },
                { text: T('dex_r_' + mine.rarity), bg: mine.rarity === 'legend' ? LEGEND_BLUE : CARD, fg: mine.rarity === 'legend' ? INK : BROWN }
            ]);
            y += I.chip + I.gapC;
        }
        fitFont(ctx, d.riceType, r.w, I.rice, I.riceMin, 900);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
        ctx.fillText(ellip(ctx, d.riceType, r.w), cx, y + I.rice / 2);
        y += I.rice;
        if (mine) {
            y += I.gapR;
            ctx.font = fnt(32, 600); ctx.fillStyle = DARK;
            ctx.fillText(ellip(ctx, T('rice_line_' + mine.no), r.w), cx, y + I.line / 2);
            y += I.line;
        }
        y += I.gapL;
        ctx.font = fnt(28, 700); ctx.fillStyle = BROWN;
        ctx.fillText(ellip(ctx, d.nickname + (d.joined ? '  ·  ' + d.joined : ''), r.w), cx, y + I.nick / 2);
        y += I.nick;
        if (d.mainTeam) { y += I.gapK; teamPill(ctx, cx, y, I.pill, d.mainTeam, r.w, 'center'); }
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
    function pad2(n) { return n < 10 ? '0' + n : String(n); }

    // 밥도감: 왼쪽 5×5 도장판(모은 밥은 그 밥 색, 나는 굵은 먹색 테두리, 못 모은 칸은 점선),
    // 오른쪽 상차림 단계 · 모은 수 · 다음 단계까지.
    function drawDex(ctx, r, d) {
        card(ctx, r);
        var X = d.dex;
        if (!X) return;
        var n = X.list.length, cols = DEX.cols, rows = Math.ceil(n / cols);
        var gw = cols * DEX.cell + (cols - 1) * DEX.gap, gh = rows * DEX.cell + (rows - 1) * DEX.gap;
        var gx = r.x + 40, gy = r.y + (r.h - gh) / 2, rad = DEX.cell / 2;
        for (var i = 0; i < n; i++) {
            var it = X.list[i];
            var cx = gx + (i % cols) * (DEX.cell + DEX.gap) + rad, cy = gy + Math.floor(i / cols) * (DEX.cell + DEX.gap) + rad;
            var isMine = X.mine && X.mine.no === it.no;
            ctx.beginPath(); ctx.arc(cx, cy, rad - 2, 0, Math.PI * 2);
            if (X.owned[it.name]) {
                ctx.fillStyle = it.color; ctx.fill();
                ctx.lineWidth = isMine ? 6 : 3; ctx.strokeStyle = isMine ? INK : BROWN; ctx.stroke();
            } else {
                ctx.setLineDash([6, 6]); ctx.lineWidth = 3;
                ctx.strokeStyle = it.rarity === 'legend' ? LEGEND_BLUE : 'rgba(141,110,99,.4)';
                ctx.stroke(); ctx.setLineDash([]);
            }
        }
        var tx = gx + gw + 44, tw = r.x + r.w - 36 - tx;
        var st = X.stage, lv = Math.max(1, st.lv);
        var blockH = 30 + 10 + 72 + 8 + 38 + 12 + 30;
        var y = r.y + (r.h - blockH) / 2;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = fnt(24, 800); ctx.fillStyle = BROWN;
        ctx.fillText(ellip(ctx, T('dex_title'), tw), tx, y + 15);
        y += 30 + 10;
        fitFont(ctx, T('dex_st_' + lv), tw, 64, 40, 900); ctx.fillStyle = INK;
        ctx.fillText(ellip(ctx, T('dex_st_' + lv), tw), tx, y + 36);
        y += 72 + 8;
        ctx.font = fnt(32, 800); ctx.fillStyle = INK;
        ctx.fillText(ellip(ctx, TF('dex_count', { n: X.count, total: X.total }), tw), tx, y + 19);
        y += 38 + 12;
        ctx.font = fnt(24, 600); ctx.fillStyle = BROWN;
        var nextTxt = st.next ? TF('dex_next', { stage: T('dex_st_' + st.next), n: st.need }) : T('dex_done');
        ctx.fillText(ellip(ctx, nextTxt, tw), tx, y + 15);
        ctx.textBaseline = 'top';
    }

    // 식단표 신원: (밥 색 점) 밥이름 / 헤드라인 / 주 N회 · N시간 / 팀 범례(도시락 칸 색)
    function drawIdentityDiet(ctx, r, d) {
        var I = ID_DIET, S = dietSummary(d), y = r.y;
        ctx.beginPath(); ctx.arc(r.x + 20, y + I.who / 2, 20, 0, Math.PI * 2);
        ctx.fillStyle = d.bgColor || '#FFF9C4'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = BROWN; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = fnt(30, 800); ctx.fillStyle = INK;
        ctx.fillText(ellip(ctx, d.nickname, r.w - 56), r.x + 56, y + I.who / 2 + 1);
        y += I.who + I.gapW;
        fitFont(ctx, S.head, r.w, 76, I.headMin, 900); ctx.fillStyle = INK;
        ctx.fillText(ellip(ctx, S.head, r.w), r.x, y + I.head / 2);
        y += I.head + I.gapH;
        if (S.sub) {
            ctx.font = fnt(32, 700); ctx.fillStyle = DARK;
            ctx.fillText(ellip(ctx, S.sub, r.w), r.x, y + I.sub / 2);
        }
        y += I.sub + I.gapS;
        var n = S.legend.length, gap = 12;
        if (n) {
            var maxW = (r.w - gap * (n - 1)) / n, x = r.x;
            ctx.font = fnt(24, 800);
            for (var i = 0; i < n; i++) {
                var lb = ellip(ctx, S.legend[i].name, maxW - 64);
                var w = ctx.measureText(lb).width + 64;
                window.cardPill(ctx, x, y, w, I.chip);
                ctx.beginPath(); ctx.arc(x + 28, y + I.chip / 2, 9, 0, Math.PI * 2);
                ctx.fillStyle = RAIL[S.legend[i].slot % 5]; ctx.fill();
                ctx.fillStyle = INK; ctx.textBaseline = 'middle';
                ctx.fillText(lb, x + 46, y + I.chip / 2 + 1);
                x += w + gap;
            }
        }
        ctx.textBaseline = 'top';
    }

    // 도시락통 — 화면 UI(.lunchbox-grid)와 같은 6열 그리드
    function drawBento(ctx, r, d, compact) {
        card(ctx, r);
        var ip = 32, ix = r.x + ip, iw = r.w - ip * 2;
        var filled = 0;
        for (var i = 0; i < d.slots.length; i++) if (d.slots[i]) filled++;
        sectionTitle(ctx, ix, r.y + ip, window.t('mc_lunchbox') || '도시락', filled + ' / 5', iw);
        var cy = r.y + ip + 32 + 20;
        var gap = 14;
        var gridH = (r.y + r.h - ip) - cy;
        var colW = (iw - gap * 5) / 6;
        var unit = (gridH - gap) / (ROW_FR[0] + ROW_FR[1]);
        var rowH = [ROW_FR[0] * unit, ROW_FR[1] * unit];
        var rowY = [cy, cy + rowH[0] + gap];
        for (var k = 0; k < GRID.length; k++) {
            var g = GRID[k];
            drawCell(ctx, ix + (colW + gap) * g.col, rowY[g.row], colW * g.span + gap * (g.span - 1), rowH[g.row], g, d, compact);
        }
    }

    function drawCell(ctx, x, y, w, h, g, d, compact) {
        var name = d.slots[g.slot];
        // 캔버스에는 이모지를 쓰지 않는다(앱 캔버스에서 □로 깨진다) — 라벨의 이모지를 뺀다.
        var label = window.storyStripEmoji ? window.storyStripEmoji(window.t(g.key)) : window.t(g.key);
        if (!name) {
            // 빈 칸: 점선 + 키워드만. 화면 UI의 "국을 담아주세요" 같은 입력 유도 문구는
            // 공유물이 아니다 — 받아 보는 사람에게 하는 말처럼 읽힌다.
            rr(ctx, x, y, w, h, 16);
            ctx.fillStyle = 'rgba(141,110,99,.05)'; ctx.fill();
            ctx.setLineDash([10, 8]); ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(141,110,99,.28)'; ctx.stroke(); ctx.setLineDash([]);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = fnt(24, 700); ctx.fillStyle = 'rgba(141,110,99,.5)';
            ctx.fillText(label, x + w / 2, y + h / 2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            return;
        }
        rr(ctx, x, y, w, h, 16); ctx.fillStyle = SLOTBG[g.slot]; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = RAIL[g.slot]; ctx.stroke();
        ctx.save(); rr(ctx, x, y, w, h, 16); ctx.clip();
        ctx.fillStyle = RAIL[g.slot]; ctx.fillRect(x, y, 10, h);
        // 낮은 칸(네임카드의 반찬 줄)은 라벨을 빼고 이름만 — 라벨과 이름이 겹친다. 칸 색이 곧 밥·국·반찬이다.
        var showLabel = h >= 80;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        if (showLabel) {
            ctx.font = fnt(20, 700); ctx.fillStyle = 'rgba(61,44,34,.4)';
            ctx.fillText(label, x + 22, y + 12);
        }
        var big = g.span >= 3;
        var fs = compact ? (big ? 30 : 24) : (big ? 36 : 28);   // 네임카드는 도시락통 아래 밥도감이 있어 낮다 → compact
        var lh = Math.round(fs * 1.22);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = fnt(fs, 800); ctx.fillStyle = INK;
        var lines = wrapWords(ctx, name, w - 40, 2);
        var sy = y + h / 2 + (showLabel ? 10 : 0) - (lines.length - 1) * lh / 2;
        for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + w / 2 + 5, sy + i * lh);
        ctx.restore();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // 겹치는 일정은 칸을 레인으로 나눠 나란히 (앱 assignLanes 와 같은 규칙).
    // 반환: 각 이벤트의 { lane, lanes }. 같은 시간대에 겹치는 무리 안에서 레인 수를 맞춘다.
    function assignLanes(evs) {
        var out = [], group = [], groupEnd = -1, laneEnds = [];
        function flush() {
            for (var g = 0; g < group.length; g++) out[group[g]].lanes = laneEnds.length;
            group = []; laneEnds = [];
        }
        for (var i = 0; i < evs.length; i++) {
            var e = evs[i];
            if (group.length && e.start >= groupEnd) flush();
            var lane = -1;
            for (var l = 0; l < laneEnds.length; l++) if (laneEnds[l] <= e.start) { lane = l; break; }
            if (lane < 0) { lane = laneEnds.length; laneEnds.push(e.end); } else laneEnds[lane] = e.end;
            out[i] = { lane: lane, lanes: 1 };
            group.push(i);
            groupEnd = Math.max(groupEnd, e.end);
        }
        flush();
        return out;
    }
    window.myCardAssignLanes = assignLanes;

    // 식단표 시간표. 블록 색이 도시락 칸 색과 같아 도시락통(식단표 카드에선 팀 범례)이 곧 범례가 된다.
    // withTitle: 칸 제목('식단표')을 그릴지 — 식단표 카드는 헤드라인이 제목이라 뺀다.
    function drawTimetable(ctx, r, d, withTitle) {
        card(ctx, r);
        var ip = 32, ix = r.x + ip, iw = r.w - ip * 2;
        if (withTitle) sectionTitle(ctx, ix, r.y + ip, window.t('mc_timetable') || '식단표', '', iw);
        var top = withTitle ? r.y + ip + 32 + 20 : r.y + ip;
        if (!d.events.length) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = fnt(26, 500); ctx.fillStyle = SUB;
            ctx.fillText(window.t('mc_no_sched') || '찜한 팀의 일정이 없어요', r.x + r.w / 2, (top + r.y + r.h - ip) / 2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            return;
        }
        var minH = 24, maxH = 0;
        for (var i = 0; i < d.events.length; i++) {
            if (d.events[i].start < minH) minH = d.events[i].start;
            if (d.events[i].end > maxH) maxH = d.events[i].end;
        }
        var H0 = Math.min(22, Math.max(6, Math.floor(minH) - 1));
        var H1 = Math.min(24, Math.max(H0 + 3, Math.ceil(maxH) + 1));
        var hours = H1 - H0;
        var headH = 36, timeW = 44;
        var gx = ix + timeW, gy = top + headH, gw = iw - timeW, gh = (r.y + r.h - ip) - gy;
        var colW = gw / 7, rowH = gh / hours;

        ctx.font = fnt(24, 700); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var dn = 0; dn < 7; dn++) {
            ctx.fillText(window.i18nDay ? window.i18nDay(DAYS[dn]) : DAYS[dn], gx + colW * dn + colW / 2, top + headH / 2 - 4);
        }
        // 시간축: 촘촘하면 두 시간마다. 라벨은 선 '위'에 — 마지막 눈금(끝시각)까지 찍는다.
        var every = rowH >= 40 ? 1 : 2;
        ctx.font = fnt(20, 600); ctx.fillStyle = SUB; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'rgba(61,44,34,.08)'; ctx.lineWidth = 1;
        for (var t = 0; t <= hours; t++) {
            var ly = gy + rowH * t;
            ctx.beginPath(); ctx.moveTo(gx, ly); ctx.lineTo(gx + gw, ly); ctx.stroke();
            if ((H0 + t) % every === 0 || t === hours) ctx.fillText(String(H0 + t), gx - 8, ly + 2);
        }
        ctx.strokeStyle = 'rgba(61,44,34,.06)';
        for (var c = 0; c <= 7; c++) { ctx.beginPath(); ctx.moveTo(gx + colW * c, gy); ctx.lineTo(gx + colW * c, gy + gh); ctx.stroke(); }

        ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();
        for (var day = 0; day < 7; day++) {
            var evs = d.events.filter(function (e) { return e.day === day; })
                .sort(function (a, b) { return a.start - b.start; });
            var lanes = assignLanes(evs);
            for (var k = 0; k < evs.length; k++) {
                var ev = evs[k], slot = ev.slot % 5;
                var lw = (colW - 4) / lanes[k].lanes;
                var bx = gx + colW * day + 2 + lw * lanes[k].lane;
                var by = gy + (ev.start - H0) * rowH + 1;
                var bw = lw - (lanes[k].lanes > 1 ? 2 : 0);
                var bh = Math.max(14, (ev.end - ev.start) * rowH - 3);
                rr(ctx, bx, by, bw, bh, 6); ctx.fillStyle = SLOTFILL[slot]; ctx.fill();
                ctx.fillStyle = RAIL[slot]; ctx.fillRect(bx, by, Math.min(5, bw), bh);
                // 팀 이름: 블록이 충분히 클 때만 (작으면 색이 곧 범례)
                if (bw >= 56 && bh >= 44) {
                    ctx.save(); rr(ctx, bx, by, bw, bh, 6); ctx.clip();
                    ctx.font = fnt(18, 800); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    var nl = wrapWords(ctx, ev.name, bw - 12, 2);
                    for (var n = 0; n < nl.length; n++) ctx.fillText(nl[n], bx + bw / 2 + 2, by + bh / 2 + (n - (nl.length - 1) / 2) * 22);
                    ctx.restore();
                }
            }
        }
        ctx.restore();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // ── 공개 API ──────────────────────────────────────────────────
    // 캔버스에 그려서 dataURL 을 돌려준다. 테스트·프리뷰가 같은 경로를 쓴다. mode: 'card' | 'diet'
    window.renderMyCard = async function (data, mode) {
        mode = mode === 'diet' ? 'diet' : 'card';
        var c = document.createElement('canvas');
        c.width = W; c.height = FMT.h;
        var ctx = c.getContext('2d');
        // 번들 폰트가 늦게 오면 첫 렌더가 폴백 글꼴로 찍힌다.
        try {
            if (document.fonts && document.fonts.load) {
                await document.fonts.load(fnt(124, 900));
                await document.fonts.load(fnt(34, 800));
                await document.fonts.ready;
            }
        } catch (e) { /* 폰트 API 없으면 그냥 그린다 */ }
        var logo = await window.storyLoadImage('./assets/logo-512.png');
        drawCard(ctx, data, mode, logo);
        return c.toDataURL('image/png');
    };

    // ── 포장하기 미리보기 + 카드 칩 ──────────────────────────────
    // 미리보기 위에 칩 두 개(네임카드 · 식단표)를 두고, 누르면 그 자리에서 다시 그린다.
    // 앱(share_image_screen)과 같은 두 칸, 기본은 네임카드.
    var shapeRenderSeq = 0;

    function setShapeChips(mode) {
        var row = document.getElementById('previewShape');
        if (!row) return;
        row.hidden = false;
        var chips = row.querySelectorAll('.chip[data-shape]');
        for (var i = 0; i < chips.length; i++) {
            var on = chips[i].getAttribute('data-shape') === mode;
            chips[i].classList.toggle('selected', on);
            chips[i].setAttribute('aria-checked', on ? 'true' : 'false');
        }
    }

    window.showShareOptions = function () {
        if (!window.currentProfileData) { alert(window.t('sh_login_required')); return; }
        window.generateShareImage('card');
    };

    window.selectMyCardShape = function (mode) {
        window.generateShareImage(mode === 'diet' ? 'diet' : 'card');
    };

    window.generateShareImage = async function (mode) {
        mode = mode === 'diet' ? 'diet' : 'card';
        var seq = ++shapeRenderSeq;
        var box = document.getElementById('previewImgBox');
        try {
            if (!window.currentProfileData) { alert(window.t('sh_login_required')); return; }
            setShapeChips(mode);
            if (box) box.classList.add('is-loading');
            // 밥도감은 밥친구 프로필이 필요하다. 못 받아도 카드는 그린다(나 혼자 = 혼밥).
            var rices = [];
            if (mode === 'card' && window.loadFriendRices) {
                try { rices = await window.loadFriendRices(); } catch (e) { rices = []; }
            }
            var url = await window.renderMyCard(window.buildMyCardData(rices), mode);
            // 칩을 빠르게 번갈아 누르면 늦게 끝난 렌더가 최신 선택을 덮는다 — 마지막 것만 쓴다.
            if (seq !== shapeRenderSeq) return;
            box.innerHTML = '';
            var img = document.createElement('img');
            img.src = url;
            img.alt = window.t(mode === 'diet' ? 'mc_mode_diet' : 'mc_mode_card');
            box.appendChild(img);
            var overlay = document.getElementById('profileOverlay');
            if (overlay) overlay.style.display = 'none';
            document.getElementById('previewOverlay').style.display = 'flex';
            if (window.track) window.track('mycard_render', { mode: mode });
        } catch (e) {
            console.error(e);
            alert((window.t('sh_run_fail') || '') + (e && e.message ? e.message : e));
        } finally {
            if (box && seq === shapeRenderSeq) box.classList.remove('is-loading');
        }
    };
})();
