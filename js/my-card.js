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
// 두 규격 (docs/design-system.md §7 — 팀·픽업 카드와 같은 틀):
//   · 스토리형 1080×1920 (9:16) — 밥색 필드(신원) + 도시락통
//   · 피드형  1080×1440 (3:4)  — 밥색 필드(신원) + 도시락통 + 식단표
//     인스타가 2025년부터 3:4 업로드·그리드를 지원한다. 4:5는 그리드 썸네일에서 위아래가 잘렸다.
// 머리글·스텁(QR)·그림자·글자 크기는 share.js 의 공유 카드 키트를 그대로 쓴다.
//
// 도시락통 배치는 화면 UI(css .lunchbox-grid)와 같은 그리드를 쓴다 — 공유 이미지가
// 앱에서 보던 그 도시락통과 다른 물건으로 보이면 안 된다.
//
// Depends on: share.js (storyLoadImage/storyRoundRect/storyDrawQR/storyWrapLines,
//             SITE_BASE_URL), lunchbox.js (window.getShareSlots), data.js (findClub),
//             i18n.js, profile.js (window.currentProfileData)

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

    // 밥친구(4단계): 스토리는 도시락통 아래 '이번 주 겸상' 칸, 피드는 신원 줄 오른쪽에
    // 얼굴 겹침 + 알약. 숫자는 docs/design-system.md §7-4, 앱 my_card.dart 와 같다.
    var FR = { max: 4, storyH: 264, storyAv: 96, feedAv: 72, feedStep: 48, feedGap: 32 };
    // 익힘 단계 색 — 화면(css .fr-warm / 앱 warm_avatar.dart)과 같은 값
    var WARM_RING = ['', '#F1D9A6', '#F5B82E', '#A0522D'];
    var WARM_INK = ['#8D6E63', '#8D6E63', '#B7791F', '#8B4513'];
    var BOWL_D = 'M12 4.6c-1.9 0-3.2 1-3.9 2.2-1-.4-2.4.3-2.4 1.7 0 .9.7 1.5 1.4 1.5h9.8c.7 0 1.4-.6 1.4-1.5 0-1.4-1.4-2.1-2.4-1.7-.7-1.2-2-2.2-3.9-2.2zM4.2 11.6h15.6c0 3.1-2.5 5.6-5.8 6.2v.9c0 .4-.3.7-.7.7h-2.6c-.4 0-.7-.3-.7-.7v-.9c-3.3-.6-5.8-3.1-5.8-6.2z';   // 밥그릇 벡터(friends.js 아바타와 같은 모양) — 캔버스엔 이모지를 쓰지 않는다

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
    // 카드에 넣을 밥친구: 이번 주 겸상하는 친구만, 겸상 많은 순 최대 4명.
    // 나가는 건 밥이름·색·익힘 단계뿐 — 친구의 팀·요일·시간은 카드에 없다.
    // '식단표 전부 숨기기'를 켠 친구는 목록에 있어도 넣지 않는다(밖으로 나가는 이미지라 더 보수적으로).
    window.myCardFriends = function () {
        var s = window.friendState;
        if (!s || !s.uid || !window.friendMeal || !window.friendSharePure) return [];
        return window.friendSharePure.pickCardFriends(s.friends.map(function (f) {
            var p = s.profiles[f.other] || {};
            var m = window.friendMeal(f.other);
            var lb = window.peekFriendLunchbox ? window.peekFriendLunchbox(f.other) : null;
            return { name: p.name || '', color: p.color || '#FFF9C4', tier: m.tier, n: m.n, hidden: !!(lb && lb.status === 'hidden') };
        }), FR.max);
    };

    window.buildMyCardData = function (includeFriends) {
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
            friends: includeFriends ? window.myCardFriends() : [],
            url: window.SITE_BASE_URL || 'https://do.nulloongzi.com/'
        };
    };

    // ── 배치 ──────────────────────────────────────────────────────
    // 구조(두 규격 공통): 전폭 밥색 필드(히어로: 머리글 + 신원) / 본문 카드(필드 아랫단을
    // 덮음) / 티켓 스텁(QR). 규격·토큰은 docs/design-system.md §7, 앱 my_card.dart 와 같다.
    //   · 스토리 9:16 — 신원은 가운데 세로 스택, 본문은 도시락통(탄력 440~760)
    //   · 피드 3:4   — 신원은 가로 한 줄, 본문은 도시락통(고정) + 식단표(탄력)
    // 남는 세로는 밥색 필드가 먹는다 — 빈 크림 띠를 남기지 않는다.
    var BENTO = { storyMin: 440, storyMax: 760, feedH: 360, feedMinH: 300, dietMin: 320, storyMinFr: 320 };
    var ID_STORY = { emblem: 136, gapE: 28, name: 72, nameMin: 44, gapN: 12, joined: 34, gapJ: 28, pill: 60 };
    var ID_FEED = { emblem: 120, gap: 32, name: 56, nameMin: 36, joined: 30, gapJ: 14, pill: 52 };

    function identityStoryH(d) {
        var I = ID_STORY, h = I.emblem + I.gapE + I.name + 8;
        if (d.joined) h += I.gapN + I.joined;
        if (d.mainTeam) h += I.gapJ + I.pill;
        return h;
    }
    function identityFeedH(d) {
        var I = ID_FEED, t = I.name + 8;
        if (d.joined) t += 6 + I.joined;
        if (d.mainTeam) t += I.gapJ + I.pill;
        return Math.max(I.emblem, t);
    }

    // 배치 계산(그리기와 분리 — 테스트·앱이 같은 값을 쓴다).
    window.myCardLayout = function (d, feed) {
        var fmt = window.cardFormat(feed ? 'feed' : 'story');
        var SC = window.SHARE_CARD;
        var stubTop = window.cardStubTop(fmt);
        var headBot = fmt.top + SC.HEADER_H;
        var bodyBot = stubTop - SC.GAP;
        var nFr = d.friends ? Math.min(FR.max, d.friends.length) : 0;
        if (!feed) {
            var idH = identityStoryH(d);
            // 밥친구 칸이 들어오면 신원 위아래 간격을 줄이고(40/48 → 24/24) 도시락통 최소치도 낮춘다.
            // 도시락통이 탄력 요소라 그만큼 줄어들 뿐, 빈 곳은 생기지 않는다.
            var minTop = headBot + (nFr ? 24 : 40) + idH + (nFr ? 24 : 48);
            var bentoBot = nFr ? bodyBot - FR.storyH - SC.GAP : bodyBot;
            var bentoH = Math.max(nFr ? BENTO.storyMinFr : BENTO.storyMin, Math.min(BENTO.storyMax, bentoBot - minTop));
            var cardY = bentoBot - bentoH;
            return {
                fmt: fmt, stubTop: stubTop, headerY: fmt.top,
                field: { h: cardY + SC.OVERLAP },
                // 신원은 머리글 ~ 도시락통 사이 가운데 (남는 세로가 위아래로 고르게)
                identity: { x: SC.M, y: headBot + (cardY - headBot - idH) / 2, w: PAD_W, h: idH },
                bento: { x: SC.M, y: cardY, w: PAD_W, h: bentoH },
                friends: nFr ? { x: SC.M, y: bentoBot + SC.GAP, w: PAD_W, h: FR.storyH } : null,
                diet: null
            };
        }
        var fid = identityFeedH(d);
        var idY = headBot + 32;
        var bY = idY + fid + 40;
        var bH = BENTO.feedH;
        if (bodyBot - (bY + bH + 24) < BENTO.dietMin) bH = BENTO.feedMinH;
        var dY = bY + bH + 24;
        // 피드는 세로가 빠듯해 칸을 따로 두지 않고, 신원 줄 오른쪽에 얼굴 겹침 + 알약. 식단표 크기는 그대로.
        var cw = nFr ? FR.feedAv + FR.feedStep * (nFr - 1) : 0, ch = FR.feedAv + 8 + 30;
        return {
            fmt: fmt, stubTop: stubTop, headerY: fmt.top,
            field: { h: bY + SC.OVERLAP },
            identity: { x: SC.M, y: idY, w: PAD_W, h: fid },
            bento: { x: SC.M, y: bY, w: PAD_W, h: bH },
            friends: nFr ? { x: SC.M + PAD_W - cw, y: idY + (fid - ch) / 2, w: cw, h: ch } : null,
            diet: { x: SC.M, y: dY, w: PAD_W, h: bodyBot - dY }
        };
    };
    // ── 그리기 ────────────────────────────────────────────────────
    function drawCard(ctx, d, feed, logo) {
        var L = window.myCardLayout(d, feed);
        window.cardBackground(ctx, L.fmt.h);
        drawField(ctx, L.field.h, d);
        window.cardHeader(ctx, L.headerY, logo);
        if (feed) drawIdentityFeed(ctx, L.identity, d, logo, L.friends); else drawIdentityStory(ctx, L.identity, d, logo);
        drawBento(ctx, L.bento, d, feed);
        if (L.diet) drawTimetable(ctx, L.diet, d);
        if (L.friends) { if (feed) drawFriendCluster(ctx, L.friends, d); else drawFriends(ctx, L.friends, d); }
        window.cardStub(ctx, L.fmt, d.url, window.t('mc_cta') || '내 밥이름 만들러 가기');
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

    function emblem(ctx, cx, cy, s, logo) {
        ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; window.cardShadow(ctx, false); ctx.fill(); window.cardNoShadow(ctx);
        if (logo) {
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, s / 2 - 6, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(logo, cx - s / 2 + 6, cy - s / 2 + 6, s - 12, s - 12);
            ctx.restore();
        } else {
            window.cardVolley(ctx, cx, cy, s * 0.3, '#FAC710');
        }
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

    function drawIdentityStory(ctx, r, d, logo) {
        var I = ID_STORY, cx = r.x + r.w / 2, y = r.y;
        emblem(ctx, cx, y + I.emblem / 2, I.emblem, logo);
        y += I.emblem + I.gapE;
        fitFont(ctx, d.nickname, r.w, I.name, I.nameMin, 800);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
        ctx.fillText(ellip(ctx, d.nickname, r.w), cx, y + I.name / 2);
        y += I.name + 8;
        if (d.joined) {
            y += I.gapN;
            ctx.font = fnt(28, 600); ctx.fillStyle = BROWN;
            ctx.fillText(d.joined, cx, y + I.joined / 2);
            y += I.joined;
        }
        if (d.mainTeam) { y += I.gapJ; teamPill(ctx, cx, y, I.pill, d.mainTeam, r.w, 'center'); }
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    function drawIdentityFeed(ctx, r, d, logo, fr) {
        var I = ID_FEED;
        emblem(ctx, r.x + I.emblem / 2, r.y + r.h / 2, I.emblem, logo);
        // 오른쪽에 밥친구 얼굴이 오면 이름 폭을 그만큼 줄인다
        var tx = r.x + I.emblem + I.gap, tw = (fr ? fr.x - FR.feedGap : r.x + r.w) - tx;
        var textH = I.name + 8 + (d.joined ? 6 + I.joined : 0) + (d.mainTeam ? I.gapJ + I.pill : 0);
        var y = r.y + (r.h - textH) / 2;
        fitFont(ctx, d.nickname, tw, I.name, I.nameMin, 800);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
        ctx.fillText(ellip(ctx, d.nickname, tw), tx, y + I.name / 2);
        y += I.name + 8;
        if (d.joined) {
            y += 6;
            ctx.font = fnt(26, 600); ctx.fillStyle = BROWN;
            ctx.fillText(d.joined, tx, y + I.joined / 2);
            y += I.joined;
        }
        if (d.mainTeam) { y += I.gapJ; teamPill(ctx, tx, y, I.pill, d.mainTeam, tw, 'left'); }
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

    // 도시락통 — 화면 UI(.lunchbox-grid)와 같은 6열 그리드
    function drawBento(ctx, r, d, feed) {
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
            drawCell(ctx, ix + (colW + gap) * g.col, rowY[g.row], colW * g.span + gap * (g.span - 1), rowH[g.row], g, d, feed);
        }
    }

    function drawCell(ctx, x, y, w, h, g, d, feed) {
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
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = fnt(20, 700); ctx.fillStyle = 'rgba(61,44,34,.4)';
        ctx.fillText(label, x + 22, y + 12);
        var big = g.span >= 3;
        var fs = feed ? (big ? 30 : 24) : (big ? 36 : 28);
        var lh = Math.round(fs * 1.22);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = fnt(fs, 800); ctx.fillStyle = INK;
        var lines = wrapWords(ctx, name, w - 40, 2);
        var sy = y + h / 2 + 10 - (lines.length - 1) * lh / 2;
        for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + w / 2 + 5, sy + i * lh);
        ctx.restore();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // ── 밥친구 (4단계) ──────────────────────────────────────────
    function drawBowl(ctx, cx, cy, s) {
        if (typeof window.Path2D !== 'function') return;
        var k = s / 24;
        ctx.save(); ctx.translate(cx - s / 2, cy - s / 2); ctx.scale(k, k);
        ctx.fillStyle = INK; ctx.fill(new window.Path2D(BOWL_D)); ctx.restore();
    }
    // 아바타: 익힘 테두리(누룽지는 갈색·금빛이 도는 테두리) → 흰 틈 → 밥 색 얼굴 + 밥그릇.
    function drawFriendAvatar(ctx, cx, cy, size, f, ringW, gapW) {
        var r0 = size / 2, tier = Math.max(0, Math.min(3, f.tier || 0));
        if (tier) {
            ctx.beginPath(); ctx.arc(cx, cy, r0 + gapW + ringW, 0, Math.PI * 2);
            var fill = WARM_RING[tier];
            var g = tier === 3 && typeof ctx.createConicGradient === 'function' ? ctx.createConicGradient(0, cx, cy) : null;
            if (g && g.addColorStop) {   // 오래된 브라우저엔 conic 이 없다 → 단색 갈색
                ['#8B4513', '#F5B82E', '#C9772B', '#6D3B1A', '#F5B82E', '#8B4513'].forEach(function (c, i, a) { g.addColorStop(i / (a.length - 1), c); });
                fill = g;
            }
            ctx.fillStyle = fill; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(cx, cy, r0 + gapW, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, r0, 0, Math.PI * 2); ctx.fillStyle = f.color || '#FFF9C4'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, r0 - 1.5, 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.stroke();
        drawBowl(ctx, cx, cy, size * 0.58);
    }
    // 스토리: 도시락통 아래 '이번 주 겸상' 칸. 얼굴 + 밥이름 + 익힘 단계·겸상 횟수.
    function drawFriends(ctx, r, d) {
        card(ctx, r);
        var ip = 32, ix = r.x + ip, iw = r.w - ip * 2;
        var list = d.friends.slice(0, FR.max), n = list.length;
        sectionTitle(ctx, ix, r.y + ip, T('mc_friends_title'), TF('mc_friends_n', { n: n }), iw);
        var top = r.y + ip + 32 + 16, cw = iw / n;
        for (var i = 0; i < n; i++) {
            var f = list[i], cx = ix + cw * i + cw / 2;
            drawFriendAvatar(ctx, cx, top + FR.storyAv / 2, FR.storyAv, f, 5, 4);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = fnt(24, 700); ctx.fillStyle = INK;
            ctx.fillText(ellip(ctx, f.name, cw - 16), cx, top + FR.storyAv + 8 + 15);
            ctx.font = fnt(22, 700); ctx.fillStyle = WARM_INK[f.tier] || WARM_INK[0];
            ctx.fillText(ellip(ctx, T('fr_warm_' + f.tier) + ' · ' + TF('mc_meal_n', { n: f.n }), cw - 16), cx, top + FR.storyAv + 8 + 30 + 4 + 11);
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
    // 피드: 신원 줄 오른쪽에 얼굴 겹침(흰 테두리로 구분) + '이번 주 겸상 N' 알약.
    function drawFriendCluster(ctx, r, d) {
        var list = d.friends.slice(0, FR.max), n = list.length, best = 0;
        for (var i = 0; i < n; i++) {
            drawFriendAvatar(ctx, r.x + FR.feedAv / 2 + FR.feedStep * i, r.y + FR.feedAv / 2, FR.feedAv, list[i], 3, 3);
            best = Math.max(best, list[i].tier || 0);
        }
        var label = TF('mc_friends_pill', { n: n });
        ctx.font = fnt(20, 800);
        var pw = ctx.measureText(label).width + 28, py = r.y + FR.feedAv + 8;
        window.cardPill(ctx, r.x + r.w / 2 - pw / 2, py, pw, 30);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = WARM_INK[best];
        ctx.fillText(label, r.x + r.w / 2, py + 16);
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

    // 식단표 — 피드형에만. 블록 색이 도시락 칸 색과 같아 도시락통이 범례가 된다.
    function drawTimetable(ctx, r, d) {
        card(ctx, r);
        var ip = 32, ix = r.x + ip, iw = r.w - ip * 2;
        sectionTitle(ctx, ix, r.y + ip, window.t('mc_timetable') || '식단표', '', iw);
        var top = r.y + ip + 32 + 20;
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
    // 캔버스에 그려서 dataURL 을 돌려준다. 테스트·프리뷰가 같은 경로를 쓴다.
    window.renderMyCard = async function (data, feed) {
        var c = document.createElement('canvas');
        c.width = W; c.height = window.cardFormat(feed ? 'feed' : 'story').h;
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

    // ── 포장하기 미리보기 + 형태 칩 ──────────────────────────────
    // 예전엔 confirm() 으로 골랐다([확인]=피드 / [취소]=스토리) — 무엇이 나올지 보기 전에
    // 골라야 했고, 취소가 곧 선택이라 헷갈렸다. 앱(share_image_screen)처럼 미리보기 위에
    // 칩 두 개를 두고, 누르면 그 자리에서 다시 그린다. 기본은 앱과 같은 피드형.
    var shapeRenderSeq = 0;
    // '밥친구 포함' 스위치(기본 꺼짐). 겸상하는 밥친구가 없으면 흐리게 잠긴다.
    var includeFriends = false, currentMode = 'feed';

    function syncFriendsToggle() {
        var b = document.getElementById('previewFriends');
        if (!b) return;
        var n = window.myCardFriends ? window.myCardFriends().length : 0;
        if (!n) includeFriends = false;
        b.disabled = !n;
        b.title = n ? '' : T('mc_friends_none');
        b.classList.toggle('on', includeFriends);
        b.setAttribute('aria-checked', includeFriends ? 'true' : 'false');
    }
    window.toggleMyCardFriends = function () {
        includeFriends = !includeFriends;
        if (window.track) window.track('mycard_friends', { on: includeFriends ? 1 : 0 });
        window.generateShareImage(currentMode);
    };

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
        window.generateShareImage('feed');
    };

    window.selectMyCardShape = function (mode) {
        window.generateShareImage(mode === 'story' ? 'story' : 'feed');
    };

    window.generateShareImage = async function (mode) {
        mode = mode === 'story' ? 'story' : 'feed';
        currentMode = mode;
        var seq = ++shapeRenderSeq;
        var box = document.getElementById('previewImgBox');
        try {
            if (!window.currentProfileData) { alert(window.t('sh_login_required')); return; }
            setShapeChips(mode);
            syncFriendsToggle();
            if (box) box.classList.add('is-loading');
            var url = await window.renderMyCard(window.buildMyCardData(includeFriends), mode === 'feed');
            // 칩을 빠르게 번갈아 누르면 늦게 끝난 렌더가 최신 선택을 덮는다 — 마지막 것만 쓴다.
            if (seq !== shapeRenderSeq) return;
            box.innerHTML = '';
            var img = document.createElement('img');
            img.src = url;
            img.alt = window.t(mode === 'feed' ? 'mc_mode_feed' : 'mc_mode_story');
            box.appendChild(img);
            var overlay = document.getElementById('profileOverlay');
            if (overlay) overlay.style.display = 'none';
            document.getElementById('previewOverlay').style.display = 'flex';
        } catch (e) {
            console.error(e);
            alert((window.t('sh_run_fail') || '') + (e && e.message ? e.message : e));
        } finally {
            if (box && seq === shapeRenderSeq) box.classList.remove('is-loading');
        }
    };
})();
