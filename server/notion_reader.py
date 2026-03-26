"""Notion 공개 페이지 읽기 — API 키 없이 공개 페이지 콘텐츠 추출

방법 1: Notion 내부 API (loadPageChunk) 직접 호출
방법 2: splitbee 프록시 API (폴백)
"""

import re
import httpx

_TIMEOUT = 20


def _extract_page_id(url: str) -> str | None:
    """URL에서 Notion 페이지 ID 추출 (URL 맨 끝의 32자 hex → UUID 형식)

    Notion URL 형식:
      - https://xxx.notion.site/{title}-{32hex}
      - https://xxx.notion.site/{32hex}
      - https://xxx.notion.site/{uuid-with-hyphens}
    """
    cleaned = url.split("?")[0].split("#")[0]
    # 마지막 path 세그먼트에서 추출
    last_segment = cleaned.rstrip("/").rsplit("/", 1)[-1]

    # 1차: 맨 끝 32자 hex (하이픈 제거 후)
    # Notion은 항상 URL 끝에 32자 ID를 붙임
    no_hyphen = last_segment.replace("-", "")
    m = re.search(r"([a-f0-9]{32})$", no_hyphen)
    if m:
        raw = m.group(1)
        return f"{raw[:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:]}"

    # 2차: UUID 형식 (8-4-4-4-12)
    m = re.search(r"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})", last_segment)
    if m:
        return m.group(1)

    return None


def _rich_text_to_str(parts: list) -> str:
    """Notion rich text 배열 → 단순 문자열"""
    if not parts:
        return ""
    result = []
    for part in parts:
        if isinstance(part, list) and len(part) > 0:
            result.append(str(part[0]))
    return "".join(result)


def _blocks_to_text(blocks: dict) -> str:
    """Notion 블록 dict → 마크다운 텍스트 변환"""
    lines: list[str] = []

    # 페이지 블록에서 content 순서 추출
    page_block = None
    for block in blocks.values():
        v = block.get("value", {}) if isinstance(block, dict) else {}
        if v.get("type") == "page":
            page_block = v
            break

    # content 순서가 있으면 그 순서대로, 없으면 dict 순서
    if page_block and page_block.get("content"):
        ordered_ids = page_block["content"]
    else:
        ordered_ids = list(blocks.keys())

    for block_id in ordered_ids:
        block = blocks.get(block_id)
        if not block or not isinstance(block, dict):
            continue
        value = block.get("value", {})
        block_type = value.get("type", "")
        props = value.get("properties", {})

        title_parts = props.get("title", [])
        text = _rich_text_to_str(title_parts)

        if block_type == "page":
            if text:
                lines.append(f"# {text}\n")
        elif block_type == "header":
            lines.append(f"\n## {text}")
        elif block_type == "sub_header":
            lines.append(f"\n### {text}")
        elif block_type == "sub_sub_header":
            lines.append(f"\n#### {text}")
        elif block_type == "text":
            lines.append(text)
        elif block_type == "bulleted_list":
            lines.append(f"- {text}")
        elif block_type == "numbered_list":
            lines.append(f"1. {text}")
        elif block_type == "to_do":
            checked = props.get("checked", [["No"]])[0][0]
            mark = "x" if checked == "Yes" else " "
            lines.append(f"- [{mark}] {text}")
        elif block_type == "toggle":
            lines.append(f"▶ {text}")
        elif block_type == "quote":
            lines.append(f"> {text}")
        elif block_type == "callout":
            icon = value.get("format", {}).get("page_icon", "")
            lines.append(f"{icon} {text}")
        elif block_type == "code":
            lang = props.get("language", [["plain text"]])[0][0]
            lines.append(f"```{lang}\n{text}\n```")
        elif block_type == "divider":
            lines.append("---")
        elif block_type == "image":
            src = value.get("format", {}).get("display_source", "")
            cap = props.get("caption", [])
            cap_text = _rich_text_to_str(cap) if cap else ""
            lines.append(f"[이미지: {cap_text or src[:80]}]")
        elif block_type == "bookmark":
            link = props.get("link", [["?"]])[0][0] if props.get("link") else ""
            lines.append(f"[북마크: {text or link}]")
        elif block_type in ("column_list", "column", "table_row"):
            pass
        elif text:
            lines.append(text)

    return "\n".join(lines).strip()


async def _fetch_via_internal_api(client: httpx.AsyncClient, page_id: str) -> dict | None:
    """Notion 내부 API (loadPageChunk) 직접 호출"""
    resp = await client.post(
        "https://www.notion.so/api/v3/loadPageChunk",
        json={
            "page": {"id": page_id},
            "limit": 100,
            "cursor": {"stack": []},
            "chunkNumber": 0,
            "verticalColumns": False,
        },
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
    )
    if resp.status_code != 200:
        return None

    data = resp.json()
    blocks = data.get("recordMap", {}).get("block", {})
    if not blocks:
        return None

    # 내부 API 형식은 {"block_id": {"value": {...}}} 구조
    return blocks


async def _fetch_via_splitbee(client: httpx.AsyncClient, page_id: str) -> dict | None:
    """splitbee 프록시 API (폴백)"""
    resp = await client.get(f"https://notion-api.splitbee.io/v1/page/{page_id}")
    if resp.status_code != 200:
        return None

    blocks = resp.json()
    if not blocks or not isinstance(blocks, dict):
        return None

    # splitbee 형식도 동일: {"block_id": {"value": {...}}}
    return blocks


async def fetch_notion_page(url: str) -> dict:
    """공개 Notion 페이지를 읽어서 텍스트로 반환

    Returns:
        {"ok": True, "title": "...", "content": "...", "block_count": N}
        {"ok": False, "error": "..."}
    """
    page_id = _extract_page_id(url)
    if not page_id:
        return {"ok": False, "error": "유효한 Notion 페이지 URL이 아닙니다"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # 1차: Notion 내부 API
            blocks = await _fetch_via_internal_api(client, page_id)

            # 2차: splitbee 폴백
            if not blocks:
                blocks = await _fetch_via_splitbee(client, page_id)

            if not blocks:
                return {"ok": False, "error": "페이지를 찾을 수 없습니다 (비공개이거나 존재하지 않음)"}

            content = _blocks_to_text(blocks)

            # 제목 추출
            title = ""
            for block in blocks.values():
                v = block.get("value", {}) if isinstance(block, dict) else {}
                if v.get("type") == "page":
                    title_parts = v.get("properties", {}).get("title", [])
                    title = _rich_text_to_str(title_parts)
                    break

            return {
                "ok": True,
                "title": title or "(제목 없음)",
                "content": content,
                "block_count": len(blocks),
                "page_id": page_id,
            }

    except httpx.TimeoutException:
        return {"ok": False, "error": "Notion 페이지 로딩 시간 초과 (20초)"}
    except Exception as e:
        return {"ok": False, "error": f"오류: {str(e)}"}
