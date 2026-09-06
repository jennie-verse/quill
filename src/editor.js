/* ==========================================================================
   editor.js — 편집 동작 (들여쓰기, 줄바꿈 유지)

   textarea 하나를 그대로 씁니다. 직접 만든 에디터가 아니므로
   iOS의 복사·붙여넣기·받아쓰기·한글 IME가 전부 기본 동작 그대로 작동합니다.
   ========================================================================== */

export function lineStart(text, position) {
  const previous = text.lastIndexOf('\n', position - 1);
  return previous === -1 ? 0 : previous + 1;
}

/* 선택 영역이 걸친 모든 줄의 시작 위치를 앞에서부터 돌려줍니다. */
export function selectedLineStarts(text, start, end) {
  const first = lineStart(text, start);
  const starts = [first];
  for (let index = first; index < end; index += 1) {
    if (text[index] === '\n' && index + 1 <= end) starts.push(index + 1);
  }
  return starts;
}

/* Tab: 선택이 없으면 공백 삽입, 선택이 있으면 줄 전체 들여쓰기.
   결과로 새 텍스트와 새 선택 범위를 함께 돌려줍니다. */
export function indent(text, start, end, tabSize) {
  const pad = ' '.repeat(tabSize);

  if (start === end) {
    return {
      text: text.slice(0, start) + pad + text.slice(end),
      start: start + pad.length,
      end: start + pad.length
    };
  }

  const starts = selectedLineStarts(text, start, end);
  let output = text;
  let added = 0;
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    const at = starts[index];
    output = output.slice(0, at) + pad + output.slice(at);
    added += pad.length;
  }
  return {
    text: output,
    start: start + pad.length,
    end: end + added
  };
}

/* Shift+Tab: 줄 앞 공백을 최대 tabSize 만큼 제거합니다. */
export function outdent(text, start, end, tabSize) {
  const starts = selectedLineStarts(text, start, end);
  let output = text;
  let removedBeforeStart = 0;
  let removedTotal = 0;

  for (let index = starts.length - 1; index >= 0; index -= 1) {
    const at = starts[index];
    let spaces = 0;
    while (spaces < tabSize && output[at + spaces] === ' ') spaces += 1;
    if (spaces === 0) continue;
    output = output.slice(0, at) + output.slice(at + spaces);
    removedTotal += spaces;
    if (at < start) removedBeforeStart += spaces;
    else if (at === start) removedBeforeStart += Math.min(spaces, start - at);
  }

  const firstLine = starts[0];
  const leadingRemoved = Math.min(
    start - firstLine,
    countLeadingSpacesRemoved(text, firstLine, tabSize)
  );

  return {
    text: output,
    start: Math.max(firstLine, start - leadingRemoved),
    end: Math.max(firstLine, end - removedTotal)
  };
}

function countLeadingSpacesRemoved(text, at, tabSize) {
  let spaces = 0;
  while (spaces < tabSize && text[at + spaces] === ' ') spaces += 1;
  return spaces;
}

/* Enter: 앞 줄의 들여쓰기를 이어받습니다. */
export function newlineWithIndent(text, start, end) {
  const at = lineStart(text, start);
  let spaces = 0;
  while (text[at + spaces] === ' ' && at + spaces < start) spaces += 1;
  const insert = `\n${' '.repeat(spaces)}`;
  return {
    text: text.slice(0, start) + insert + text.slice(end),
    start: start + insert.length,
    end: start + insert.length
  };
}

export function applyEdit(textarea, result) {
  textarea.value = result.text;
  textarea.setSelectionRange(result.start, result.end);
}

export function countLines(text) {
  if (typeof text !== 'string' || text === '') return 1;
  let lines = 1;
  for (const character of text) {
    if (character === '\n') lines += 1;
  }
  return lines;
}

/* 상태 표시줄용 요약. 글자 수는 코드 유닛이 아니라 글자 단위로 셉니다
   (한글·이모지가 2로 세지지 않도록). */
export function describeDocument(text) {
  const value = typeof text === 'string' ? text : '';
  const characters = Array.from(value).length;
  return `${countLines(value)} lines · ${characters} characters`;
}
