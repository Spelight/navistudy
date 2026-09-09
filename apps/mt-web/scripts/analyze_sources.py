import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTRACT = ROOT / ".source-extract"


def normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\x0b", "\n").replace("\x0c", "\n")
    text = text.replace("\u00a0", " ").replace("\u3000", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    report = []
    for path in sorted(EXTRACT.rglob("*.txt")):
        text = normalize(path.read_text(encoding="utf-8", errors="replace"))
        numbered = re.findall(r"(?m)(?:^|\n)\s*(\d{1,3})[．.、]\s*", text)
        choices = re.findall(r"(?m)(?:^|\s)([A-FＡ-Ｆ])[．.、]\s*", text)
        explicit_answers = re.findall(r"答案\s*[：:]\s*([A-FＡ-Ｆ√×对错]+)", text)
        inline_answers = re.findall(r"[（(]\s*([A-FＡ-Ｆ]{1,6}|√|×|对|错)\s*[）)]", text)
        headings = re.findall(
            r"(?m)^(第[一二三四五六七八九十\d]+(?:章|部分)[^\n]{0,40}|[一二三四五六七八九十]+、[^\n]{0,50})$",
            text,
        )
        report.append(
            {
                "file": str(path.relative_to(EXTRACT)),
                "characters": len(text),
                "numbered_markers": len(numbered),
                "max_number": max((int(n) for n in numbered), default=0),
                "option_markers": len(choices),
                "explicit_answers": len(explicit_answers),
                "inline_answer_markers": len(inline_answers),
                "headings": headings[:16],
                "start": text[:240],
                "end": text[-180:],
            }
        )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
