// my-card.js
// 포장하기 — 내 네임카드 공유 이미지 (Canvas 2D 직접 렌더).
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
// 두 규격:
//   · 스토리형 1080×1920 (9:16) — 네임카드 + 도시락통
//   · 피드형  1080×1350 (4:5)  — [네임카드 | 도시락통] + 식단표
//     인스타 피드가 받는 가장 긴 세로가 4:5다. 3:4(0.75)로 내면 위아래가 잘리고,
//     하필 잘리는 자리가 상단 브랜드 헤더와 하단 QR(유일한 유입 경로)이다.
//
// 도시락통 배치는 화면 UI(css .lunchbox-grid)와 같은 그리드를 쓴다 — 공유 이미지가
// 앱에서 보던 그 도시락통과 다른 물건으로 보이면 안 된다.
//
// Depends on: share.js (storyLoadImage/storyRoundRect/storyDrawQR/storyWrapLines,
//             SITE_BASE_URL), lunchbox.js (window.getShareSlots), data.js (findClub),
//             i18n.js, profile.js (window.currentProfileData)

(function () {
    var W = 1080, PAD = 80;
    var INK = '#3D2C22', SUB = '#A99A8C', DARK = '#4E342E', BROWN = '#8D6E63',
        CREAM = '#FBF3E2', CARD = '#FFFDF8', HAIR = 'rgba(141,110,99,.13)';

    // 도시락 칸 색 — 화면 UI·식단표 블록과 같은 색이어야 도시락통이 곧 범례가 된다.
    var RAIL = ['#FBC02D', '#F57C00', '#689F38', '#D84315', '#8E24AA'];
    var SLOTBG = ['#FFFDE7', '#FFF3E0', '#F1F8E9', '#FBE9E7', '#F3E5F5'];

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

    function fnt(px, wt) {
        return wt + ' ' + px + 'px "Pretendard Variable", Pretendard, -apple-system, sans-serif';
    }
    function shadow(ctx, blur, dy, a) {
        ctx.shadowColor = 'rgba(93,64,55,' + a + ')';
        ctx.shadowBlur = blur; ctx.shadowOffsetY = dy;
    }
    function noShadow(ctx) {
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }
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

    // 스토리 도시락통의 '자연' 높이: 안쪽여백 + 헤더 + (반찬행 + 간격 + 밥국행) + 안쪽여백.
    // 칸이 너무 커지면 팀 이름 한 줄만 덩그러니 떠서 빈 상자처럼 보인다.
    var STORY_BENTO_H = 26 + 42 + (190 + 14 + 260) + 26;

    // 네임카드가 실제로 쓰는 세로. 이름 폰트는 가변이지만 최대값으로 잡아
    // 긴 이름이 들어와도 아래가 눌리지 않게 한다.
    function storyHeroHeight(d) {
        var h = 46 + 96 + 26 + 52 + 12;      // 여백 + 엠블럼 + 간격 + 이름 + 간격
        if (d.joined) h += 36;
        if (d.mainTeam) h += 4 + 52;
        return h + 46;
    }

    // ── 데이터 수집 ────────────────────────────────────────────────
    // 화면에 보이는 것과 같은 슬롯을 쓴다(편집 중이면 tempSlots).
    window.buildMyCardData = function () {
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
            url: window.SITE_BASE_URL || 'https://do.nulloongzi.com/'
        };
    };

    // ── 그리기 ────────────────────────────────────────────────────
    function drawCard(ctx, d, feed, logo) {
        var H = feed ? 1350 : 1920;
        var headerY = feed ? 72 : 110;
        var footH = feed ? 176 : 200;
        // 피드는 푸터를 바닥에 고정. 스토리는 아래에서 스택 높이를 보고 다시 정한다.
        var footTop = H - footH - 40;
        var zoneTop = feed ? 176 : 200;
        var qrSize = feed ? 158 : 178;
        var CW = W - PAD * 2;

        ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H);
        var g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.7);
        g.addColorStop(0.15, 'rgba(255,252,240,.6)');
        g.addColorStop(1, 'rgba(240,226,196,.5)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

        brandHeader(ctx, PAD, headerY, logo);

        var zoneH = (footTop - 34) - zoneTop, GAP = 26;   // 피드 2단 배치용
        var hero, box, diet = null;

        if (feed) {
            // 상단: 네임카드 | 도시락통   하단: 식단표(전체 폭)
            // 도시락통이 6열이라 폭이 좁으면 팀 이름이 잘린다 → 히어로를 좁게 잡는다.
            var heroW = 380, colGap = 24;
            var topH = Math.round(zoneH * 0.46);
            hero = { x: PAD, y: zoneTop, w: heroW, h: topH };
            box = { x: PAD + heroW + colGap, y: zoneTop, w: CW - heroW - colGap, h: topH };
            diet = { x: PAD, y: zoneTop + topH + GAP, w: CW, h: zoneH - topH - GAP };
        } else {
            // 세 블록(네임카드·도시락통·QR)의 좌우 기준선을 하나로 — PAD ~ W-PAD.
            // 높이는 고정이 아니라 '내용이 필요한 만큼'. 고정하면 카드 안이 텅 비거나
            // 도시락 칸만 과하게 커진다.
            //
            // 셋을 한 덩어리로 묶어 안전영역(로고 아래 ~ 답장바 위) 가운데 놓는다.
            // 푸터만 바닥에 붙이면 도시락통과 QR 사이가 크게 벌어진다.
            var heroH = storyHeroHeight(d);
            var boxH = STORY_BENTO_H;
            var footGap = 64;
            var safeBot = H - 210;                    // 210 = 스토리 답장바 여유
            var stackH = heroH + 30 + boxH + footGap + footH;
            var top = zoneTop + Math.max(0, (safeBot - zoneTop - stackH) / 2);
            hero = { x: PAD, y: top, w: CW, h: heroH, big: true };
            box = { x: PAD, y: top + heroH + 30, w: CW, h: boxH };
            footTop = box.y + boxH + footGap;
        }

        drawHero(ctx, hero, d, logo);
        drawBento(ctx, box, d);
        if (diet) drawTimetable(ctx, diet, d);
        drawFooter(ctx, footTop, footH, qrSize, d);
    }

    function brandHeader(ctx, x, y, logo) {
        var cy = y + 26;
        ctx.beginPath(); ctx.arc(x + 26, cy, 26, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; shadow(ctx, 16, 4, .12); ctx.fill(); noShadow(ctx);
        if (logo) {
            ctx.save(); ctx.beginPath(); ctx.arc(x + 26, cy, 24, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(logo, x + 2, cy - 24, 48, 48); ctx.restore();
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = fnt(28, 800); ctx.fillStyle = DARK;
        ctx.fillText(window.t('brand') || '누룽지도', x + 66, cy);
    }

    function heroShell(ctx, r, bg, riceType) {
        shadow(ctx, 40, 14, .16);
        rr(ctx, r.x, r.y, r.w, r.h, 40); ctx.fillStyle = bg; ctx.fill(); noShadow(ctx);
        // 밥 색이 어떤 값이든 글씨가 읽히도록 안쪽을 살짝 밝힌다
        rr(ctx, r.x, r.y, r.w, r.h, 40); ctx.fillStyle = 'rgba(255,255,255,.34)'; ctx.fill();
        if (riceType) {
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.font = fnt(24, 600); ctx.fillStyle = 'rgba(61,44,34,.28)';
            ctx.fillText(riceType, r.x + 34, r.y + 40);
        }
    }

    function emblem(ctx, cx, cy, s, logo) {
        ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; shadow(ctx, 22, 8, .18); ctx.fill(); noShadow(ctx);
        if (logo) {
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, s / 2 - 4, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(logo, cx - s / 2 + 4, cy - s / 2 + 4, s - 8, s - 8);
            ctx.restore();
        }
    }

    function teamPill(ctx, cx, y, h, label, maxW) {
        var fs = h > 48 ? 25 : 21;
        ctx.font = fnt(fs, 700);
        var lb = ellip(ctx, label, maxW - 86);
        var pw = Math.min(ctx.measureText(lb).width + 80, maxW);
        var x = cx - pw / 2;
        rr(ctx, x, y, pw, h, h / 2);
        ctx.fillStyle = '#fff'; shadow(ctx, 14, 5, .12); ctx.fill(); noShadow(ctx);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = fnt(fs - 4, 400); ctx.fillText('🏐', x + 20, y + h / 2 + 1);
        ctx.font = fnt(fs, 700); ctx.fillStyle = DARK; ctx.fillText(lb, x + 52, y + h / 2);
    }

    // 네임카드 — 두 규격 모두 세로형. 정렬축을 하나(가운데)로 둔다.
    function drawHero(ctx, r, d, logo) {
        heroShell(ctx, r, d.bgColor, d.riceType);
        var big = !!r.big;
        var cx = r.x + r.w / 2;
        var es = big ? 96 : 74;
        var cy = r.y + (big ? 46 : 32);

        emblem(ctx, cx, cy + es / 2, es, logo);
        cy += es + (big ? 26 : 20);

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var nameW = r.w - 44;
        var sz = fitFont(ctx, d.nickname, nameW, big ? 52 : 34, big ? 34 : 22, 800);
        ctx.fillStyle = INK;
        ctx.fillText(ellip(ctx, d.nickname, nameW), cx, cy + sz / 2);
        cy += sz + 12;

        if (d.joined) {
            ctx.font = fnt(big ? 23 : 19, 500); ctx.fillStyle = BROWN;
            ctx.fillText(d.joined, cx, cy + 10);
            cy += big ? 36 : 28;
        }
        if (d.mainTeam) teamPill(ctx, cx, cy + 4, big ? 52 : 44, d.mainTeam, r.w - 36);
        ctx.textAlign = 'left';
    }

    // 도시락통 — 화면 UI와 같은 6열 그리드
    function drawBento(ctx, r, d) {
        shadow(ctx, 34, 12, .13);
        rr(ctx, r.x, r.y, r.w, r.h, 30); ctx.fillStyle = CARD; ctx.fill(); noShadow(ctx);

        var ip = 26, ix = r.x + ip, iw = r.w - ip * 2;
        var cy = r.y + ip;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = fnt(27, 800); ctx.fillStyle = INK;
        ctx.fillText((window.t('mc_lunchbox') || '도시락') + ' 🍱', ix, cy);

        var filled = 0;
        for (var i = 0; i < d.slots.length; i++) if (d.slots[i]) filled++;
        ctx.font = fnt(21, 600); ctx.fillStyle = SUB; ctx.textAlign = 'right';
        ctx.fillText(filled + ' / 5', ix + iw, cy + 6);
        ctx.textAlign = 'left';
        cy += 42;

        var gap = 14;
        var gridH = (r.y + r.h - ip) - cy;
        var colW = (iw - gap * 5) / 6;
        var unit = (gridH - gap) / (ROW_FR[0] + ROW_FR[1]);
        var rowH = [ROW_FR[0] * unit, ROW_FR[1] * unit];
        var rowY = [cy, cy + rowH[0] + gap];

        for (var k = 0; k < GRID.length; k++) {
            var gcell = GRID[k];
            var x = ix + (colW + gap) * gcell.col;
            var w = colW * gcell.span + gap * (gcell.span - 1);
            drawCell(ctx, x, rowY[gcell.row], w, rowH[gcell.row], gcell, d);
        }
        ctx.textBaseline = 'middle';
    }

    function drawCell(ctx, x, y, w, h, gcell, d) {
        var name = d.slots[gcell.slot];
        var label = window.t(gcell.key) || '';

        if (!name) {
            // 빈 칸: 점선 + 키워드·이모지만.
            // 화면 UI의 "국을 담아주세요🥘" 같은 입력 유도 문구는 공유물이 아니다 —
            // 받아 보는 사람에게 하는 말처럼 읽힌다. 키워드+이모지는 도시락통다움이라 남긴다.
            rr(ctx, x, y, w, h, 16);
            ctx.fillStyle = 'rgba(141,110,99,.04)'; ctx.fill();
            ctx.setLineDash([9, 8]); ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(141,110,99,.24)'; ctx.stroke();
            ctx.setLineDash([]);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = fnt(21, 700); ctx.fillStyle = 'rgba(141,110,99,.42)';
            ctx.fillText(label, x + w / 2, y + h / 2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            return;
        }

        rr(ctx, x, y, w, h, 16); ctx.fillStyle = SLOTBG[gcell.slot]; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = RAIL[gcell.slot]; ctx.stroke();
        rr(ctx, x, y, 10, h, 5); ctx.fillStyle = RAIL[gcell.slot]; ctx.fill();

        ctx.save(); rr(ctx, x, y, w, h, 16); ctx.clip();
        // 칸 안 좌상단 옅은 라벨 — 팀 이름만 남으면 어느 칸인지 사라진다
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = fnt(17, 700); ctx.fillStyle = 'rgba(61,44,34,.32)';
        ctx.fillText(label, x + 20, y + 12);

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = fnt(gcell.span >= 3 ? 27 : 22, 800); ctx.fillStyle = INK;
        var lines = wrapWords(ctx, name, w - 40, 2);
        var lh = gcell.span >= 3 ? 33 : 28;
        var sy = y + h / 2 + 8 - (lines.length - 1) * lh / 2;
        for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + w / 2, sy + i * lh);
        ctx.restore();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // 식단표 — 피드형에만. 블록 색이 도시락 칸 색과 같아 도시락통이 범례가 된다.
    function drawTimetable(ctx, r, d) {
        shadow(ctx, 34, 12, .13);
        rr(ctx, r.x, r.y, r.w, r.h, 30); ctx.fillStyle = CARD; ctx.fill(); noShadow(ctx);

        var ip = 26, ix = r.x + ip, iw = r.w - ip * 2;
        var cy = r.y + ip;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = fnt(27, 800); ctx.fillStyle = INK;
        ctx.fillText((window.t('mc_timetable') || '식단표') + ' 🗓', ix, cy);
        cy += 42;

        // 표시 구간은 실제 일정에 맞춘다(없으면 18~23시)
        var minH = 24, maxH = 0;
        for (var i = 0; i < d.events.length; i++) {
            if (d.events[i].start < minH) minH = d.events[i].start;
            if (d.events[i].end > maxH) maxH = d.events[i].end;
        }
        if (!d.events.length) { minH = 18; maxH = 23; }
        var H0 = Math.max(6, Math.floor(minH) - 1);
        var H1 = Math.min(24, Math.ceil(maxH) + 1);
        if (H1 - H0 < 3) H1 = Math.min(24, H0 + 3);
        var rows = H1 - H0;

        var gridTop = cy + 30, gridBot = r.y + r.h - ip;
        var gridH = gridBot - gridTop, timeW = 46;
        var colW = (iw - timeW) / 7;

        ctx.font = fnt(22, 700); ctx.fillStyle = BROWN; ctx.textAlign = 'center';
        for (var dnum = 0; dnum < 7; dnum++) {
            var lbl = window.i18nDay ? window.i18nDay(DAYS[dnum]) : DAYS[dnum];
            ctx.fillText(lbl, ix + timeW + colW * dnum + colW / 2, cy);
        }
        ctx.textAlign = 'right'; ctx.font = fnt(18, 600); ctx.fillStyle = SUB;
        ctx.strokeStyle = HAIR; ctx.lineWidth = 1;
        for (var t = 0; t <= rows; t++) {
            var y = gridTop + gridH * (t / rows);
            ctx.fillText(String(H0 + t), ix + timeW - 8, y - 8);
            ctx.beginPath(); ctx.moveTo(ix + timeW, y); ctx.lineTo(ix + iw, y); ctx.stroke();
        }
        for (var c = 0; c <= 7; c++) {
            var x = ix + timeW + colW * c;
            ctx.beginPath(); ctx.moveTo(x, gridTop); ctx.lineTo(x, gridBot); ctx.stroke();
        }

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var e = 0; e < d.events.length; e++) {
            var ev = d.events[e];
            var bx = ix + timeW + colW * ev.day + 3;
            var y0 = gridTop + gridH * ((ev.start - H0) / rows);
            var y1 = gridTop + gridH * ((ev.end - H0) / rows);
            var bh = Math.max(y1 - y0 - 4, 22), bw = colW - 6;
            rr(ctx, bx, y0 + 2, bw, bh, 7);
            ctx.fillStyle = SLOTBG[ev.slot]; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = RAIL[ev.slot]; ctx.stroke();
            ctx.save(); rr(ctx, bx, y0 + 2, bw, bh, 7); ctx.clip();
            ctx.font = fnt(17, 800); ctx.fillStyle = INK;
            ctx.fillText(ellip(ctx, ev.name, bw - 8), bx + bw / 2, (y0 + y1) / 2);
            ctx.restore();
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // 푸터 — QR + CTA. 스토리는 링크가 안 걸리는 매체라 QR이 유일한 유입 경로다.
    function drawFooter(ctx, top, h, qs, d) {
        ctx.beginPath(); ctx.moveTo(PAD, top); ctx.lineTo(W - PAD, top);
        ctx.strokeStyle = HAIR; ctx.lineWidth = 2; ctx.stroke();

        var qx = PAD, qy = top + (h - qs) / 2;
        // QR 라이브러리가 없으면(CDN 차단) 배경판도 그리지 않는다 — 흰 박스만 남아
        // CTA 텍스트를 덮는다. 이때는 CTA를 왼쪽 끝부터 그린다.
        var probe = ctx.canvas.ownerDocument.createElement('canvas');
        probe.width = probe.height = 8;
        var ok = window.storyDrawQR(probe.getContext('2d'), d.url, 0, 0, 8);
        if (ok) {
            rr(ctx, qx - 10, qy - 10, qs + 20, qs + 20, 16);
            ctx.fillStyle = '#fff'; shadow(ctx, 16, 5, .12); ctx.fill(); noShadow(ctx);
            window.storyDrawQR(ctx, d.url, qx, qy, qs);
        }

        var tx = ok ? qx + qs + 40 : qx;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        if (ok) {
            ctx.font = fnt(20, 700); ctx.fillStyle = SUB;
            ctx.fillText('S C A N', tx, qy + 34);
        }
        ctx.font = fnt(38, 800); ctx.fillStyle = DARK;
        ctx.fillText(window.t('mc_cta') || '내 밥이름 만들러 가기', tx, qy + 88);
        ctx.font = fnt(24, 500); ctx.fillStyle = BROWN;
        ctx.fillText(String(d.url).replace(/^https?:\/\//, '').replace(/\/$/, ''), tx, qy + 130);
        ctx.textBaseline = 'middle';
    }

    // ── 공개 API ──────────────────────────────────────────────────
    // 캔버스에 그려서 dataURL 을 돌려준다. 테스트·프리뷰가 같은 경로를 쓴다.
    window.renderMyCard = async function (data, feed) {
        var c = document.createElement('canvas');
        c.width = W; c.height = feed ? 1350 : 1920;
        var ctx = c.getContext('2d');
        // 번들 폰트가 늦게 오면 첫 렌더가 폴백 글꼴로 찍힌다.
        try {
            if (document.fonts && document.fonts.load) {
                await document.fonts.load(fnt(68, 900));
                await document.fonts.load(fnt(34, 800));
                await document.fonts.ready;
            }
        } catch (e) { /* 폰트 API 없으면 그냥 그린다 */ }
        var logo = await window.storyLoadImage('./nulloongzido logo_512px.png');
        drawCard(ctx, data, feed, logo);
        return c.toDataURL('image/png');
    };

    window.showShareOptions = function () {
        if (!window.currentProfileData) { alert(window.t('sh_login_required')); return; }
        // confirm: 확인=피드형(식단표 포함) / 취소=스토리형
        window.generateShareImage(confirm(window.t('sh_pick_shape')) ? 'feed' : 'story');
    };

    window.generateShareImage = async function (mode) {
        try {
            if (!window.currentProfileData) { alert(window.t('sh_login_required')); return; }
            var url = await window.renderMyCard(window.buildMyCardData(), mode === 'feed');
            var box = document.getElementById('previewImgBox');
            box.innerHTML = '';
            var img = document.createElement('img');
            img.src = url;
            box.appendChild(img);
            var overlay = document.getElementById('profileOverlay');
            if (overlay) overlay.style.display = 'none';
            document.getElementById('previewOverlay').style.display = 'flex';
        } catch (e) {
            console.error(e);
            alert((window.t('sh_run_fail') || '') + (e && e.message ? e.message : e));
        }
    };
})();
