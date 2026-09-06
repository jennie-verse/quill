/* ==========================================================================
   files.js — 파일 열기 / 내보내기 / 공유, 파일명·확장자 처리

   iOS Safari에는 File System Access API가 없습니다. 그래서 "제자리 저장"은
   불가능하고, 항상 Files 앱으로 내보내는(다운로드/공유) 방식만 씁니다.
   ========================================================================== */

// 파일명에 쓸 수 없는 문자(제어문자 포함)를 막습니다.
const ILLEGAL_NAME = /[\u0000-\u001f/\\:*?"<>|]/;

export const QUICK_EXTENSIONS = Object.freeze([
  '.txt', '.md', '.json', '.csv', '.sql', '.js', '.py', '.html', '.css', '.log'
]);

export function sanitizeFileName(value, fallback = 'untitled') {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return fallback;
  if (ILLEGAL_NAME.test(trimmed)) return null;
  if (trimmed === '.' || trimmed === '..') return null;
  // iOS Files 와 GitHub 모두 한글 파일명을 그대로 처리하므로 한글은 막지 않습니다.
  return trimmed;
}

export function splitName(fileName) {
  const name = typeof fileName === 'string' ? fileName : '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, extension: '' };
  return { base: name.slice(0, dot), extension: name.slice(dot) };
}

export function joinName(base, extension) {
  const cleanBase = typeof base === 'string' ? base.trim() : '';
  const cleanExtension = typeof extension === 'string' ? extension.trim() : '';
  if (!cleanBase) return '';
  if (!cleanExtension) return cleanBase;
  if (cleanBase.endsWith(cleanExtension)) return cleanBase;
  return cleanExtension.startsWith('.')
    ? `${cleanBase}${cleanExtension}`
    : `${cleanBase}.${cleanExtension}`;
}

/* 바이너리 판정
   NUL 바이트가 있거나 유니코드 대체 문자(U+FFFD)가 눈에 띄게 많으면
   텍스트가 아닐 가능성이 높습니다. 판정은 경고일 뿐이고
   사용자가 Open Anyway 로 강행할 수 있습니다. */
export function looksBinary(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  const sample = text.slice(0, 4096);
  if (sample.includes('\u0000')) return true;
  let replacements = 0;
  for (const character of sample) {
    if (character === '\ufffd') replacements += 1;
  }
  return replacements > Math.max(4, sample.length * 0.02);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onabort = () => reject(new Error('The file could not be read.'));
    reader.readAsText(file, 'utf-8');
  });
}

function textBlob(text) {
  // BOM 은 넣지 않습니다. 넣으면 다른 도구에서 첫 글자로 보일 수 있습니다.
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}

export function downloadText(text, fileName) {
  const url = URL.createObjectURL(textBlob(text));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // 즉시 해제하면 사파리에서 다운로드가 취소되는 경우가 있어 한 박자 늦춥니다.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function canShareFiles() {
  return typeof navigator.canShare === 'function' && typeof navigator.share === 'function';
}

/* iOS 공유 시트로 보냅니다. 성공하면 true, 사용자가 취소하면 false 를 돌려주고,
   공유 자체가 불가능하면 예외를 던져 호출부가 다운로드로 대체하게 합니다. */
export async function shareText(text, fileName) {
  if (!canShareFiles()) throw new Error('File sharing failed');
  const file = new File([textBlob(text)], fileName, { type: 'text/plain' });
  if (!navigator.canShare({ files: [file] })) throw new Error('File sharing failed');
  try {
    await navigator.share({ files: [file] });
    return true;
  } catch (error) {
    if (error && error.name === 'AbortError') return false;
    throw new Error('File sharing failed');
  }
}
