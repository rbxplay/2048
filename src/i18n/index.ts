import { en } from './en'
import { vi } from './vi'

export type Strings = typeof en
export type Locale = 'en' | 'vi'

export { en, vi }

/**
 * Quy BCP-47 tag về một trong hai locale đã bundle.
 *
 * Chỉ cần xét tiền tố ngôn ngữ: 'vi', 'vi-VN', 'VI-vn' đều là tiếng Việt.
 * Mọi thứ khác rơi về tiếng Anh — không có ngôn ngữ thứ ba trong v1, và im
 * lặng rơi về `en` an toàn hơn là hiện khoá thô.
 */
export function normalizeLocale(tag: string): Locale {
  return tag.trim().toLowerCase().startsWith('vi') ? 'vi' : 'en'
}

export function stringsFor(locale: Locale): Strings {
  return locale === 'vi' ? vi : en
}

/**
 * Định dạng số theo locale, có dấu phân cách hàng nghìn.
 *
 * Luôn cho ra chữ số Latin — numeral của tile là nội dung và phải giống nhau ở
 * mọi ngôn ngữ (spec §11.1).
 */
export function formatNumber(n: number, locale: Locale): string {
  const safe = Number.isFinite(n) ? Math.trunc(n) : 0
  return safe.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', {
    useGrouping: true,
    maximumFractionDigits: 0,
  })
}
