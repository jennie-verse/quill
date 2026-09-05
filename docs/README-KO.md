# Quill — 무엇인지, 파일 구조, 바꾸는 법

## 무엇인지

Quill은 iPhone·iPad에서 텍스트 파일을 편집하는 개인용 웹앱입니다. Mac의 TextEdit 자리를 iOS에서 대신합니다.

- 파일은 **iOS Files 앱**에 있습니다. Quill은 그때그때 열어서 편집하고 다시 내보냅니다.
- 문서 라이브러리가 아닙니다. 앱 안에 여러 파일을 쌓아 두지 않습니다.
- 인터넷 없이 완전히 오프라인으로 동작합니다. 서버·로그인·외부 요청이 없습니다.

저장소·배포 주소: `github.com/jennie-verse/quill` → `https://jennie-verse.github.io/quill/`

## 재작성한 이유

이전 버전은 Vite + React로 만들어졌는데 저장소에 **빌드 결과물만 있고 소스가 없었습니다.** 글자 하나도 고칠 수 없는 상태였습니다. 이번 버전은 빌드 도구 없이 그대로 배포되는 정적 파일이라 언제든 열어 고칠 수 있습니다.

## 파일 구조

```text
quill/
├─ .nojekyll                  GitHub Pages가 Jekyll로 처리하지 않도록 하는 표시 파일
├─ index.html                 화면 구조 + PWA 메타데이터
├─ manifest.webmanifest       홈 화면 설치 정보
├─ sw.js                      Service Worker — 오프라인 캐시
├─ assets/
│  ├─ app.css                 색상·글꼴·레이아웃 전체
│  └─ fonts/                  Lexend 400·700 (오프라인 동봉)
├─ src/
│  ├─ app.js                  화면 조립, 이벤트, 상태 (여기가 시작점)
│  ├─ version.js              APP_BUILD — sw.js의 VERSION과 반드시 같아야 함
│  ├─ settings.js             설정 저장·복원, 글자 크기 단계 정의
│  ├─ sync.js                 webapp-data 설정 동기화 (초안·글은 제외)
│  ├─ recovery.js             편집 중이던 초안 1건 (IndexedDB)
│  ├─ files.js                열기·내보내기·공유, 파일명·확장자 처리
│  ├─ editor.js               들여쓰기, 줄바꿈 승계, 상태 요약
│  ├─ find.js                 문서 안 검색
│  └─ backup.js               JSON 백업·복원
├─ icons/                     앱 아이콘 (이전 버전에서 그대로 가져옴)
├─ licenses/Lexend-OFL.txt    글꼴 라이선스
├─ tests/                     Node.js 테스트 (배포에는 영향 없음)
├─ package.json               재현 가능한 테스트 명령과 고정된 jsdom 의존성
├─ package-lock.json          npm ci용 lockfile
└─ docs/
   ├─ README-KO.md            이 문서
   ├─ USER-GUIDE-KO.md        사용 안내
   ├─ GITHUB-PAGES-KO.md      배포 안내
   └─ TEST-REPORT.md          검토 결과
```

빌드 단계가 없습니다. 이 폴더의 내용물을 그대로 GitHub Pages에 올리면 됩니다.

---

## 데이터가 저장되는 곳

| 위치 | 키 | 내용 |
|---|---|---|
| IndexedDB | `text-editor-recovery` → `drafts` → `active-draft` | 편집 중이던 초안 1건 |
| localStorage | `text-editor-settings-v1` | 글자 크기, 줄바꿈, 들여쓰기 등 설정 |
| localStorage | `text-editor-recovery-fallback-v1` | 앱을 갑자기 닫을 때를 대비한 초안 사본 |

**이름을 이전 버전과 똑같이 맞췄습니다.** 이전 버전에서 편집 중이던 초안이 그대로 이어집니다.

한 가지만 초기화됩니다: 이전 버전의 Interface Size는 Small/Standard/Large/Extra Large **4단계**였고, 이번 버전은 하우스 기준인 **6단계(6/8/10/12/14/17px)** 입니다. 값이 맞지 않으므로 글자 크기 하나만 기본값(12px)으로 돌아갑니다. 나머지 설정은 그대로 이어받습니다.

---

## 직접 바꾸기 쉬운 곳

| 바꾸고 싶은 것 | 파일 | 위치 |
|---|---|---|
| 앱 이름 | `manifest.webmanifest`, `index.html` | `name`, `short_name`, `<title>` |
| 색상 | `assets/app.css` | 맨 위 `:root` 블록 |
| 글꼴 | `assets/app.css` | `body { font-family: ... }` |
| UI 글자 크기 단계 | `src/settings.js` | `INTERFACE_SIZES` |
| 에디터 글자 크기 단계 | `src/settings.js` | `EDITOR_SIZES` |
| 빠른 확장자 목록 | `src/files.js` | `QUICK_EXTENSIONS` |
| 들여쓰기 칸 수 선택지 | `src/settings.js` | `TAB_SIZES` |
| 초안 자동 저장 간격 | `src/app.js` | `DRAFT_DEBOUNCE_MS` |

### 에디터 글자 크기가 16px부터인 이유

iPhone Safari는 글자가 16px보다 작은 입력창을 탭하면 **화면을 자동으로 확대**합니다. 편집할 때마다 화면이 튀면 쓰기 어려워집니다. 그래서 에디터 본문은 16px를 최소값으로 두었습니다.

작은 글자로 많이 보고 싶으시면 **Interface Size**를 6px나 8px로 줄이세요. 메뉴와 버튼만 작아지고 본문은 읽기 좋은 크기를 유지합니다.

---

## 로컬에서 확인하기

`file://`로 직접 열면 ES Modules와 Service Worker가 동작하지 않습니다. 간단한 정적 서버로 열어야 합니다.

```sh
cd quill
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000/ 을 엽니다
```

테스트는 Node.js 22에서 실행합니다.

```sh
npm ci
npm test                      # 단위 51건 + DOM 22건 + sync contract
```

`tests/` 폴더는 배포되어도 앱 동작에 영향을 주지 않습니다. 빼고 올려도 됩니다.

---

## 지키고 있는 것

- 외부 CDN·웹폰트 서버·분석 도구·로그인·유료 서버 없음
- 모든 경로가 상대 경로 — GitHub Pages 하위 경로(`/quill/`)에서 동작
- 사용자 텍스트를 HTML로 실행하지 않음 (`innerHTML`·`eval` 미사용)
- 외부로 요청을 보내지 않음
- `sw.js`를 고치면 `CACHE_NAME` 버전도 함께 올릴 것


## 동기화 (2026-08-10 추가)

`webapp-data`(비공개 저장소)에 **설정 7개만** 올립니다. 켜는 법은 [사용 안내](USER-GUIDE-KO.md)를 확인하세요.

| 파일 | 무엇 |
|---|---|
| `quill/settings.<기기>.json` | UI·에디터 글자 크기, 들여쓰기, 줄바꿈, 맞춤법, 자동 수정, 기본 확장자 |

이벤트(B층)와 백업(C층)은 **일부러 넣지 않았습니다.** 설정은 "한 일"이 아니라 Atlas·Trace에 남길 것이 없고, 백업은 기존 `Export Backup`이 그대로 담당합니다.

### 고칠 때 지켜야 하는 것 네 가지

1. **`Sync.markSettingsChanged()`는 `persistSettings()` 안에서만 부릅니다.** 앱이 켜질 때나 기본값을 그릴 때 부르면, 새로 깐 기기의 기본값이 최신 시각으로 올라가 다른 기기에서 맞춰 둔 설정을 덮습니다. 검사가 호출이 딱 하나인지 확인합니다.
2. **`src/sync.js`의 `SETTING_KEYS` 목록으로 필드를 골라 담습니다.** 넘어온 객체를 그대로 올리면 실수로 초안이 섞였을 때 그것이 저장소에 올라갑니다.
3. **`sw.js`의 `VERSION`과 `src/version.js`의 `APP_BUILD`는 항상 같은 값이어야 합니다.**
4. **동기화 모듈은 동적 `import()`로 부릅니다.** 정적으로 물리면 `sync.js` 하나를 못 받을 때 앱 전체가 빈 화면이 됩니다.

현재 저장소의 `tests/sync-contract.test.mjs`가 네 가지 핵심 contract를 확인합니다. `npm ci && npm test`로 재실행합니다.
