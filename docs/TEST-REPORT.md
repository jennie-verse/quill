# Quill 검토 결과 — 2026-09-05 첫 릴리즈

대상: `WebApp/Published/quill/` (버전 `2026.09.05-initial1`)
기준: `WebApp_House_Style.md` 10장, 프로젝트 지시문 검토 기준

## 요약

| 구분 | 건수 |
|---|---|
| 자동 테스트 통과 | 92 (단위 59 + 화면 22 + sync/journal/layout 11) |
| 실기기에서 직접 확인하실 항목 | 8 |

콘솔 오류 **0건**. 외부 요청 **0건**.

---

## 1. 통과한 항목

### 자동 테스트

```sh
npm ci
npm test
# node tests/unit.test.mjs        → 59 통과
# node tests/dom.test.mjs         → 22 통과
# node --test sync-contract/journal/layout → 11 통과
```

**단위 테스트 59건** — 들여쓰기·내어쓰기·줄바꿈 승계, 검색(대소문자·순환·한글·정규식 문자), 파일명 검증, 확장자 분리·결합, 바이너리 판정, 설정 정규화, 스냅샷·백업 형식 검사와 왕복.

**화면 테스트 22건** — 초기화 시 콘솔 오류 0건, 설정 화면 배선, 이름 없는 버튼 0개, label 없는 입력창 0개, Find 동작, 사용자 텍스트가 HTML로 실행되지 않음.

**sync/journal/layout 11건** — Journal 계약(문서 텍스트 미노출), 백업 원장이 Quill 메타데이터만 받음, 320px 툴바 접근성 이름 유지, 메뉴 다이얼로그 통합, sync 모듈 선택적 로딩, 승인된 7개 설정만 동기화, `sw.js` VERSION과 `src/version.js` 일치, sync 저장소 소유자를 Pages 호스트명에서 유도.

### 코드와 PWA

| 항목 | 결과 |
|---|---|
| Console 오류 | 0건 |
| `sw.js` VERSION / `src/version.js` APP_BUILD | 둘 다 `2026.09.05-initial1`로 일치 |
| 빌드 도구 | 없음. 폴더를 그대로 배포 |
| 외부 CDN·웹폰트·분석·로그인 | 없음. 외부 URL 0건 |

### 첫 릴리즈 초기화 동작 (fresh-start reset)

`src/app.js`의 `runFreshStartResetOnce()`가 `init()` 첫머리에서 실행됩니다.

- `localStorage`의 `quill.freshStart.2026.09.05-initial1` 마커가 없을 때 **한 번만** 동작
- Quill 전용 키(설정·복구 폴백·Journal 활성/기록·sync 활성/시각)를 제거하고 `text-editor-recovery` IndexedDB를 통째로 삭제
- **`sync.token.v1`은 건드리지 않음** — 이 키는 `Published/*` 전체가 같은 github.io 오리진에서 공유하므로, 여기서 지우면 다른 앱의 로그인도 함께 풀림
- 마커를 남긴 뒤에는 같은 빌드에서 다시 실행되지 않음 (배포 후 재방문 시 데이터가 반복해서 지워지지 않음)

### 하우스 기준

대표색 Soft Rose Pink, 본문 순수 검정 미사용, Lexend+Verdana 동봉, 글자 크기 6단계, 입력창 16px 고정, 터치 영역 44×44px, Safe Area, Focus 표시, 색 외 상태 단서, `prefers-reduced-motion`, 삭제 전 확인창, 앱 UI 영문, 한글 파일명 허용 — 모두 기존대로 유지. 별도 변경 없음.

---

## 2. 실기기에서 직접 확인하실 항목 (Pending)

jsdom은 Safari가 아니고, 파일 선택·공유 시트·IndexedDB·키보드·fresh-start 초기화는 실제 기기에서만 확인됩니다.

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | **첫 실행 초기화** | 이전 버전을 쓰던 기기에서 앱을 열어 설정·초안·스냅샷이 깨끗이 비워지는지, `sync.token.v1`(로그인)은 그대로 남는지 |
| 2 | **재실행 시 재초기화 안 됨** | 1번 확인 후 앱을 다시 열어도 데이터가 또 지워지지 않는지 |
| 3 | **파일 열기/저장** | Open/Save 왕복, 한글 파일명 포함 |
| 4 | **새로고침 후 데이터 유지** | 글을 쓰고 종료 후 재실행 시 `Draft restored` |
| 5 | **백업·복원** | Export Backup → Restore Backup 왕복, 한글 무손실 |
| 6 | **한글 IME** | 조합 중 Tab/Enter로 글자 중복·깨짐 없는지 |
| 7 | **오프라인 실행 / Add to Home Screen** | 비행기 모드 재실행, 홈 화면 추가 후 standalone 실행 |
| 8 | **화면 방향·Safe Area** | iPhone/iPad 세로·가로 4가지, 노치·홈 인디케이터 가림 없는지 |

---

## 3. 배포 전 남은 일

1. 위 Pending 8건을 실기기에서 확인
2. `docs/GITHUB-PAGES-KO.md` 순서대로 배포 확인


## 2026-09-08 안정성 개선 검증

- 수정: Find 및 편집기의 한글 조합 Enter 보호, 페이지 이동 시 화면의 최신 초안 복구, 업데이트 시 초안·설정 보존.
- 로컬 회귀 검사 및 JavaScript 문법 검사: 통과.
- Chromium 1280×900 / 390×844: 주요 조작, 재시작 후 기존 데이터 보존, 화면·페이지 오류 검사 통과.
- Service Worker를 통한 오프라인 앱 재실행: 통과.
- 실제 iPhone/iPad Safari, iCloud 공유, 실제 비공개 GitHub 데이터 동기화: 실기기 확인 필요.
