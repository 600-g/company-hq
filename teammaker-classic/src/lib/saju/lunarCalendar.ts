/**
 * Korean/Chinese Lunar Calendar Converter
 * Data source: Korean Astronomical Research Institute (한국천문연구원)
 * Encoded format: 24-bit integer per year
 *   Bits 23-20: leap month index (0 = no leap month)
 *   Bits 19-8:  12 months big(30)/small(29) day flags (MSB = month 1)
 *   Bits 7-4:   solar month of Lunar New Year (1=Jan, 2=Feb)
 *   Bits 3-0:   solar day of Lunar New Year
 */

// lunarInfo[i] = data for year (1900 + i)
const lunarInfo: number[] = [
  0x04AE53, 0x0A5748, 0x5526BD, 0x0D2650, 0x0D9544, 0x46AAB9, 0x056A4D, 0x09AD42, 0x24AEB6, 0x04AE4A, // 1900-1909
  0x6AA4BD, 0x0AA4AD, 0x25AB52, 0x056A45, 0x0AADB0, 0x25AEB5, 0x052B42, 0x0A5B37, 0x1052BD, 0x0452B5, // 1910-1919
  0x0A53A9, 0x1552D2, 0x0569BD, 0x0968B0, 0x25A9B5, 0x0580D1, 0x0922E0, 0x24AEB6, 0x092AB0, 0x0AA5B5, // 1920-1929
  0x152AB9, 0x04B641, 0x0ADA38, 0x24E496, 0x0D4A50, 0x0D4AB5, 0x256A43, 0x055249, 0x0B527B, 0x0B5260, // 1930-1939
  0x392570, 0x052570, 0x0D52B6, 0x0A5365, 0x14A9BB, 0x0E4950, 0x0D4A45, 0x2EA555, 0x0B554A, 0x0B5540, // 1940-1949
  0x296AA6, 0x095540, 0x0AAD4A, 0x14D4B5, 0x0EA9A9, 0x1EA950, 0x0D4A50, 0x0D54A5, 0x2AADBA, 0x056A45, // 1950-1959
  0x0A6D42, 0x24DAB6, 0x04B650, 0x14B645, 0x2EA9BB, 0x0A4950, 0x0D4A44, 0x2D5525, 0x056A4A, 0x15ADAD, // 1960-1969
  0x090D50, 0x14D4A5, 0x1EA4B9, 0x0A4951, 0x0D4A45, 0x2EA555, 0x056A4A, 0x096D43, 0x24B4B8, 0x04B650, // 1970-1979
  0x144AB5, 0x2EA4BB, 0x0A4951, 0x0EA54A, 0x1EA55B, 0x056A50, 0x096D46, 0x24ADB5, 0x04AD4A, 0x0E4B40, // 1980-1989
  0x1E9B54, 0x0D4A48, 0x2EA4BD, 0x0A4B4B, 0x15AB50, 0x056C45, 0x096D42, 0x24ADBA, 0x04ADB6, 0x0E4B50, // 1990-1999
  0x1E9B55, 0x0D4A49, 0x1EA4BD, 0x0A4B4B, 0x15AB50, 0x056C45, 0x096D42, 0x24ADB6, 0x04B650, 0x144AB5, // 2000-2009
  0x2EA4BB, 0x0A4951, 0x0EA54A, 0x1EA55B, 0x056A50, 0x096D46, 0x24ADB5, 0x04ADA9, 0x0E4B40, 0x1E9B54, // 2010-2019
  0x0D4A48, 0x2DA4BD, 0x0A4B4B, 0x15AB50, 0x056C45, 0x096D42, 0x24ADB5, 0x04B650, 0x144AB5, 0x2EA4BB, // 2020-2029
  0x0A4951, 0x0EA54A, 0x1DA55B, 0x056A50, 0x096D46, 0x24ADB5, 0x04ADA9, 0x0E4B40, 0x1E9B54, 0x0D4A48, // 2030-2039
  0x2DA4BD, 0x0A4B4B, 0x15AB50, 0x056C45, 0x096D42, 0x24ADB5, 0x04B650, 0x144AB5, 0x2EA4BB, 0x0A4951, // 2040-2049
  0x0EA54A, 0x1DA55B, 0x056A50, 0x096D46, 0x24ADB5, 0x04ADA9, 0x0E4B40, 0x1E9B54, 0x0D4A48, 0x2DA4BD, // 2050-2059
]

function getLeapMonth(year: number): number {
  const data = lunarInfo[year - 1900]
  return (data & 0xF00000) >> 20
}

function getMonthDays(year: number, month: number): number {
  const data = lunarInfo[year - 1900]
  // month 1-12, extra if leap
  return ((data & (0x10000 >> month)) !== 0) ? 30 : 29
}

function getNewYearDate(year: number): { month: number; day: number } {
  const data = lunarInfo[year - 1900]
  return {
    month: (data & 0xF0) >> 4,
    day: data & 0x0F,
  }
}

/** Calculate total days in a lunar year (including leap month if any) */
function getLunarYearDays(year: number): number {
  let sum = 0
  const leap = getLeapMonth(year)
  for (let m = 1; m <= 12; m++) {
    sum += getMonthDays(year, m)
  }
  if (leap > 0) {
    // leap month days (encoded in bit 19: big leap if set)
    const data = lunarInfo[year - 1900]
    sum += ((data & 0x080000) !== 0) ? 30 : 29
  }
  return sum
}

/** Convert solar date → Julian Day Number */
function solarToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
}

/** Convert Julian Day Number → solar date */
function jdnToSolar(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor(146097 * b / 4)
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor(1461 * d / 4)
  const m = Math.floor((5 * e + 2) / 153)
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  }
}

/** Lunar New Year JDN for a given lunar year */
function lunarNewYearJdn(year: number): number {
  const { month, day } = getNewYearDate(year)
  return solarToJdn(year, month, day)
}

/** Convert solar date to lunar date */
export function solarToLunar(year: number, month: number, day: number): {
  year: number
  month: number
  day: number
  isLeapMonth: boolean
} {
  const targetJdn = solarToJdn(year, month, day)

  let lunarYear = year
  // Adjust if before new year
  let newYearJdn = lunarNewYearJdn(lunarYear)
  if (targetJdn < newYearJdn) {
    lunarYear--
    newYearJdn = lunarNewYearJdn(lunarYear)
  }

  let offset = targetJdn - newYearJdn
  const leap = getLeapMonth(lunarYear)

  let lunarMonth = 1
  let isLeapMonth = false

  while (lunarMonth <= 12) {
    const days = getMonthDays(lunarYear, lunarMonth)
    if (offset < days) break
    offset -= days

    if (lunarMonth === leap && leap > 0) {
      // leap month days
      const data = lunarInfo[lunarYear - 1900]
      const leapDays = ((data & 0x080000) !== 0) ? 30 : 29
      if (offset < leapDays) {
        isLeapMonth = true
        break
      }
      offset -= leapDays
    }
    lunarMonth++
  }

  return {
    year: lunarYear,
    month: lunarMonth,
    day: offset + 1,
    isLeapMonth,
  }
}

/** Convert lunar date to solar date */
export function lunarToSolar(
  year: number,
  month: number,
  day: number,
  isLeapMonth = false
): { year: number; month: number; day: number } {
  let jdn = lunarNewYearJdn(year)

  const leap = getLeapMonth(year)

  for (let m = 1; m < month; m++) {
    jdn += getMonthDays(year, m)
    if (m === leap && leap > 0) {
      const data = lunarInfo[year - 1900]
      jdn += ((data & 0x080000) !== 0) ? 30 : 29
    }
  }

  if (isLeapMonth && month === leap) {
    jdn += getMonthDays(year, month)
  }

  jdn += day - 1

  return jdnToSolar(jdn)
}

/** Calculate JDN for a given solar date */
export { solarToJdn }
