# Quill 배포 안내 (GitHub Pages)

이전 버전은 GitHub Actions가 Vite로 빌드해서 배포했습니다. 이번 버전은 **빌드가 없으므로 Actions도 필요 없습니다.** 폴더를 그대로 올리면 끝입니다.

저장소와 주소는 그대로 씁니다. 한 번 정한 주소는 바꾸지 않습니다.

- 저장소: `github.com/jennie-verse/quill`
- 주소: `https://jennie-verse.github.io/quill/`

---

## 1. 배포 전 준비

이전 버전 파일을 먼저 정리해야 합니다. 아래 파일들은 새 버전에서 쓰지 않습니다.

**지울 것**

```text
assets/index-CcCRDH4x.js          이전 React 번들
assets/index-DM6GGvw8.css         이전 스타일
assets/lexend-*.woff, *.woff2     폰트 19개 (새 버전은 2개만 씁니다)
.github/workflows/deploy.yml      빌드 배포 워크플로
```

**그대로 두는 것**

```text
icons/                            아이콘 4개 (새 버전이 그대로 씁니다)
licenses/Lexend-OFL.txt
manifest.webmanifest              내용이 같습니다
```

폰트가 19개에서 2개로 줄어 저장소 크기가 2.1MB에서 크게 작아집니다.

---

## 2. 올리는 순서

### 방법 A — GitHub 웹에서 (터미널 없이)

1. `github.com/jennie-verse/quill` 을 엽니다.
2. 위 목록의 **지울 파일**을 하나씩 열어 휴지통 아이콘으로 지우고 커밋합니다.
3. **Add file → Upload files** 를 누릅니다.
4. `quill-new` 폴더의 **내용물**을 통째로 끌어다 놓습니다. (`quill-new` 폴더 자체가 아니라 그 안의 것들입니다)
5. 커밋 메시지를 적고 **Commit changes** 를 누릅니다.

> `.nojekyll` 은 점으로 시작해서 Finder에서 숨겨져 있을 수 있습니다. `⌘ + Shift + .` 으로 숨김 파일을 보이게 한 뒤 함께 올리세요. 이 파일이 없으면 `_` 로 시작하는 경로가 무시될 수 있습니다.

### 방법 B — 터미널에서

```sh
cd quill               # 기존 저장소를 받아 둔 폴더
git rm -r --cached .github assets/index-*.js assets/index-*.css
rm -rf .github assets/index-*.js assets/index-*.css assets/lexend-*
cp -R /경로/quill-new/. .
git add -A
git commit -m "Rewrite Quill as a static app with no build step"
git push
```

---

## 3. Pages 설정 바꾸기

이전 버전은 **GitHub Actions** 를 배포 소스로 썼습니다. 빌드가 없어졌으므로 브랜치 배포로 되돌립니다.

1. 저장소의 **Settings → Pages** 를 엽니다.
2. **Build and deployment → Source** 를 **Deploy from a branch** 로 바꿉니다.
3. Branch를 `main`, 폴더를 `/ (root)` 로 고릅니다.
4. **Save** 를 누릅니다.

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
