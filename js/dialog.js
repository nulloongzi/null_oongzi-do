// dialog.js — 누룽지 모양 가운데 팝업. 브라우저 기본 confirm()·prompt() 대신 쓴다.
// 모양은 공유 팝업과 같다(--radius-dialog, 갈색 딤). 앱 AlertDialog(theme.dart dialogTheme)와 같은 규칙.
//
//   window.nzConfirm({ title, message, confirm, cancel, danger })            → Promise<boolean>
//   window.nzPrompt({ title, message, fields, confirm, cancel, validate })   → Promise<{name: value} | null>
//     fields:   [{ name, label, value, placeholder, maxLength, readonly, select }]
//     validate: (values) => { name: '이유' } | null — Promise 도 된다. 틀리면 팝업을 닫지 않고 칸 아래에 적는다
//     danger:   되돌릴 수 없는 일(삭제 등) — 확인 버튼이 진한 주황, 처음 포커스는 '취소'
//     hideCancel: 버튼 하나만(예: 링크를 직접 복사하게 보여줄 때)
//
// 문구 규칙(docs/voice-and-tone.md): 버튼엔 누르면 일어나는 일을 그대로('팀 지우기', '로그아웃'),
// '확인'만 쓰지 않는다. 바깥 누르기·Esc·폰 뒤로가기는 취소.
(function () {
    var seq = 0;

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function T(k, fb) { return (window.t && window.t(k)) || fb; }

    function show(opts) {
        return new Promise(function (resolve) {
            var id = 'nzd' + (++seq);
            var prevFocus = document.activeElement;
            var fields = opts.fields || [];
            var done = false;

            var overlay = el('div', 'nz-dialog-overlay');
            var form = el('form', 'nz-dialog');
            form.setAttribute('role', opts.danger ? 'alertdialog' : 'dialog');
            form.setAttribute('aria-modal', 'true');
            form.setAttribute('aria-labelledby', id + '-t');
            form.noValidate = true;

            var title = el('h2', 'nz-dialog-title', opts.title || '');
            title.id = id + '-t';
            form.appendChild(title);
            if (opts.message) {
                var msg = el('p', 'nz-dialog-msg', opts.message);
                msg.id = id + '-m';
                form.setAttribute('aria-describedby', msg.id);
                form.appendChild(msg);
            }

            var inputs = {};
            fields.forEach(function (f) {
                var wrap = el('div', 'nz-dialog-field');
                var input = el('input', 'nz-dialog-input');
                input.type = 'text';
                input.id = id + '-' + f.name;
                if (f.label) {
                    var label = el('label', 'nz-dialog-label', f.label);
                    label.htmlFor = input.id;
                    wrap.appendChild(label);
                }
                if (f.value != null) input.value = f.value;
                if (f.placeholder) input.placeholder = f.placeholder;
                if (f.maxLength) input.maxLength = f.maxLength;
                if (f.readonly) input.readOnly = true;
                input.autocomplete = 'off';
                wrap.appendChild(input);
                form.appendChild(wrap);
                inputs[f.name] = input;
            });

            var actions = el('div', 'nz-dialog-actions');
            var cancelBtn = null;
            if (!opts.hideCancel) {
                cancelBtn = el('button', 'nz-btn nz-btn-ghost', opts.cancel || T('dlg_cancel', '취소'));
                cancelBtn.type = 'button';
                cancelBtn.addEventListener('click', function () { finish(null); });
                actions.appendChild(cancelBtn);
            }
            var okBtn = el('button', 'nz-btn ' + (opts.danger ? 'nz-btn-danger' : 'nz-btn-primary'),
                opts.confirm || T('dlg_ok', '확인'));
            okBtn.type = 'submit';
            actions.appendChild(okBtn);
            form.appendChild(actions);
            overlay.appendChild(form);

            function values() {
                var v = {};
                fields.forEach(function (f) { v[f.name] = f.readonly ? inputs[f.name].value : inputs[f.name].value.trim(); });
                return v;
            }

            function hide() {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                document.removeEventListener('keydown', onKey, true);
                if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) {
                    try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
                }
            }
            function finish(result) {
                if (done) return;
                done = true;
                hide();
                if (window.backNav) window.backNav.closed('dialog');
                resolve(result);
            }

            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                if (done) return;
                if (!fields.length) { finish(true); return; }
                var v = values();
                if (opts.validate) {
                    okBtn.disabled = true;
                    var errs = null;
                    try { errs = await opts.validate(v); } catch (err) { console.warn('입력 확인 실패:', err); }
                    okBtn.disabled = false;
                    var names = errs ? Object.keys(errs).filter(function (k) { return errs[k]; }) : [];
                    if (names.length) {
                        names.forEach(function (k, i) {
                            if (window.fieldError) window.fieldError(inputs[k], errs[k], { focus: i === 0 });
                        });
                        return;
                    }
                }
                finish(v);
            });
            // 바깥(딤) 누르기 = 취소
            overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(null); });

            // Esc = 취소, Tab 은 팝업 안에서만 돈다
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); finish(null); return; }
                if (e.key !== 'Tab') return;
                var f = form.querySelectorAll('input:not([disabled]), button:not([disabled])');
                if (!f.length) return;
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
            document.addEventListener('keydown', onKey, true);

            document.body.appendChild(overlay);
            // 폰 뒤로가기 = 취소(js/back-nav.js)
            if (window.backNav) window.backNav.open('dialog', function () { if (!done) { done = true; hide(); resolve(null); } });

            // 처음 포커스: 입력 칸 → 위험한 결정이면 '취소' → 아니면 확인 버튼
            var firstInput = fields.length ? inputs[fields[0].name] : null;
            var target = firstInput || (opts.danger && cancelBtn) || okBtn;
            setTimeout(function () {
                target.focus();
                if (firstInput && (fields[0].select || fields[0].readonly)) firstInput.select();
            }, 0);
        });
    }

    window.nzConfirm = function (opts) {
        return show(Object.assign({}, opts, { fields: null })).then(function (r) { return r === true; });
    };
    window.nzPrompt = function (opts) { return show(opts); };
})();
