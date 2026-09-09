import json
import re
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data" / "question-bank.json"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    questions = payload["questions"]
    source_names = {source["name"] for source in payload["sources"]}
    errors = []
    ids = Counter(question["id"] for question in questions)

    for question in questions:
        prefix = f'{question["id"]} {question["stem"][:30]}'
        if ids[question["id"]] > 1:
            errors.append(f"duplicate id: {prefix}")
        if question["source"] not in source_names:
            errors.append(f"missing source: {prefix}")
        if re.search(r"(?:答案|答)\s*[:：]", question["stem"]):
            errors.append(f"answer leaked into stem: {prefix}")
        if re.search(r"\s[A-F](?=[\u4e00-\u9fff《“])", question["stem"]):
            errors.append(f"option label leaked into stem: {prefix}")
        if question["type"] in {"single", "multiple"}:
            keys = [option["key"] for option in question["options"]]
            if len(keys) < 2 or len(keys) != len(set(keys)):
                errors.append(f"invalid options: {prefix}")
            if not set(question["answer"]).issubset(keys):
                errors.append(f"invalid answer: {prefix}")
        if question.get("conflicted") and not question.get("disabled"):
            errors.append(f"conflict not disabled: {prefix}")

    summary = {
        "questions": len(questions),
        "active": sum(not question.get("disabled") for question in questions),
        "disabled": sum(bool(question.get("disabled")) for question in questions),
        "sources": len(payload["sources"]),
        "errors": len(errors),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if errors:
        print("\n".join(errors[:30]))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
