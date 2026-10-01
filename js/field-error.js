// field-error.js — 입력 실수를 틀린 칸 바로 아래에 적는다(alert 대신). NN/g: 오류는 난 자리 옆에.
//
//   window.fieldError(target, msg, opts)  target: 요소 또는 id. 칸에 빨간 테두리 + 아래에 이유 한 줄,
//                                         그 칸으로 스크롤·포커스. 칸을 고치기 시작하면 저절로 사라진다.
//     opts.focus  false 면 포커스를 옮기지 않는다(여러 칸을 한 번에 표시할 때 첫 칸만 true)
//     opts.after  이유를 붙일 자리(기본: 칸 바로 뒤. 칸이 가로로 나란한 줄 안에 있으면 그 줄 뒤)
//   window.clearFieldError(target)  window.clearFieldErrors(root)
//
// 문구는 docs/voice-and-tone.md — 무엇이 + 어떻게, 탓하지 않기. 칸이 없으면 토스트로 대신한다.
(function () {
    function $(t) { return typeof t === 'string' ? document.getElementById(t) : t; }

    function anchorOf(el, opts) {
        if (opts && opts.after) return $(opts.after);
        var parent = el.parentElement;
        if (parent && parent.children.length > 1) {
            var cs = window.getComputedStyle(parent);
            if (cs.display.indexOf('flex') >= 0 && cs.flexDirection.indexOf('row') === 0) return parent;
        }
        return el;
    }

    function msgId(el) {
        if (!el.id) el.id = 'nzf' + Math.random().toString(36).slice(2, 8);
        return el.id + '-err';
    }

    window.clearFieldError = function (target) {
        var el = $(target);
        if (!el) return;
        el.classList.remove('field-invalid', 'reg-invalid');
        el.removeAttribute('aria-invalid');
        var id = el.id ? el.id + '-err' : '';
        var box = id && document.getElementById(id);
        if (box && box.parentNode) box.parentNode.removeChild(box);
        var described = (el.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x && x !== id; });
        if (described.length) el.setAttribute('aria-describedby', described.join(' '));
        else el.removeAttribute('aria-describedby');
    };

    window.clearFieldErrors = function (root) {
        var scope = $(root) || document;
        var els = scope.querySelectorAll('.field-invalid, .reg-invalid');
        for (var i = 0; i < els.length; i++) window.clearFieldError(els[i]);
    };

    window.fieldError = function (target, msg, opts) {
        opts = opts || {};
        var el = $(target);
        if (!el) { if (window.showToast) window.showToast(msg); return; }
        window.clearFieldError(el);

        el.classList.add('field-invalid');
        el.setAttribute('aria-invalid', 'true');
        var id = msgId(el);
        var box = document.createElement('div');
        box.className = 'field-error';
        box.id = id;
        box.setAttribute('role', 'alert'); // 화면 낭독기가 바로 읽는다
        box.textContent = msg;
        anchorOf(el, opts).insertAdjacentElement('afterend', box);
        var described = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        described.push(id);
        el.setAttribute('aria-describedby', described.join(' '));

        // 접힌 '선택 정보' 안의 칸이면 펼친다
        var details = el.closest && el.closest('details');
        if (details && !details.open) details.open = true;

        // 칸을 고치기 시작하면 사라진다(칩 묶음은 칩을 누르면)
        var clear = function () {
            window.clearFieldError(el);
            el.removeEventListener('input', clear);
            el.removeEventListener('change', clear);
            el.removeEventListener('click', clear);
        };
        el.addEventListener('input', clear);
        el.addEventListener('change', clear);
        if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.addEventListener('click', clear);

        if (opts.focus !== false) {
            try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
            if (typeof el.focus === 'function') el.focus({ preventScroll: true });
        }
    };
})();
