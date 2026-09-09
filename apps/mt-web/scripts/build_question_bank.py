import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTRACT = ROOT / ".source-extract"
OUTPUT = ROOT / "src" / "data"

SOURCE_META = {
    "军理复习重点.pdf": ("2026 整理", "review", "现代复习重点与高频提示"),
    "军理知识点题单-答案.pdf": ("2026 整理", "qa", "44 道现代知识点问答"),
    "2015年军事理论期末试题与答案.pdf": ("2015", "reference", "考试范围与复习要点"),
    "2016年军事理论期末试题与答案.pdf": ("2016", "reference", "考试范围与题型说明"),
    "2023春军事理论课知识点汇总.pdf": ("2023", "review", "五章课程知识点汇总"),
    "2024军理期末考试重点整理.pdf": ("2024", "review", "五章考试重点"),
    "2024年春季《军事理论》考前知识梳理.pdf": ("2024", "reference", "课程组考核说明与范围"),
    "2025军理期末考试重点整理.pdf": ("2025", "review", "现行五章重点与考试结构"),
    "军理考试题.doc": ("历史资料", "legacy", "名词解释、选择与问答"),
    "军理考试题库.docx": ("2017", "questions", "北航 2016 级知识竞赛选择题"),
    "军理课笔记修正版.docx": ("2016", "reference", "课程笔记"),
    "大学军理课考试资料(详细).doc": ("历史资料", "reference", "专题问答资料"),
    "军理题库1.doc": ("历史资料", "questions", "综合单选与多选题库"),
    "军理题库2.docx": ("历史资料", "questions", "200 道单选与 100 道多选"),
    "军理题库3.doc": ("历史资料", "reference", "专题总复习问答"),
    "军理题库4.pdf": ("历史资料", "questions", "分专题选择、填空与判断"),
    "军理题库5.pdf": ("历史资料", "qa", "93 道简答与论述提示"),
    "军理题库6.pdf": ("历史资料", "legacy", "模拟试题与问答"),
    "军理题库7.docx": ("历史资料", "duplicate", "与军理题库2内容重复"),
}

CHAPTERS = ["中国国防", "国家安全", "军事思想", "现代战争", "信息化装备", "综合知识"]

KEYWORDS = {
    "中国国防": ["国防", "兵役", "武装力量", "解放军", "武警", "民兵", "预备役", "国防动员", "领土", "领海", "陆军", "海军", "空军", "火箭军", "第二炮兵"],
    "国家安全": ["国家安全", "战略环境", "国际战略", "周边安全", "安全威胁", "台湾", "钓鱼岛", "南海", "黄岩岛", "邻国", "战略格局", "霸权主义", "恐怖主义"],
    "军事思想": ["军事思想", "孙子", "孙武", "毛泽东", "人民战争", "战争论", "克劳塞维茨", "邓小平", "江泽民", "胡锦涛", "强军目标", "军事家", "兵法"],
    "现代战争": ["信息化战争", "高技术战争", "新军事变革", "现代战争", "海湾战争", "科索沃战争", "伊拉克战争", "马岛战争", "阿富汗战争", "战争形态", "作战样式"],
    "信息化装备": ["信息化装备", "导弹", "制导", "雷达", "电子战", "电子对抗", "侦察", "卫星", "航天", "武器", "装备", "核爆", "化学武器", "生物武器", "激光", "微波", "飞机", "轰炸机", "战斗机", "C4", "指挥信息系统"],
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\x0b", "\n").replace("\x0c", "\n")
    text = text.replace("\uf06c", "•")
    text = re.sub(r"===== PAGE \d+ =====", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"(?<!\n)\s+(?=\d{1,3}\s*[（(]\s*[A-F])", "\n", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def compact(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"(?<=[\u4e00-\u9fff]) (?=[\u4e00-\u9fff])", "", text)
    text = re.sub(r"\s+([,，。;；:：!?！？、])", r"\1", text)
    return text.strip(" \n\t;；")


def source_name(path: Path) -> str:
    name = path.name
    if "__" in name:
        name = name.split("__")[-1]
    return re.sub(r"\.txt$", "", name)


def source_id(name: str) -> str:
    return hashlib.sha1(name.encode("utf-8")).hexdigest()[:10]


def question_id(stem: str) -> str:
    key = re.sub(r"[^\w\u4e00-\u9fff]", "", stem).lower()
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def classify(text: str, hinted: str | None = None) -> str:
    if hinted in CHAPTERS:
        return hinted
    scores = {
        chapter: sum(3 if word in text[:80] else 1 for word in words if word in text)
        for chapter, words in KEYWORDS.items()
    }
    chapter, score = max(scores.items(), key=lambda item: item[1])
    return chapter if score else "综合知识"


OPTION_RE = re.compile(
    r"(?<![A-Za-z0-9])([A-F])(?:\s*[、.．:]\s*|\s+(?=[\u4e00-\u9fff《“\"0-9])|(?=[\u4e00-\u9fff《“\"]))"
)


def parse_options(block: str) -> tuple[str, list[dict]]:
    matches = list(OPTION_RE.finditer(block))
    if len(matches) < 2:
        return compact(block), []
    stem = compact(block[: matches[0].start()])
    options = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(block)
        value = compact(block[match.end() : end]).strip(" ,，;；")
        value = re.sub(r"(?:答案|答)\s*[:：].*$", "", value).strip()
        if value:
            options.append({"key": match.group(1), "text": value})
    return stem, options


def make_question(
    stem: str,
    answer: str | list[str],
    qtype: str,
    source: str,
    options: list[dict] | None = None,
    chapter: str | None = None,
    explanation: str = "",
    legacy: bool = True,
) -> dict | None:
    stem = compact(stem)
    stem = re.sub(r"^\d{1,3}(?:[、.．]\s*|(?=\s*[（(]))", "", stem)
    stem = re.sub(r"[（(]\s*[A-F]{1,6}\s*[）)]", "（ ）", stem)
    if len(stem) < 5:
        return None
    options = options or []
    if qtype in {"single", "multiple"}:
        keys = {option["key"] for option in options}
        answer_list = list(answer) if isinstance(answer, str) else answer
        answer_list = [item for item in answer_list if item in keys]
        if len(options) < 2 or not answer_list:
            return None
        answer = answer_list
        qtype = "multiple" if len(answer_list) > 1 else "single"
    elif qtype == "truefalse":
        answer = "正确" if str(answer) in {"对", "正确", "√"} else "错误"
    else:
        answer = compact(str(answer))
        if not answer:
            return None

    return {
        "id": question_id(stem),
        "type": qtype,
        "chapter": classify(stem + " " + explanation, chapter),
        "stem": stem,
        "options": options,
        "answer": answer,
        "explanation": compact(explanation),
        "source": source,
        "sourceId": source_id(source),
        "legacy": legacy,
    }


def numbered_blocks(text: str) -> list[str]:
    starts = list(re.finditer(r"(?m)^\s*\d{1,3}(?:[、.．]\s*|(?=\s*[（(]))", text))
    blocks = []
    for index, start in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else len(text)
        blocks.append(text[start.start() : end].strip())
    return blocks


def parse_inline_bank(path: Path) -> list[dict]:
    text = normalize(path.read_text(encoding="utf-8", errors="replace"))
    source = source_name(path)
    result = []
    for block in numbered_blocks(text):
        answer_match = re.search(r"[（(]\s*([A-F]{1,6})\s*[）)]", block)
        if not answer_match:
            continue
        answer = answer_match.group(1)
        stem, options = parse_options(block)
        item = make_question(stem, answer, "multiple" if len(answer) > 1 else "single", source, options)
        if item:
            result.append(item)
    return result


def parse_explicit_bank(path: Path) -> list[dict]:
    text = normalize(path.read_text(encoding="utf-8", errors="replace"))
    source = source_name(path)
    result = []
    pattern = re.compile(
        r"(?ms)(?:^|\n)\s*(?:\d{1,3}[、.．]\s*)?(.*?)\n?\s*(?:答案|答)\s*[:：]\s*([A-F])(?=\s|\n|$)"
    )
    for match in pattern.finditer(text):
        block = compact(match.group(1))
        marker = max(block.rfind("。"), block.rfind("?"), block.rfind("？"))
        if marker > 0 and len(block) > 700:
            block = block[marker + 1 :]
        stem, options = parse_options(block)
        item = make_question(stem, match.group(2), "single", source, options)
        if item:
            result.append(item)
    return result


def parse_sectioned_pdf(path: Path) -> list[dict]:
    text = normalize(path.read_text(encoding="utf-8", errors="replace"))
    source = source_name(path)
    lines = text.splitlines()
    result = []
    chapter = "综合知识"
    qtype = "single"
    current = []

    def flush() -> None:
        nonlocal current
        if not current:
            return
        block = "\n".join(current)
        if qtype == "truefalse":
            match = re.search(r"[（(]\s*(对|错|正确|错误|√|×)\s*[）)]", block)
            if match:
                stem = block[: match.start()] + block[match.end() :]
                item = make_question(stem, match.group(1), qtype, source, chapter=chapter)
                if item:
                    result.append(item)
        elif qtype == "single":
            match = re.search(r"[（(]\s*([A-F])\s*[）)]", block)
            if match:
                stem, options = parse_options(block)
                item = make_question(stem, match.group(1), qtype, source, options, chapter)
                if item:
                    result.append(item)
        current = []

    for line in lines:
        section = re.match(r"^第[一二三四五六七八九十百]+部分[:：]?\s*(.+)", line)
        if section:
            flush()
            chapter = classify(section.group(1))
            continue
        if "选择题" in line:
            flush()
            qtype = "single"
            continue
        if "判断题" in line:
            flush()
            qtype = "truefalse"
            continue
        if "填空题" in line or "问答题" in line:
            flush()
            qtype = "skip"
            continue
        if re.match(r"^\s*\d{1,3}[、.．]\s*", line):
            flush()
            current = [line]
        elif current:
            current.append(line)
    flush()
    return result


def parse_qa(path: Path, modern: bool) -> list[dict]:
    text = normalize(path.read_text(encoding="utf-8", errors="replace"))
    source = source_name(path)
    result = []
    chapter_hint = None
    for block in numbered_blocks(text):
        first_line = block.splitlines()[0]
        heading = re.search(r"第[一二三四五六七八九十]+章\s*([^\n]+)", first_line)
        if heading:
            chapter_hint = classify(heading.group(1))
        match = re.search(r"(?:答案|答)\s*[:：]\s*(.+?)(?=(?:\n依据[:：])|$)", block, re.S)
        if not match:
            continue
        stem = block[: match.start()]
        answer = match.group(1)
        explanation = ""
        evidence = re.search(r"\n依据[:：]\s*(.+)$", block, re.S)
        if evidence:
            explanation = "依据：" + evidence.group(1)
        item = make_question(
            stem,
            answer,
            "short",
            source,
            chapter=chapter_hint,
            explanation=explanation,
            legacy=not modern,
        )
        if item:
            result.append(item)
    return result


def merge_questions(question_groups: list[list[dict]]) -> tuple[list[dict], list[dict]]:
    merged = {}
    conflicts = {}
    for group in question_groups:
        for question in group:
            existing = merged.get(question["id"])
            if not existing:
                question["sources"] = [question["source"]]
                merged[question["id"]] = question
                continue
            if question["source"] not in existing["sources"]:
                existing["sources"].append(question["source"])
            old_answer = json.dumps(existing["answer"], ensure_ascii=False, sort_keys=True)
            new_answer = json.dumps(question["answer"], ensure_ascii=False, sort_keys=True)
            if old_answer != new_answer:
                conflicts[question["id"]] = {
                    "id": question["id"],
                    "stem": question["stem"],
                    "kept": existing["answer"],
                    "incoming": question["answer"],
                    "sources": existing["sources"],
                }
                existing["conflicted"] = True
                existing["disabled"] = True
            existing["legacy"] = existing["legacy"] and question["legacy"]

    questions = list(merged.values())
    questions.sort(key=lambda item: (CHAPTERS.index(item["chapter"]), item["type"], item["stem"]))
    for number, question in enumerate(questions, start=1):
        question["number"] = number
    return questions, list(conflicts.values())


def build_sources() -> list[dict]:
    sources = []
    seen = set()
    source_root = ROOT.parent
    for path in sorted(source_root.rglob("*")):
        if not path.is_file() or "military-theory-quiz" in path.parts:
            continue
        if path.suffix.lower() not in {".pdf", ".doc", ".docx"}:
            continue
        name = path.name
        if name in seen:
            continue
        seen.add(name)
        period, role, note = SOURCE_META.get(name, ("未标注", "reference", "参考资料"))
        sources.append(
            {
                "id": source_id(name),
                "name": name,
                "period": period,
                "role": role,
                "note": note,
                "path": str(path.relative_to(source_root)),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    return sources


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    word = EXTRACT / "word"
    pdf = EXTRACT / "pdf"
    groups = [
        parse_inline_bank(word / "2_军事理论题库__军理题库2.docx.txt"),
        parse_inline_bank(word / "2_军事理论题库__军理题库1.doc.txt"),
        parse_explicit_bank(word / "1_题库__军理考试题库.docx.txt"),
        parse_sectioned_pdf(pdf / "2_军事理论题库__军理题库4.pdf.txt"),
        parse_qa(pdf / "军理知识点题单-答案.pdf.txt", modern=True),
        parse_qa(pdf / "2_军事理论题库__军理题库5.pdf.txt", modern=False),
    ]
    questions, conflicts = merge_questions(groups)
    sources = build_sources()
    stats = {
        "total": len(questions),
        "byType": dict(Counter(question["type"] for question in questions)),
        "byChapter": dict(Counter(question["chapter"] for question in questions)),
        "modern": sum(not question["legacy"] for question in questions),
        "legacy": sum(question["legacy"] for question in questions),
        "conflicts": len(conflicts),
        "sources": len(sources),
    }
    payload = {
        "generatedAt": "2026-09-07",
        "title": "NaviMT 军理通",
        "notice": "题库由本地复习资料整理；旧题仅供练习，法规、编制与时事表述请以当前课程教材和教师要求为准。",
        "chapters": CHAPTERS,
        "stats": stats,
        "sources": sources,
        "questions": questions,
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "question-bank.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (ROOT / ".source-extract" / "conflicts.json").write_text(
        json.dumps(conflicts, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
