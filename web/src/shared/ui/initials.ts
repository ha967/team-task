/**
 * 从用户名 / 任务标题里取首字母，用于 MonogramTile 和 InitialsDot。
 * 中文取 1 个字符（两个字挤在 24px 圆点里会糊），拉丁文取 1–2 个字母。
 */
export function initialsFrom(text: string, latinLength = 2) {
  const trimmed = text.trim();

  if (trimmed === '') {
    return '?';
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const isLatin = (value: string) => /^[\x20-\x7e]+$/.test(value);

  if (words.length >= 2 && isLatin(words[0]) && isLatin(words[1])) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  const first = words[0];

  if (isLatin(first)) {
    return first.slice(0, latinLength).toUpperCase();
  }

  return Array.from(first).slice(0, 1).join('');
}
