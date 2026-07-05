"""사주 만세력 엔진 — 결정론적 사주팔자 계산.

lunar-python 1.4.x 사용. 한국 통용 규칙(태양시 보정·야자시)은 옵션.
"""
from dataclasses import dataclass
from typing import Literal

from lunar_python import Lunar, Solar


GAN_KO: dict[str, str] = {
    "甲": "갑", "乙": "을", "丙": "병", "丁": "정", "戊": "무",
    "己": "기", "庚": "경", "辛": "신", "壬": "임", "癸": "계",
}
JI_KO: dict[str, str] = {
    "子": "자", "丑": "축", "寅": "인", "卯": "묘", "辰": "진",
    "巳": "사", "午": "오", "未": "미", "申": "신", "酉": "유",
    "戌": "술", "亥": "해",
}
WUXING_GAN: dict[str, str] = {
    "甲": "wood", "乙": "wood",
    "丙": "fire", "丁": "fire",
    "戊": "earth", "己": "earth",
    "庚": "metal", "辛": "metal",
    "壬": "water", "癸": "water",
}
WUXING_JI: dict[str, str] = {
    "寅": "wood", "卯": "wood",
    "巳": "fire", "午": "fire",
    "辰": "earth", "戌": "earth", "丑": "earth", "未": "earth",
    "申": "metal", "酉": "metal",
    "子": "water", "亥": "water",
}
TENGOD_KO: dict[str, str] = {
    "比肩": "비견", "劫财": "겁재", "劫財": "겁재",
    "食神": "식신", "伤官": "상관", "傷官": "상관",
    "偏财": "편재", "偏財": "편재", "正财": "정재", "正財": "정재",
    "七杀": "편관", "七殺": "편관",
    "正官": "정관", "偏印": "편인", "正印": "정인",
}


@dataclass(frozen=True)
class SajuInput:
    year: int
    month: int
    day: int
    hour: int | None = None
    minute: int = 0
    gender: Literal["male", "female"] = "male"
    calendar: Literal["solar", "lunar"] = "solar"
    is_leap_month: bool = False
    birth_city: str = "Seoul"


def _pillar_dict(gz: str) -> dict[str, str]:
    g, j = gz[0], gz[1]
    return {
        "gan": g, "ji": j,
        "gan_ko": GAN_KO.get(g, "?"),
        "ji_ko": JI_KO.get(j, "?"),
    }


def _to_korean_tengods(items: list[str]) -> list[str]:
    return [TENGOD_KO.get(x, x) for x in items]


def _resolve_solar(inp: SajuInput) -> Solar:
    hour = inp.hour if inp.hour is not None else 12
    minute = inp.minute
    if inp.calendar == "lunar":
        lm = -inp.month if inp.is_leap_month else inp.month
        lunar = Lunar.fromYmdHms(inp.year, lm, inp.day, hour, minute, 0)
        sol = lunar.getSolar()
        return Solar.fromYmdHms(sol.getYear(), sol.getMonth(), sol.getDay(),
                                hour, minute, 0)
    return Solar.fromYmdHms(inp.year, inp.month, inp.day, hour, minute, 0)


def _five_elements_count(pillars: dict[str, dict[str, str]]) -> dict[str, int]:
    count = {"wood": 0, "fire": 0, "earth": 0, "metal": 0, "water": 0}
    for p in pillars.values():
        count[WUXING_GAN[p["gan"]]] += 1
        count[WUXING_JI[p["ji"]]] += 1
    return count


def _strength_estimate(day_gan: str, five: dict[str, int]) -> str:
    me = WUXING_GAN[day_gan]
    feeds = {"wood": "water", "fire": "wood", "earth": "fire",
             "metal": "earth", "water": "metal"}
    support = five[me] + five[feeds[me]]
    if support >= 5:
        return "strong"
    if support >= 4:
        return "slightly_strong"
    if support <= 2:
        return "weak"
    return "neutral"


def _luck_pillars(ec, gender: Literal["male", "female"]) -> dict:
    yun = ec.getYun(1 if gender == "male" else 0)
    items = []
    for d in yun.getDaYun():
        gz = d.getGanZhi()
        if not gz:
            continue
        items.append({
            "age": d.getStartAge(),
            "start_year": d.getStartYear(),
            "gan": gz[0], "ji": gz[1],
            "gan_ko": GAN_KO.get(gz[0], "?"),
            "ji_ko": JI_KO.get(gz[1], "?"),
        })
    return {
        "start_age": items[0]["age"] if items else None,
        "direction": "forward" if yun.isForward() else "backward",
        "start_solar_date": yun.getStartSolar().toYmd(),
        "list": items,
    }


def calculate(inp: SajuInput) -> dict:
    """입력 → 만세력 JSON."""
    solar = _resolve_solar(inp)
    lunar = solar.getLunar()
    ec = lunar.getEightChar()

    pillars = {
        "year": _pillar_dict(ec.getYear()),
        "month": _pillar_dict(ec.getMonth()),
        "day": _pillar_dict(ec.getDay()),
    }
    notes: list[str] = []
    if inp.hour is not None:
        pillars["hour"] = _pillar_dict(ec.getTime())
    else:
        notes.append("출생시간 미상 → 시주·시운 해석 제외")

    five = _five_elements_count(pillars)
    strength = _strength_estimate(ec.getDayGan(), five)

    ten_gods = {
        "year_gan": TENGOD_KO.get(ec.getYearShiShenGan(), ec.getYearShiShenGan()),
        "year_zhi": _to_korean_tengods(ec.getYearShiShenZhi()),
        "month_gan": TENGOD_KO.get(ec.getMonthShiShenGan(), ec.getMonthShiShenGan()),
        "month_zhi": _to_korean_tengods(ec.getMonthShiShenZhi()),
        "day_zhi": _to_korean_tengods(ec.getDayShiShenZhi()),
    }
    if inp.hour is not None:
        ten_gods["hour_gan"] = TENGOD_KO.get(ec.getTimeShiShenGan(), ec.getTimeShiShenGan())
        ten_gods["hour_zhi"] = _to_korean_tengods(ec.getTimeShiShenZhi())

    return {
        "four_pillars": pillars,
        "day_master": ec.getDayGan(),
        "day_master_ko": GAN_KO.get(ec.getDayGan(), "?"),
        "ten_gods": ten_gods,
        "five_elements_count": five,
        "strength": strength,
        "luck_pillars": _luck_pillars(ec, inp.gender),
        "lunar_date": {
            "year": lunar.getYear(),
            "month": lunar.getMonth(),
            "day": lunar.getDay(),
        },
        "input_echo": {
            "calendar": inp.calendar,
            "ymdhm": [inp.year, inp.month, inp.day, inp.hour, inp.minute],
            "gender": inp.gender,
            "birth_city": inp.birth_city,
        },
        "notes": notes,
    }
