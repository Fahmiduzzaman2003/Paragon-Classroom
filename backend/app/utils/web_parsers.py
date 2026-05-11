from __future__ import annotations

import re
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import httpx


BLOCK_TAGS = {
    "article",
    "aside",
    "blockquote",
    "br",
    "code",
    "div",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "td",
    "th",
    "tr",
    "ul",
}


class _VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in {"br", "hr"}:
            self._parts.append("\n")
        elif tag in BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag in BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = unescape(data).strip()
        if text:
            self._parts.append(text)

    def text(self) -> str:
        raw = " ".join(self._parts)
        raw = re.sub(r"\n\s+", "\n", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        raw = re.sub(r"[ \t]{2,}", " ", raw)
        return raw.strip()


def is_web_url(source: str) -> bool:
    parsed = urlparse(source.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def infer_source_filename(source_url: str) -> str:
    parsed = urlparse(source_url)
    path_name = Path(parsed.path.rstrip("/")).name
    if path_name:
        return path_name
    if parsed.netloc.endswith("github.com"):
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2:
            return f"{parts[0]}-{parts[1]}"
    return parsed.netloc.replace("www.", "") or "external-link"


def extract_web_pages(source_url: str) -> list[tuple[int, str]]:
    source_url = source_url.strip()
    if not is_web_url(source_url):
        raise ValueError("source_url must start with http:// or https://")

    with httpx.Client(
        timeout=20.0,
        follow_redirects=True,
        headers={
            "User-Agent": "ParagonRAG/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
        },
    ) as client:
        github_readme = _extract_github_readme(client, source_url)
        if github_readme:
            return [(1, github_readme)]

        response = client.get(source_url)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "").lower()
        if "text/plain" in content_type or "markdown" in content_type:
            text = response.text.strip()
            return [(1, text)] if text else []

        if "html" in content_type or not content_type:
            text = _html_to_text(response.text)
            return [(1, text)] if text else []

        text = response.text.strip()
        return [(1, text)] if text else []


def _extract_github_readme(client: httpx.Client, source_url: str) -> str:
    parsed = urlparse(source_url)
    if not parsed.netloc.endswith("github.com"):
        return ""

    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        return ""

    owner, repo = parts[0], parts[1]
    if len(parts) >= 4 and parts[2] in {"blob", "raw"}:
        branch = parts[3]
        raw_path = "/".join(parts[4:])
        raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{raw_path}"
        return _fetch_text(client, raw_url)

    candidates = [
        f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/README.md",
        f"https://raw.githubusercontent.com/{owner}/{repo}/main/README.md",
        f"https://raw.githubusercontent.com/{owner}/{repo}/master/README.md",
        f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/readme.md",
        f"https://raw.githubusercontent.com/{owner}/{repo}/main/readme.md",
        f"https://raw.githubusercontent.com/{owner}/{repo}/master/readme.md",
    ]
    for candidate in candidates:
        text = _fetch_text(client, candidate)
        if text:
            return text
    return ""


def _fetch_text(client: httpx.Client, url: str) -> str:
    try:
        response = client.get(url)
        if response.status_code >= 400:
            return ""
        return response.text.strip()
    except Exception:
        return ""


def _html_to_text(html: str) -> str:
    parser = _VisibleTextParser()
    parser.feed(html)
    return parser.text()