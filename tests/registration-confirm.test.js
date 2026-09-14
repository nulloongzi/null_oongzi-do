// tests/registration-confirm.test.js
// 등록/수정에서 찾은 위치를 **확인받는** 단계.
//
// 예전엔 '등록하기'를 누르면 조용히 지오코딩하고 바로 저장했다. 사용자는 자기
// 팀이 어디에 찍혔는지 한 번도 못 봤고, 엉뚱한 곳이어도 알 수 없었다. 질의
// 재시도(placeQueryVariants)를 붙이면서 '그럴듯하지만 틀린 곳'에 조용히 성공할
// 여지가 늘어, 확인 단계가 더 필요해졌다.
//
// 실행: node --test tests/registration-confirm.test.js

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'registration.js'), 'utf-8');
// Map picker 섹션만 떼어 낸다 — 나머지는 DOM/Firebase 에 깊이 얽혀 있다.
const section = src.slice(src.indexOf('// ── Map picker ──'), src.indexOf('// ── Submit registration ──'));

let els, sandbox, mapCenter, mapLevel, coord2AddressResult;

function makeEl() { return { style: {}, value: '', textContent: '' }; }

beforeEach(() => {
    els = {
        mapPickerOverlay: makeEl(), regModalOverlay: makeEl(),
        mpConfirmPanel: makeEl(), mpConfirmBtn: makeEl(), mpMatched: makeEl(),
        regAddress: makeEl()
    };
    mapCenter = { lat: 37.5, lng: 127.0 };
    mapLevel = 8;
    coord2AddressResult = [{ road_address: { address_name: '서울 광진구 아차산로 452' } }];

    sandbox = {
        window: {
            t: (k) => k,
            tf: (k, p) => k + ':' + JSON.stringify(p),
            map: {
                setCenter: (ll) => { mapCenter = { lat: ll.lat, lng: ll.lng }; },
                getCenter: () => ({ getLat: () => mapCenter.lat, getLng: () => mapCenter.lng }),
                getLevel: () => mapLevel,
                setLevel: (v) => { mapLevel = v; }
            }
        },
        document: { getElementById: (id) => els[id] || null },
        kakao: {
            maps: {
                LatLng: function (lat, lng) { this.lat = lat; this.lng = lng; },
                services: {
                    Status: { OK: 'OK' },
                    Geocoder: function () {
                        this.coord2Address = (lng, lat, cb) => cb(coord2AddressResult, 'OK');
                    }
                }
            }
        },
        console
    };
    vm.createContext(sandbox);
    vm.runInContext(section, sandbox);
});

const w = () => sandbox.window;
// vm 안에서 만든 객체는 prototype 이 달라 deepStrictEqual 이 걸린다. 값만 본다.
const plain = (v) => JSON.parse(JSON.stringify(v));

describe('확인 모드 — 찾은 위치를 보여주고 물어본다', () => {
    test('확인 패널이 뜨고 지도를 결과 좌표로 옮긴다', async () => {
        w().confirmLocationOnMap({ lat: 37.5461, lng: 127.0861 },
            { placeName: '광남초등학교', roadAddress: '서울 광진구 아차산로 452' });
        assert.strictEqual(els.mpConfirmPanel.style.display, 'block');
        assert.deepStrictEqual(mapCenter, { lat: 37.5461, lng: 127.0861 });
    });

    // 멀리서 보면 '맞다'고 눌러버리기 쉽다. 그게 지금 문제의 원인이라 당겨준다.
    test('건물을 구분할 수 있는 배율까지 당긴다', async () => {
        mapLevel = 8;
        w().confirmLocationOnMap({ lat: 37.5, lng: 127.0 }, {});
        assert.ok(mapLevel <= 3, '배율이 ' + mapLevel + ' 로 남았다');
    });

    test('이미 충분히 당겨져 있으면 건드리지 않는다', async () => {
        mapLevel = 2;
        w().confirmLocationOnMap({ lat: 37.5, lng: 127.0 }, {});
        assert.strictEqual(mapLevel, 2);
    });

    // 무엇에 매칭됐는지 안 보여주면 사용자가 맞는지 판단할 근거가 없다.
    test('매칭된 장소명·주소를 안내에 넣는다', async () => {
        w().confirmLocationOnMap({ lat: 37.5, lng: 127.0 },
            { placeName: '광남초등학교', roadAddress: '서울 광진구 아차산로 452' });
        assert.match(els.mpMatched.textContent, /광남초등학교/);
        assert.match(els.mpMatched.textContent, /아차산로 452/);
    });

    test('매칭 정보가 없으면 안내는 비어 있다', async () => {
        w().confirmLocationOnMap({ lat: 37.5, lng: 127.0 }, {});
        assert.strictEqual(els.mpMatched.textContent, '');
    });
});

describe('확인 결과가 저장으로 돌아간다', () => {
    test('확정하면 ok:true 와 좌표를 돌려준다', async () => {
        const p = w().confirmLocationOnMap({ lat: 37.5461, lng: 127.0861 }, {});
        w().confirmMapPicker();
        assert.deepStrictEqual(plain(await p), { ok: true, coords: { lat: 37.5461, lng: 127.0861 } });
    });

    // 확인 단계의 핵심: 사용자가 지도를 움직였으면 **옮긴 좌표**가 저장돼야 한다.
    test('지도를 옮겼으면 옮긴 좌표를 돌려준다', async () => {
        const p = w().confirmLocationOnMap({ lat: 37.5461, lng: 127.0861 }, {});
        mapCenter = { lat: 37.6000, lng: 127.1000 };
        w().confirmMapPicker();
        const r = await p;
        assert.deepStrictEqual(plain(r.coords), { lat: 37.6000, lng: 127.1000 });
    });

    // 취소는 저장을 막아야 한다. ok:true 로 새면 확인 단계가 장식이 된다.
    test('취소하면 ok:false — 저장이 진행되면 안 된다', async () => {
        const p = w().confirmLocationOnMap({ lat: 37.5, lng: 127.0 }, {});
        w().cancelMapPicker();
        assert.deepStrictEqual(plain(await p), { ok: false });
    });

    test('확정·취소 모두 오버레이를 정리한다', async () => {
        const p = w().confirmLocationOnMap({ lat: 37.5, lng: 127.0 }, {});
        w().confirmMapPicker();
        await p;
        assert.strictEqual(els.mapPickerOverlay.style.display, 'none');
        assert.strictEqual(els.regModalOverlay.style.display, 'flex');
    });
});

describe('확인 모드는 주소칸을 건드리지 않는다', () => {
    // 사용자가 적은 '광남초등학교 체육관' 이 팀을 찾는 사람들의 검색어이기도 하다.
    // 여기서 도로명으로 갈아끼우면 '내가 쓴 게 왜 바뀌었지' 가 된다.
    test('확정해도 입력값이 그대로다', async () => {
        els.regAddress.value = '광남초등학교 체육관';
        const p = w().confirmLocationOnMap({ lat: 37.5, lng: 127.0 }, {});
        w().confirmMapPicker();
        await p;
        assert.strictEqual(els.regAddress.value, '광남초등학교 체육관');
    });

    // 반대로 '지도에서 찾기' 는 사용자가 직접 고른 것이라 주소를 채워준다.
    test('일반 피커는 기존대로 도로명을 채운다', async () => {
        els.regAddress.value = '';
        w().startMapPicker();
        assert.strictEqual(els.mpConfirmPanel.style.display, 'none');
        w().confirmMapPicker();
        assert.strictEqual(els.regAddress.value, '서울 광진구 아차산로 452');
    });
});
