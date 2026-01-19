# map_renderer.py
import json
import os
from config import KAKAO_JS_KEY, IS_TEST_MODE

def render_html(club_list):
    if IS_TEST_MODE:
        output_file = "test_new.html"
        print("🔧 현재 모드: [테스트] -> test_new.html 생성")
    else:
        output_file = "index.html"
        print("🚀 현재 모드: [배포/실전] -> index.html 생성")

    # 중심 좌표 계산 (GVT 팀 기준, 없으면 서울 시청)
    center_lat, center_lng = 37.5665, 126.9780
    for club in club_list:
        if "GVT" in club['name']:
            center_lat, center_lng = club['lat'], club['lng']
            break

    # 템플릿 읽기
    template_path = os.path.join("templates", "map_template.html")
    with open(template_path, "r", encoding="utf-8") as f:
        template_content = f.read()

    # 데이터 주입 (Python replace 사용)
    # 주의: JSON 덤프 시 따옴표 등이 깨지지 않도록 처리
    clubs_json = json.dumps(club_list, ensure_ascii=False)
    
    html_content = template_content.replace("__KAKAO_JS_KEY__", KAKAO_JS_KEY)
    html_content = html_content.replace("__CENTER_LAT__", str(center_lat))
    html_content = html_content.replace("__CENTER_LNG__", str(center_lng))
    html_content = html_content.replace("__CLUBS_JSON__", clubs_json)

    # HTML 파일 쓰기
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(html_content)
        
    return output_file