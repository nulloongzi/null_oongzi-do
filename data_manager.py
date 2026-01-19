# data_manager.py
import csv
import json
import requests
import io
import os
import math
from config import GOOGLE_SHEET_URL, JSON_FILE_NAME, MANIFEST_FILE_NAME, IS_TEST_MODE
from geocoder import get_location

def load_cached_data():
    cached_data = {}
    if os.path.exists(JSON_FILE_NAME):
        with open(JSON_FILE_NAME, 'r', encoding='utf-8') as f:
            old_list = json.load(f)
            for club in old_list:
                key = (club['name'], club['address'])
                cached_data[key] = club
    return cached_data

def fetch_and_process_data():
    print("☁️ 구글 스프레드시트 동기화 중...")
    cached_data = load_cached_data()
    new_club_map = {}
    
    try:
        response = requests.get(GOOGLE_SHEET_URL, timeout=10)
        response.raise_for_status()
        decoded_content = response.content.decode('utf-8')
        csv_reader = csv.reader(io.StringIO(decoded_content))
        next(csv_reader, None) # 헤더 스킵

        count = 0
        new_count = 0

        for row in csv_reader:
            if len(row) < 4: continue
            
            # 데이터 파싱
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

            if not name or not address: continue

            key = (name, address)
            
            if key in cached_data:
                club = cached_data[key]
                # 기존 데이터 업데이트
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
        
        print(f"✅ 총 {count}개 팀 처리 완료")
        return list(new_club_map.values())

    except Exception as e:
        print(f"❌ 데이터 처리 중 오류: {e}")
        return []

def apply_spiral_coordinates(club_list):
    # 좌표 겹침 처리 (나선형 배치)
    adjusted_list = []
    clubs_by_coord = {}
    
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
    
    # ID 부여
    for idx, club in enumerate(adjusted_list):
        club['id'] = idx
        
    return adjusted_list

def save_json(final_list):
    with open(JSON_FILE_NAME, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, ensure_ascii=False, indent=4)

def generate_manifest(html_filename):
    manifest_content = {
        "name": "누룽지도",
        "short_name": "누룽지도",
        "start_url": "./" + html_filename,
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#ffffff",
        "icons": [
            {"src": "https://cdn-icons-png.flaticon.com/512/528/528098.png", "sizes": "192x192", "type": "image/png"},
            {"src": "https://cdn-icons-png.flaticon.com/512/528/528098.png", "sizes": "512x512", "type": "image/png"}
        ]
    }
    with open(MANIFEST_FILE_NAME, 'w', encoding='utf-8') as f:
        json.dump(manifest_content, f, ensure_ascii=False, indent=4)