# main.py - JSON 데이터만 생성 (HTML 생성 제거됨)
from data_manager import fetch_and_process_data, apply_spiral_coordinates, save_json


def main() -> None:
    raw_data = fetch_and_process_data()
    if not raw_data:
        print("❌ 데이터를 가져오지 못해 종료합니다.")
        return

    final_list = apply_spiral_coordinates(raw_data)
    save_json(final_list)
    print(f"🎉 데이터 갱신 완료! ({len(final_list)}개 팀)")


if __name__ == "__main__":
    main()
