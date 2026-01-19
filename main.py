# main.py
from data_manager import fetch_and_process_data, apply_spiral_coordinates, save_json, generate_manifest
from map_renderer import render_html

def main():
    # 1. 데이터 가져오기 및 가공
    raw_data = fetch_and_process_data()
    if not raw_data:
        print("❌ 데이터를 가져오지 못해 종료합니다.")
        return

    # 2. 좌표 보정 (나선형 배치)
    final_list = apply_spiral_coordinates(raw_data)

    # 3. JSON 저장
    save_json(final_list)

    # 4. HTML 생성
    output_html = render_html(final_list)

    # 5. Manifest 생성
    generate_manifest(output_html)

    print(f"🎉 지도({output_html}) 및 데이터 갱신 완료!")

if __name__ == "__main__":
    main()