/* ==========================================================================
   find.js — 문서 안 검색

   정규식이 아니라 단순 문자열 찾기입니다. 사용자가 입력한 검색어를
   정규식으로 해석하지 않으므로 특수문자를 그대로 찾을 수 있습니다.
   ========================================================================== */

/* 겹치지 않는 모든 위치를 앞에서부터 찾습니다.
   빈 검색어는 무한 루프가 되므로 먼저 걸러 냅니다. */
export function findMatches(text, query, matchCase) {
  const source = typeof text === 'string' ? text : '';
  const needle = typeof query === 'string' ? query : '';
  if (!needle) return [];

  const haystack = matchCase ? source : source.toLowerCase();
  const target = matchCase ? needle : needle.toLowerCase();

  const matches = [];
  let from = 0;
  while (from <= haystack.length - target.length) {
    const index = haystack.indexOf(target, from);
    if (index === -1) break;
    matches.push({ start: index, end: index + needle.length });
    from = index + target.length;
  }
  return matches;
}

/* 현재 커서 위치에서 다음(또는 이전) 일치로 순환 이동합니다.
   일치가 없으면 -1 을 돌려줍니다. */
export function stepMatch(matches, currentIndex, direction) {
  if (!Array.isArray(matches) || matches.length === 0) return -1;
  const size = matches.length;
  if (currentIndex < 0) return direction < 0 ? size - 1 : 0;
  return ((currentIndex + direction) % size + size) % size;
}

export function matchAtOrAfter(matches, caret) {
  if (!Array.isArray(matches) || matches.length === 0) return -1;
  const position = Number.isFinite(caret) ? caret : 0;
  for (let index = 0; index < matches.length; index += 1) {
    if (matches[index].start >= position) return index;
  }
  return 0;
}

export function describeMatches(matches, activeIndex) {
  if (!Array.isArray(matches) || matches.length === 0) return 'No matches';
  const position = activeIndex >= 0 ? activeIndex + 1 : 1;
  return `${position} / ${matches.length}`;
}
