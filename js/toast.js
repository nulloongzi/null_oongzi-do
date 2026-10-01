// toast.js — 화면을 막지 않는 짧은 알림. 앱 SnackBar 와 같은 모양(다크 브라운 + 크림 글자, 모서리 --radius-toast).
//
// alert() 대신 쓴다: 작은 성공(복사됨·담았어요), 안내(권한·로그인 필요), 일반 오류.
// 사용자가 꼭 읽고 결정해야 하는 것(삭제 확인 등)과 입력 실수(칸 옆에 표시)는 토스트가 아니다.
// 문구 규칙: docs/voice-and-tone.md — 시스템 오류 원문(e.message)은 붙이지 말고 console 로.
//
//   window.showToast(msg)              2.4초 + 글자 수만큼(최대 6초) 보이고 사라진다
//   window.showToast(msg, { ms: 4000 })
(function () {
    var box = null, timer = null;

    function ensure() {
        if (box && box.parentNode) return box;
        box = document.createElement('div');
        box.className = 'nz-toast';
        box.setAttribute('role', 'status');      // 화면 낭독기가 읽어 준다
        box.setAttribute('aria-live', 'polite');
        document.body.appendChild(box);
        // 누르면 바로 닫힌다
        box.addEventListener('click', hide);
        return box;
    }

    function hide() {
        if (!box) return;
        box.classList.remove('show');
        clearTimeout(timer);
    }

    window.showToast = function (msg, opts) {
        if (!msg) return;
        var el = ensure();
        var text = String(msg);
        var ms = (opts && opts.ms) || Math.min(6000, 2400 + text.length * 40);
        el.textContent = text;
        // 같은 토스트가 연달아 오면 다시 떠오르는 움직임을 준다
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(timer);
        timer = setTimeout(hide, ms);
    };
    window.hideToast = hide;
})();
