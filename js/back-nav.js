// back-nav.js — 폰 뒤로가기(버튼·제스처)로 열린 창을 닫는다. 앱 map_screen.dart 의 PopScope 와 같은 경험.
//
// 창을 열 때 히스토리에 한 칸을 넣고(pushState), 뒤로가기가 그 칸을 빼면(popstate) 창을 닫는다.
// 창이 쓸어내리기·바깥 누르기로 닫히면 넣어 둔 칸을 조용히 뺀다(history.back) — 다음 뒤로가기가 헛돌지 않게.
// 칸마다 번호(seq)를 state 에 적어 두고, popstate 때 "지금 칸 번호보다 위에 있는 창"을 모두 닫는다.
// 되감기는 한 박자 미룬다: 도시락에서 팀을 누르면 "도시락 닫기 → 상세 열기"가 한 번에 일어나는데,
// 그 사이 새 창이 열리면 되감지 않고 그 칸을 새 창에 넘겨준다(되감기와 새 칸 넣기가 엇갈리지 않게).
// 그래서 다른 코드가 주소를 바꿀 땐 state 를 지우지 말 것: history.replaceState(history.state, '', url)
//
//   window.backNav.open(key, closeFn, { url, baseUrl })  창을 열 때(이미 열려 있으면 closeFn 만 바꾼다)
//     url     — 열린 칸의 주소(예: '?club=ID'). 없으면 지금 주소
//     baseUrl — 넣기 전에 지금 칸 주소를 이걸로 바꾼다(닫혔을 때 돌아갈 주소, 예: ?club= 를 뺀 주소)
//   window.backNav.closed(key)  창이 뒤로가기 말고 다른 방법으로 닫혔을 때. 처리했으면 true
//   window.backNav.isOpen(key)
(function () {
    var stack = []; // [{ key, seq, close }] — 아래에서 위로 열린 순서
    var seq = 0;
    var pendingBack = null; // closed() 가 예약한 되감기(setTimeout id)
    var pendingCount = 0;   // 예약된 되감기 칸 수 — 창 둘이 연달아 닫히면(팝업 확인 → 상세 닫기) 2

    function supported() { return !!(window.history && history.pushState && history.replaceState); }
    function indexOf(key) {
        for (var i = stack.length - 1; i >= 0; i--) if (stack[i].key === key) return i;
        return -1;
    }

    window.backNav = {
        open: function (key, close, opts) {
            if (!supported()) return;
            opts = opts || {};
            var i = indexOf(key);
            if (i >= 0) {
                stack[i].close = close;
                if (opts.url) history.replaceState(history.state, '', opts.url);
                return;
            }
            seq += 1;
            stack.push({ key: key, seq: seq, close: close });
            if (pendingBack !== null) {
                // 방금 닫힌 창의 칸을 이어받는다(되감기 취소). 둘 이상 닫혔으면 아래 칸은 비워 둔다(드묾)
                clearTimeout(pendingBack);
                pendingBack = null;
                pendingCount = 0;
                history.replaceState({ nzBack: seq }, '', opts.url || location.href);
                return;
            }
            if (opts.baseUrl) history.replaceState(history.state, '', opts.baseUrl);
            history.pushState({ nzBack: seq }, '', opts.url || location.href);
        },
        closed: function (key) {
            var i = indexOf(key);
            if (i < 0) return false;
            var item = stack.splice(i, 1)[0];
            var wasTop = i === stack.length;
            // 맨 위 창이고, 그 칸이 지금 칸이거나 바로 위 칸이 이미 되감기 예약됐으면 함께 되감는다.
            // 아래 창이 먼저 닫히면 그 칸은 비워 둔다(뒤로가기 한 번이 헛돈다 — 드묾)
            if (wasTop && (pendingCount > 0 || (history.state && history.state.nzBack === item.seq))) {
                pendingCount += 1;
                if (pendingBack === null) {
                    pendingBack = setTimeout(function () {
                        var n = pendingCount;
                        pendingBack = null;
                        pendingCount = 0;
                        if (n) history.go(-n);
                    }, 0);
                }
            }
            return true;
        },
        isOpen: function (key) { return indexOf(key) >= 0; }
    };

    window.addEventListener('popstate', function (e) {
        var cur = (e.state && e.state.nzBack) || 0;
        // 지금 칸보다 위에서 열린 창을 위에서부터 닫는다. 닫는 함수가 closed() 를 불러도 이미 빠져 있어 되감지 않는다
        while (stack.length && stack[stack.length - 1].seq > cur) {
            var item = stack.pop();
            try { item.close(); } catch (err) { console.warn('backNav close 실패:', item.key, err); }
        }
    });
})();
