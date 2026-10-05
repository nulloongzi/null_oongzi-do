#!/usr/bin/env node
// check-copy-parity.js — 웹과 앱이 같은 상황에서 같은 말을 하는지 본다(docs/voice-and-tone.md).
// 알림(토스트·스낵바)·입력 칸 오류·확인 팝업·안내 문구가 대상이다. 화면 라벨은 플랫폼마다
// 자리가 달라 일부러 다르게 둔 것이 많아서 뺐다(docs/visual-parity.md).
//
//   node scripts/check-copy-parity.js                 웹 키가 모두 있는지만
//   node scripts/check-copy-parity.js --dart <앱 lib/l10n/strings.dart>   한·영 문구 비교
//
// 앱 저장소 .github/workflows/design-tokens.yml 이 매 push 마다 --dart 로 돌린다.
// 문구를 바꿀 땐 웹 js/i18n.js 와 앱 strings.dart 를 같이 고친다.
const fs = require('fs');
const path = require('path');

// 앱 키 → 웹 키 (이름이 같으면 같은 문자열)
const PAIRS = {
    // 알림
    link_copied: 'link_copied',
    address_copied: 'addr_copied',
    login_required: 'sh_login_required',
    login_err: 'au_login_fail',
    logout_confirm: 'au_logout_confirm',
    lb_full: 'lb_full',
    lb_already: 'lb_already',
    lb_added: 'lb_added_team',
    lb_added_custom: 'lb_added_custom',
    cf_created: 'reg_registered',
    cf_updated: 'reg_updated',
    cf_save_err: 'reg_error',
    pf_created: 'pk_created',
    pf_updated: 'pk_updated',
    pf_save_err: 'pk_create_err',
    verify_done: 'vf_done',
    vf_login_required: 'vf_login_required',
    vf_error: 'vf_error',
    rp_done: 'rp_done',
    ad_login_required: 'ad_login_required',
    ad_done: 'ad_done',
    ad_error: 'ad_error',
    ad_full: 'ad_full',
    ad_leave_done: 'ad_leave_done',
    ad_leave_error: 'ad_leave_error',
    nickname_done: 'nick_changed',
    nick_change_error: 'nick_change_error',
    cd_delete_error: 'cd_delete_error',
    pk_delete_error: 'pk_delete_error',
    cd_update_error: 'cd_update_error',
    // 입력 칸 오류
    cf_err_name: 'reg_err_name',
    cf_err_target: 'reg_err_target',
    cf_err_addr: 'reg_err_addr',
    cf_name_max: 'reg_name_max',
    cf_target_max: 'reg_target_max',
    cf_addr_max: 'reg_addr_max',
    cf_price_max: 'reg_price_max',
    cf_insta_invalid: 'reg_insta_invalid',
    f_link_invalid: 'reg_link_invalid',
    f_addr_notfound: 'reg_addr_notfound',
    pf_req: 'pk_req_fields',
    nickname_hyphen: 'nick_hyphen',
    nickname_dup: 'nick_dup',
    nick_empty: 'nick_empty',
    lb_add_name_empty: 'lb_add_name_empty',
    lb_add_time_empty: 'lb_add_time_empty',
    // 확인 팝업 — 제목과, 누르면 일어나는 일을 적은 버튼
    change_nickname: 'nick_title',
    nick_btn: 'nick_btn',
    cd_delete_confirm: 'cd_delete_confirm',
    cd_delete_btn: 'cd_delete_btn',
    pk_delete_confirm: 'pk_delete_confirm',
    pk_delete_btn: 'pk_delete_btn',
    urgent_on: 'cd_urgent_title',
    cd_urgent_btn: 'cd_urgent_btn',
    ad_leave_confirm: 'ad_leave_confirm',
    ad_leave: 'ad_leave_btn',
    lb_add_title: 'lb_add_title',
    lb_add_name_label: 'lb_add_name_label',
    lb_add_time_label: 'lb_add_time_label',
    lb_add_btn: 'lb_add_btn',
    lb_remove: 'lb_remove_btn',
    // 안내·상태 문구(웹 <br> 은 앱 \n 과 같게 본다)
    login_cancelled: 'au_login_cancelled',
    nickname_reserved: 'nickname_reserved',
    f_reel_invalid: 'insta_reel_invalid',
    pf_curated_hint: 'pk_f_curated_hint',
    pk_level_hint: 'pk_level_hint',
    lb_slot_rice: 'lb_slot_rice',
    lb_slot_soup: 'lb_slot_soup',
    vf_rejected: 'vf_rejected',
    vf_no_reason: 'vf_no_reason',
    ad_desc: 'ad_desc',
    ad_pending: 'ad_pending',
    ad_rejected: 'ad_rejected',
    ad_reason_full: 'ad_reason_full',
    ad_reason_already_admin: 'ad_reason_already_admin',
    ad_reason_not_found: 'ad_reason_not_found',
    ad_reason_duplicate: 'ad_reason_duplicate',
    reg_area_only_desc: 'reg_area_only_desc',
    reg_area_label_fail: 'reg_area_label_fail',
    cd_area_only_note: 'cd_area_only_note',
    rp_intro: 'rp_intro',
    rp_need_reason: 'rp_need_reason',
    fr_share_title: 'fr_share_title',
    fr_err_daily: 'fr_err_daily',
    fr_err_generic: 'fr_err_generic',
    // 서비스 이름 — 영어는 Nulloongzi-do 하나
    brand: 'brand',
    reels_hidden_notice: 'reels_hidden_notice',
    // 검색·필터 결과 0 안내
    empty_result: 'empty_result',
    empty_result_reset: 'empty_result_reset',
    // 급구 올리기 폼 · 마감 표시 · 필터 · 회원 모집(같은 키, 같은 문구)
    ug_when: 'ug_when',
    ug_other_day: 'ug_other_day',
    ug_end_time: 'ug_end_time',
    ug_msg_label: 'ug_msg_label',
    ug_msg_hint: 'ug_msg_hint',
    ug_auto_off: 'ug_auto_off',
    ug_submit: 'ug_submit',
    ug_edit: 'ug_edit',
    ug_err_unverified: 'ug_err_unverified',
    ug_err_past: 'ug_err_past',
    ug_err_too_far: 'ug_err_too_far',
    ug_err_msg_empty: 'ug_err_msg_empty',
    ug_err_msg_too_long: 'ug_err_msg_too_long',
    ug_err_msg_link: 'ug_err_msg_link',
    ug_err_msg_phone: 'ug_err_msg_phone',
    ug_err_not_manager: 'ug_err_not_manager',
    ug_err_blocked: 'ug_err_blocked',
    ug_err_generic: 'ug_err_generic',
    ug_until_today: 'ug_until_today',
    ug_until_tomorrow: 'ug_until_tomorrow',
    ug_until_day: 'ug_until_day',
    ug_filter: 'ug_filter',
    rc_badge: 'rc_badge',
    rc_on: 'rc_on',
    rc_off: 'rc_off',
    rc_msg_hint: 'rc_msg_hint',
    rc_auto_off: 'rc_auto_off',
    rc_filter: 'rc_filter',
    // 식구 모집 폼 · 🥄 맛보기 · 급구 풀이 · 🍚 여기 자리 있어요?
    rc_badge_desc: 'rc_badge_desc',
    rc_edit: 'rc_edit',
    rc_msg_label: 'rc_msg_label',
    rc_drop_in: 'rc_drop_in',
    rc_drop_in_desc: 'rc_drop_in_desc',
    rc_drop_in_ask: 'rc_drop_in_ask',
    rc_save: 'rc_save',
    rc_saved: 'rc_saved',
    rc_closed: 'rc_closed',
    ug_badge_desc: 'ug_badge_desc',
    tw_entry: 'tw_entry',
    tw_title: 'tw_title',
    tw_sub: 'tw_sub',
    tw_empty: 'tw_empty',
    tw_kind_guest: 'tw_kind_guest',
    tw_kind_drop_in: 'tw_kind_drop_in',
    tw_kind_pickup: 'tw_kind_pickup',
    tw_all_days: 'tw_all_days',
    tw_contact: 'tw_contact',
    tw_until: 'tw_until',
    // 이름만 있는 버튼(화면 낭독기)
    fab_lunchbox: 'fab_lunchbox',
    fab_profile: 'fab_profile',
    fab_my_location: 'fab_my_location',
    sheet_close: 'sheet_close'
};

// 'a\'b' · "a'b" → a'b. 줄바꿈(\n)은 양쪽 모두 이스케이프 그대로 비교한다.
function unquote(q, body) {
    return body.replace(new RegExp('\\\\' + q, 'g'), q).replace(/\\\\/g, '\\');
}
const STR = "('(?:\\\\.|[^'\\\\])*'|\"(?:\\\\.|[^\"\\\\])*\")";
function lit(s) { return unquote(s[0], s.slice(1, -1)); }

function readWeb() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');
    const re = new RegExp('^\\s*([a-z0-9_]+):\\s*\\{\\s*ko:\\s*' + STR + '\\s*,\\s*en:\\s*' + STR, 'gm');
    const out = {};
    let m;
    // 웹 화면 줄바꿈 <br> 은 앱 문자열의 \n 과 같은 뜻
    const br = (v) => v.replace(/<br>/g, '\\n');
    while ((m = re.exec(src))) out[m[1]] = { ko: br(lit(m[2])), en: br(lit(m[3])) };
    return out;
}

function readDart(file) {
    const src = fs.readFileSync(file, 'utf8');
    const re = new RegExp("'([a-z0-9_]+)':\\s*\\{\\s*'ko':\\s*" + STR + ",\\s*'en':\\s*" + STR, 'g');
    const out = {};
    let m;
    while ((m = re.exec(src))) out[m[1]] = { ko: lit(m[2]), en: lit(m[3]) };
    return out;
}

const web = readWeb();
const problems = [];
Object.keys(PAIRS).forEach((a) => { if (!web[PAIRS[a]]) problems.push('웹에 없는 키: ' + PAIRS[a]); });

const i = process.argv.indexOf('--dart');
if (i > 0) {
    const app = readDart(process.argv[i + 1]);
    Object.keys(PAIRS).forEach((a) => {
        const w = web[PAIRS[a]];
        const d = app[a];
        if (!d) { problems.push('앱에 없는 키: ' + a); return; }
        if (!w) return;
        ['ko', 'en'].forEach((lang) => {
            if (w[lang] !== d[lang]) {
                problems.push(a + ' ↔ ' + PAIRS[a] + ' (' + lang + ')\n    웹: ' + w[lang] + '\n    앱: ' + d[lang]);
            }
        });
    });
}

if (problems.length) {
    console.error('웹·앱 문구가 어긋났어요 (docs/voice-and-tone.md):\n  ' + problems.join('\n  '));
    process.exit(1);
}
console.log('copy parity ok — ' + Object.keys(PAIRS).length + ' pairs' + (i > 0 ? '' : ' (web keys only)'));
