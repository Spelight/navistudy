import json
import sys
from pathlib import Path

from pypdf import PdfReader


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    output_dir = root / "military-theory-quiz" / ".source-extract" / "pdf"
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = []

    for source in sorted(root.rglob("*.pdf")):
        if "military-theory-quiz" in source.parts:
            continue
        reader = PdfReader(str(source))
        page_text = []
        for page_number, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            page_text.append(f"\n\n===== PAGE {page_number} =====\n\n{text}")

        relative = source.relative_to(root)
        output_name = str(relative).replace("\\", "__").replace("/", "__") + ".txt"
        extracted = "".join(page_text)
        (output_dir / output_name).write_text(extracted, encoding="utf-8")
        summary.append(
            {
                "source": str(relative),
                "pages": len(reader.pages),
                "characters": len(extracted),
                "output": output_name,
            }
        )

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
