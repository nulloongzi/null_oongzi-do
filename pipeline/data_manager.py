# data_manager.py
import csv
import json
import requests
import io
import os
import math
import hashlib
from config import GOOGLE_SHEET_URL, KAKAO_REST_KEY
from geocoder import get_location

KOREAN_REGIONS: list[str] = [
    "서울", "경기", "인천", "강원", "충남", "충북", "대전", "세종",
    "전남", "전북", "광주", "경남", "경북", "대구", "부산", "울산", "제주"
]

JSON_OUTPUT = os.path.join("..", "data", "volleyball_clubs_kakao.json")


def validate_club(
    name: str, address: str, schedule: str,
    target: str, price: str,
    is_urgent: bool, urgent_msg: str
) -> list[str]:
    """클럽 데이터의 품질을 검증하고 경고 목록을 반환한다."""
    warnings: list[str] = []
    if not schedule:
        warnings.append(f"[{name}] 스케줄 정보 없음")
    if not target:
        warnings.append(f"[{name}] 대상 정보 없음")
    if not price:
        warnings.append(f"[{name}] 회비 정보 없음")
    if address and not any(address.startswith(r) for r in KOREAN_REGIONS):
        warnings.append(f"[{name}] 주소 형식 의심: '{address[:20]}...'")
    if is_urgent and not urgent_msg:
        warnings.append(f"[{name}] 긴급모집 활성화되었으나 메시지 없음")
    return warnings


def load_cached_data() -> dict[tuple[str, str], dict]:
    """기존 JSON 캐시를 (name, address) 키로 로드한다."""
    cached_data: dict[tuple[str, str], dict] = {}
    if os.path.exists(JSON_OUTPUT):
        with open(JSON_OUTPUT, 'r', encoding='utf-8') as f:
            old_list = json.load(f)
            for club in old_list:
                key = (club['name'], club['address'])
                cached_data[key] = club
    return cached_data


def fetch_and_process_data() -> list[dict]:
    """구글 스프레드시트에서 클럽 데이터를 가져와 가공한다."""
    print("☁️ 구글 스프레드시트 동기화 중...")
    cached_data = load_cached_data()
    new_club_map: dict[tuple[str, str], dict] = {}
    all_warnings: list[str] = []

    try:
        response = requests.get(GOOGLE_SHEET_URL, timeout=10)
        response.raise_for_status()
        decoded_content = response.content.decode('utf-8')
        csv_reader = csv.reader(io.StringIO(decoded_content))
        next(csv_reader, None)

        count: int = 0
        new_count: int = 0

        for row in csv_reader:
            if len(row) < 4:
                continue
            name = row[1].strip() if len(row) > 1 else ""
            target = row[2].strip() if len(row) > 2 else ""
            address = row[3].strip() if len(row) > 3 else ""
            schedule = row[4].strip() if len(row) > 4 else ""
            price = row[5].strip() if len(row) > 5 else ""
            insta = row[6].strip() if len(row) > 6 else ""
            link = row[7].strip() if len(row) > 7 else ""
            is_urgent_val = row[9].strip().upper() if len(row) > 9 else ""
            is_urgent = (is_urgent_val == 'O')
            urgent_msg = row[10].strip() if len(row) > 10 else ""

            if not name or not address:
                continue

            warnings = validate_club(name, address, schedule, target, price, is_urgent, urgent_msg)
            all_warnings.extend(warnings)

            key = (name, address)
            if key in cached_data:
                club = cached_data[key]
                club.update({
                    'target': target, 'schedule': schedule, 'price': price,
                    'insta': insta, 'link': link, 'is_urgent': is_urgent,
                    'urgent_msg': urgent_msg
                })
                new_club_map[key] = club
            else:
                print(f"✨ 업데이트 감지: {name} (좌표 갱신 중...)")
                lat, lng = get_location(address)
                if lat and lng:
                    new_club_map[key] = {
                        "name": name, "target": target, "address": address,
                        "schedule": schedule, "price": price,
                        "insta": insta, "link": link,
                        "lat": lat, "lng": lng,
                        "is_urgent": is_urgent,
                        "urgent_msg": urgent_msg
                    }
                    new_count += 1
            count += 1

        if all_warnings:
            print(f"\n⚠️ 데이터 품질 경고 ({len(all_warnings)}건):")
            for w in all_warnings:
                print(f"  - {w}")
            print()

        print(f"✅ 총 {count}개 팀 처리 완료 (신규 {new_count}개)")
        return list(new_club_map.values())

    except Exception as e:
        print(f"❌ 데이터 처리 중 오류: {e}")
        return []


def apply_spiral_coordinates(club_list: list[dict]) -> list[dict]:
    """좌표 겹침을 나선형 배치로 해소하고 고유 ID를 부여한다."""
    adjusted_list: list[dict] = []
    clubs_by_coord: dict[tuple[float, float], list[dict]] = {}

    for club in club_list:
        coord = (club['lat'], club['lng'])
        if coord not in clubs_by_coord:
            clubs_by_coord[coord] = []
        clubs_by_coord[coord].append(club)

    for coord, clubs in clubs_by_coord.items():
        if len(clubs) == 1:
            adjusted_list.append(clubs[0])
        else:
            base_lat, base_lng = coord
            radius = 0.0001
            for i, club in enumerate(clubs):
                angle = (2 * math.pi / len(clubs)) * i
                club['lat'] = base_lat + radius * math.sin(angle)
                club['lng'] = base_lng + radius * math.cos(angle)
                club['angle'] = angle
                adjusted_list.append(club)

    for club in adjusted_list:
        unique_str = club['name'] + club['address']
        club['id'] = hashlib.md5(unique_str.encode('utf-8')).hexdigest()[:12]

    return adjusted_list


def save_json(final_list: list[dict]) -> None:
    """클럽 데이터를 JSON 파일로 저장한다."""
    with open(JSON_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, ensure_ascii=False, indent=4)
