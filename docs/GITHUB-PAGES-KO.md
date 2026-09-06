# Quill 배포 안내 (GitHub Pages)

Quill은 빌드 없는 정적 앱이지만, 테스트와 package metadata가 Pages에 섞이지 않도록 GitHub Actions가 runtime allowlist만 배포합니다.

저장소와 주소는 그대로 씁니다. 한 번 정한 주소는 바꾸지 않습니다.

- 저장소: `github.com/jennie-verse/quill`
- 주소: `https://jennie-verse.github.io/quill/`

---

## 1. 배포 전 준비

- `npm ci && npm test`가 통과해야 합니다.
- `sw.js`의 `VERSION`과 `src/version.js`의 `APP_BUILD`가 같아야 합니다.
- `.github/workflows/deploy.yml`의 allowlist에 새 runtime 파일이 빠지지 않았는지 확인합니다.
- `node_modules/`, `tests/`, `package*.json`은 테스트에만 쓰며 Pages artifact에는 넣지 않습니다.

---

## 2. 올리는 순서

authoritative source인 `WebApp/Published/quill/`에서 수정하고 테스트합니다.

```sh
npm ci
npm test
git add -A
git commit -m "Describe the Quill update"
git push
```

`.github/workflows/deploy.yml`은 테스트 성공 후 `.nojekyll`, `README.md`, `index.html`, manifest, `sw.js`, `assets/`, `docs/`, `icons/`, `licenses/`, `src/`만 배포합니다. `tests/`, `package*.json`, `.github/`, `node_modules/`는 artifact에서 제외합니다.

---

## 3. Pages 설정 바꾸기

Pages 배포 소스는 **GitHub Actions**를 사용합니다.

1. 저장소의 **Settings → Pages** 를 엽니다.
2. **Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
3. `Test and deploy GitHub Pages` workflow가 성공했는지 확인합니다.

배포에는 보통 1~2분 걸립니다.

---

## 4. 확인

1. `https://jennie-verse.github.io/quill/` 를 Safari에서 엽니다.
2. 글자를 몇 자 입력해 봅니다.
3. **Settings** 를 열어 화면이 정상인지 봅니다.
4. 기기를 비행기 모드로 두고 앱을 다시 열어 오프라인 실행을 확인합니다.

이전 화면이 계속 보이면 홈 화면 앱을 완전히 종료했다가 다시 엽니다.

---

## 5. 나중에 고칠 때

`sw.js` 를 수정하면 **반드시 `CACHE_NAME` 의 버전도 함께 올립니다.**

```js
const CACHE_NAME = 'quill-shell-v1';   // → 'quill-shell-v2'
```

버전을 그대로 두면 기기에 남은 예전 캐시가 계속 쓰여서, 고친 내용이 반영되지 않습니다.

`src/` 안의 파일을 새로 추가했다면 `sw.js` 의 `PRECACHE_URLS` 목록에도 넣어야 오프라인에서 동작합니다.

---

## 6. 되돌리기

문제가 생기면 GitHub 저장소의 **커밋 기록**에서 이전 커밋으로 되돌릴 수 있습니다. 이전 버전 파일이 커밋 기록에 그대로 남아 있으므로, 지웠더라도 복구할 수 있습니다.
