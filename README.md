# Quill

iPhone·iPad에서 텍스트 파일을 편집하는 개인용 웹앱입니다. Mac의 TextEdit 자리를 iOS에서 대신합니다. 파일은 iOS Files 앱에 있으며, Quill은 그때그때 열어서 편집하고 다시 내보냅니다. 문서 라이브러리가 아니라, 인터넷 없이 완전히 오프라인으로 동작하는 즉석 편집기입니다.

빌드 단계가 없습니다. 이 폴더를 그대로 GitHub Pages에 올리면 `https://jennie-verse.github.io/quill/`에서 실행됩니다.

## 사용

- Files 앱에서 텍스트 파일을 열어 편집하고, 다시 내보내거나 공유합니다.
- 편집 중이던 초안 1건은 기기에 자동 저장되어 앱을 갑자기 닫아도 이어집니다.
- Settings에서 글자 크기, 줄바꿈, 들여쓰기를 조절합니다.

자세한 파일 구조와 바꾸는 법은 [구조와 바꾸는 법](docs/README-KO.md), 사용법은 [사용 안내](docs/USER-GUIDE-KO.md)를 보세요.

## 로컬 확인

`file://`로 직접 열면 ES Modules와 Service Worker가 동작하지 않습니다. 정적 서버로 열어야 합니다.

```sh
cd quill
python3 -m http.server 8000
```

## 구성

`src/` 앱 코드(app·settings·files·editor·find·backup) · `assets/` 스타일과 로컬 글꼴 · `icons/` PWA 아이콘 · `docs/` 한국어 안내 · `tests/` Node.js 테스트 · `manifest.webmanifest` · `sw.js` · `.nojekyll`
