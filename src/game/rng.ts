/** Nguồn ngẫu nhiên tiêm được. Trả về số trong [0, 1). */
export type Rng = () => number

/**
 * PRNG mulberry32.
 *
 * Cần PRNG tất định chứ không dùng Math.random trực tiếp: luật chơi phải test
 * lại được với cùng một seed, nếu không thì không kiểm được tỉ lệ spawn 90:10
 * (A13 mục 1) và không tái lập được một board hỏng do người chơi báo.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
