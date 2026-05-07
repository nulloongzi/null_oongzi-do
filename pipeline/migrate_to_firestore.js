// JSON-only clubs migration script
// Run in browser console while logged in as admin on the app
// Pastes 6 legacy clubs into Firestore, then marks them is_verified=true

(async function () {
  if (!window.firebaseDB || !window.currentUser) {
    console.error("로그인 상태 확인: firebaseDB 또는 currentUser 없음");
    return;
  }

  const clubs = [
    {
      id: "24cc56787b76",
      name: "평택BLANK",
      target: "성인, 대학생",
      address: "경기 평택시 함박산로 10",
      schedule: "화 19:00~21:00 / 목 19:00~21:00",
      price: "월2만원/게스트1만원",
      contact: { insta: "blank_volleyball", link: "https://open.kakao.com/o/sIAltE9h" },
      coordinates: { lat: 37.0426733968881, lng: 127.043483106027 },
      is_urgent: false,
      urgent_msg: "",
    },
    {
      id: "946b791a9d19",
      name: "피터팬",
      target: "성인",
      address: "경기 용인시 기흥구 강남동로140번길 1-7",
      schedule: "화 18:00~21:00",
      price: "월 3만원 / 게스트 1만원",
      contact: { insta: "peterpan_vc", link: "" },
      coordinates: { lat: 37.2771824981245, lng: 127.134687230002 },
      is_urgent: true,
      urgent_msg: "3월 게스트비 무료‼️남녀회원 모집‼️",
    },
    {
      id: "eb51c870a0c3",
      name: "TVT",
      target: "무관",
      address: "경기도 구리시 벌말로 168",
      schedule: "일 09:00~13:00",
      price: "월 3만원 / 게스트 1만원",
      contact: { insta: "tvt_top.volleyball.team", link: "https://form.naver.com/response/_mTsRzfyqAcw_-_wF6d1Xw" },
      coordinates: { lat: 37.5914306625287, lng: 127.152048504701 },
      is_urgent: false,
      urgent_msg: "",
    },
    {
      id: "908ceb689179",
      name: "챔스",
      target: "성인, 대학생",
      address: "경기도 고양시 덕양구 행신로311번길 78",
      schedule: "화 18:00~21:00",
      price: "월 2 만원 / 게스트 5천원",
      contact: { insta: "champs.vc", link: "https://open.kakao.com/o/szY1nQ2h" },
      coordinates: { lat: 37.6237194495748, lng: 126.842224411918 },
      is_urgent: false,
      urgent_msg: "",
    },
  ];

  const uid = window.currentUser.uid;
  const now = firebase.firestore.FieldValue.serverTimestamp();

  for (const club of clubs) {
    const { id, ...data } = club;
    const docRef = window.firebaseDB.collection("clubs").doc(id);

    // create rule enforces is_verified=false on creation
    await docRef.set({
      ...data,
      id,
      registered_by: uid,
      is_verified: false,
      metadata: { created_at: now, updated_at: now, status: "approved", submitted_by: uid },
    });

    // admin update: flip to verified
    await docRef.update({ is_verified: true });

    console.log(`✅ ${club.name} (${id}) 마이그레이션 완료`);
  }

  console.log("🎉 전체 마이그레이션 완료!");
})();
