from __future__ import annotations

import hashlib
import json
import re
import subprocess
import unicodedata
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    User,
    Word,
    Wordbook,
    WordbookWord,
    WordlistSource,
    WordlistSourceEntry,
)

CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
ENGLISH_TERM = re.compile(r"^[a-z][a-z .'-]*$")
LEADING_POS = re.compile(
    r"^(?P<pos>n|v|vt|vi|adj|adv|prep|conj|pron|num|aux|art|int)\.\s*",
    re.IGNORECASE,
)
TRAILING_POS = re.compile(
    r"\s*\((?P<pos>n|v|vt|vi|adj|adv|prep|conj|pron|num|aux|art|int)\.\)\s*$",
    re.IGNORECASE,
)


class WordlistValidationError(ValueError):
    pass


@dataclass
class Definition:
    part_of_speech: str
    meaning: str


@dataclass
class ParsedRecord:
    term: str
    phonetic: str
    definitions: list[Definition]

    @property
    def translation(self) -> str:
        return "；".join(item.meaning for item in self.definitions)

    @property
    def part_of_speech(self) -> str:
        values = list(
            dict.fromkeys(item.part_of_speech for item in self.definitions if item.part_of_speech)
        )
        return "/".join(values)[:30]


@dataclass
class MergedWord:
    term: str
    phonetic: str
    translation: str
    part_of_speech: str
    definitions: list[dict[str, str]]
    source_positions: dict[str, int] = field(default_factory=dict)
    translation_variants: set[str] = field(default_factory=set)
    phonetic_variants: set[str] = field(default_factory=set)


@dataclass
class SourceBuild:
    manifest: dict[str, Any]
    parsed_count: int
    unique_count: int
    duplicate_count: int
    phrase_count: int


@dataclass
class WordlistBuild:
    manifest: dict[str, Any]
    words: OrderedDict[str, MergedWord]
    sources: list[SourceBuild]
    report: dict[str, Any]


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    if CONTROL_CHARACTERS.search(normalized):
        raise WordlistValidationError("字段包含不可见控制字符")
    return " ".join(normalized.strip().split())


def normalize_term(value: str) -> str:
    term = normalize_text(value).lower()
    if not term:
        raise WordlistValidationError("单词为空")
    if len(term) > 100:
        raise WordlistValidationError(f"单词超过 100 个字符: {term[:30]}")
    if not ENGLISH_TERM.fullmatch(term):
        raise WordlistValidationError(f"不是受支持的英文词形: {term}")
    return term


def clean_translation(value: str) -> str:
    cleaned = normalize_text(value)
    cleaned = re.sub(r"<([^<>]{1,20})>", r"（\1）", cleaned)
    cleaned = cleaned.replace("<", "").replace(">", "")
    return cleaned.strip()


def normalize_part_of_speech(value: str) -> str:
    return value.lower().rstrip(".") + "."


def parse_definition(value: str) -> Definition:
    text = clean_translation(value)
    part_of_speech = ""
    leading = LEADING_POS.match(text)
    if leading:
        part_of_speech = normalize_part_of_speech(leading.group("pos"))
        text = text[leading.end() :].strip()
    trailing = TRAILING_POS.search(text)
    if trailing:
        part_of_speech = part_of_speech or normalize_part_of_speech(trailing.group("pos"))
        text = text[: trailing.start()].strip()
    if not text:
        raise WordlistValidationError("释义为空")
    if len(text) > 500:
        raise WordlistValidationError("单条释义超过 500 个字符")
    return Definition(part_of_speech=part_of_speech, meaning=text)


def format_phonetic(value: str) -> str:
    phonetic = normalize_text(value) if value else ""
    if not phonetic:
        return ""
    if len(phonetic) > 116:
        raise WordlistValidationError("音标超过 116 个字符")
    if phonetic.startswith("/") and phonetic.endswith("/"):
        return phonetic
    return f"/{phonetic}/"


def parse_record(payload: Any) -> ParsedRecord:
    if not isinstance(payload, dict):
        raise WordlistValidationError("词条不是对象")
    raw_term = payload.get("name")
    translations = payload.get("trans")
    if not isinstance(raw_term, str):
        raise WordlistValidationError("词条缺少字符串 name")
    if not isinstance(translations, list) or not translations:
        raise WordlistValidationError(f"{raw_term} 缺少 trans")
    definitions = []
    for value in translations:
        if not isinstance(value, str):
            raise WordlistValidationError(f"{raw_term} 的 trans 包含非字符串")
        if not value.strip():
            continue
        definitions.append(parse_definition(value))
    if not definitions:
        raise WordlistValidationError(f"{raw_term} 没有有效释义")
    phone = payload.get("usphone") or payload.get("ukphone") or ""
    if not isinstance(phone, str):
        raise WordlistValidationError(f"{raw_term} 的音标不是字符串")
    return ParsedRecord(
        term=normalize_term(raw_term),
        phonetic=format_phonetic(phone),
        definitions=definitions,
    )


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WordlistValidationError(f"无法读取 manifest: {path}") from exc
    required = {
        "schema_version",
        "slug",
        "display_name",
        "description",
        "level",
        "language",
        "transform_version",
        "source_repository",
        "source_commit",
        "bundle_file",
        "bundle_sha256",
        "bundle_count",
        "sources",
    }
    missing = sorted(required - manifest.keys())
    if missing:
        raise WordlistValidationError(f"manifest 缺少字段: {', '.join(missing)}")
    if manifest["schema_version"] != 1 or manifest["language"] != "en":
        raise WordlistValidationError("当前只支持 schema_version=1 的英文词库")
    if not re.fullmatch(r"[0-9a-f]{40}", str(manifest["source_commit"])):
        raise WordlistValidationError("manifest.source_commit 必须是完整 Git SHA")
    if len(str(manifest["slug"])) > 120 or len(str(manifest["display_name"])) > 120:
        raise WordlistValidationError("词书 slug 或显示名过长")
    bundle_path = PurePosixPath(str(manifest["bundle_file"]))
    if bundle_path.is_absolute() or ".." in bundle_path.parts:
        raise WordlistValidationError("manifest.bundle_file 必须是安全的相对路径")
    if not re.fullmatch(r"[0-9a-f]{64}", str(manifest["bundle_sha256"])):
        raise WordlistValidationError("manifest.bundle_sha256 无效")
    if not isinstance(manifest["bundle_count"], int) or manifest["bundle_count"] <= 0:
        raise WordlistValidationError("manifest.bundle_count 无效")
    if not isinstance(manifest["sources"], list) or not manifest["sources"]:
        raise WordlistValidationError("manifest.sources 不能为空")
    source_keys: set[str] = set()
    source_files: set[PurePosixPath] = set()
    for source in manifest["sources"]:
        source_required = {
            "source_key",
            "display_name",
            "source_file",
            "source_sha256",
            "declared_count",
            "license_status",
            "license_evidence",
        }
        source_missing = sorted(source_required - source.keys())
        if source_missing:
            raise WordlistValidationError(
                f"来源缺少字段: {', '.join(source_missing)}"
            )
        source_key = source.get("source_key")
        if not isinstance(source_key, str) or not source_key or len(source_key) > 160:
            raise WordlistValidationError("source_key 为空或过长")
        if source_key in source_keys:
            raise WordlistValidationError("source_key 为空或重复")
        source_keys.add(source_key)
        source_path = PurePosixPath(source.get("source_file", ""))
        if (
            source_path.is_absolute()
            or ".." in source_path.parts
            or source_path.parts[:2] != ("public", "dicts")
        ):
            raise WordlistValidationError(f"不安全的 source_file: {source_path}")
        if source_path in source_files:
            raise WordlistValidationError(f"source_file 重复: {source_path}")
        source_files.add(source_path)
        sha256 = source.get("source_sha256", "")
        if not re.fullmatch(r"[0-9a-f]{64}", sha256):
            raise WordlistValidationError(f"无效的 SHA-256: {source_key}")
        if not isinstance(source["declared_count"], int) or source["declared_count"] <= 0:
            raise WordlistValidationError(f"无效的 declared_count: {source_key}")
        if source["license_status"] not in {
            "approved",
            "internal-evaluation-only",
            "blocked",
            "needs-owner-decision",
        }:
            raise WordlistValidationError(f"无效的 license_status: {source_key}")
        if not isinstance(source["license_evidence"], list):
            raise WordlistValidationError(f"license_evidence 必须是数组: {source_key}")
    return manifest


def load_documents_from_git(
    manifest: dict[str, Any], source_repository: Path
) -> dict[str, bytes]:
    if not source_repository.is_dir():
        raise WordlistValidationError(f"上游仓库不存在: {source_repository}")
    commit = manifest["source_commit"]
    try:
        subprocess.run(
            ["git", "cat-file", "-e", f"{commit}^{{commit}}"],
            cwd=source_repository,
            check=True,
            capture_output=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise WordlistValidationError(f"上游仓库缺少固定提交: {commit}") from exc

    documents: dict[str, bytes] = {}
    for source in manifest["sources"]:
        try:
            result = subprocess.run(
                ["git", "show", f"{commit}:{source['source_file']}"],
                cwd=source_repository,
                check=True,
                capture_output=True,
                timeout=60,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise WordlistValidationError(
                f"无法读取 {source['source_file']}@{commit}"
            ) from exc
        documents[source["source_key"]] = result.stdout
    return documents


def _merge_definitions(target: MergedWord, record: ParsedRecord) -> None:
    existing = {
        (item.get("part_of_speech", ""), item.get("meaning", ""))
        for item in target.definitions
    }
    for item in record.definitions:
        key = (item.part_of_speech, item.meaning)
        if key not in existing:
            target.definitions.append(
                {"part_of_speech": item.part_of_speech, "meaning": item.meaning}
            )
            existing.add(key)
    if not target.part_of_speech:
        target.part_of_speech = record.part_of_speech


def build_wordlist(
    manifest: dict[str, Any], documents: dict[str, bytes]
) -> WordlistBuild:
    words: OrderedDict[str, MergedWord] = OrderedDict()
    sources: list[SourceBuild] = []
    total_rows = 0
    source_unique_total = 0
    membership_counts: dict[int, int] = defaultdict(int)

    for source in manifest["sources"]:
        source_key = source["source_key"]
        raw = documents.get(source_key)
        if raw is None:
            raise WordlistValidationError(f"缺少源文件内容: {source_key}")
        actual_sha256 = hashlib.sha256(raw).hexdigest()
        if actual_sha256 != source["source_sha256"]:
            raise WordlistValidationError(
                f"{source_key} SHA-256 不一致: {actual_sha256}"
            )
        try:
            payload = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise WordlistValidationError(f"{source_key} 不是有效 JSON") from exc
        if not isinstance(payload, list):
            raise WordlistValidationError(f"{source_key} 顶层不是数组")
        if len(payload) != source["declared_count"]:
            raise WordlistValidationError(
                f"{source_key} 数量不一致: {len(payload)} != {source['declared_count']}"
            )

        source_terms: set[str] = set()
        phrase_count = 0
        for position, item in enumerate(payload, 1):
            try:
                record = parse_record(item)
            except WordlistValidationError as exc:
                raise WordlistValidationError(
                    f"{source_key} 第 {position} 条无效: {exc}"
                ) from exc
            if " " in record.term:
                phrase_count += 1
            source_terms.add(record.term)
            target = words.get(record.term)
            if target is None:
                target = MergedWord(
                    term=record.term,
                    phonetic=record.phonetic,
                    translation=record.translation[:500],
                    part_of_speech=record.part_of_speech,
                    definitions=[],
                )
                words[record.term] = target
            _merge_definitions(target, record)
            target.source_positions.setdefault(source_key, position)
            target.translation_variants.add(record.translation)
            target.phonetic_variants.add(record.phonetic)
            if not target.phonetic and record.phonetic:
                target.phonetic = record.phonetic

        parsed_count = len(payload)
        unique_count = len(source_terms)
        sources.append(
            SourceBuild(
                manifest=source,
                parsed_count=parsed_count,
                unique_count=unique_count,
                duplicate_count=parsed_count - unique_count,
                phrase_count=phrase_count,
            )
        )
        total_rows += parsed_count
        source_unique_total += unique_count

    for item in words.values():
        membership_counts[len(item.source_positions)] += 1

    report = {
        "schema_version": 1,
        "wordbook_slug": manifest["slug"],
        "generated_at": datetime.now(UTC).isoformat(),
        "source_repository": manifest["source_repository"],
        "source_commit": manifest["source_commit"],
        "merge_strategy": manifest.get("merge_strategy", "first-source-wins"),
        "normalization": "Unicode NFKC + trim + collapse spaces + lowercase",
        "ordering": "manifest source order, then first appearance in each source",
        "include_phrases": bool(manifest.get("include_phrases", True)),
        "sources": [
            {
                "source_key": item.manifest["source_key"],
                "display_name": item.manifest["display_name"],
                "source_file": item.manifest["source_file"],
                "source_sha256": item.manifest["source_sha256"],
                "license_status": item.manifest["license_status"],
                "parsed_count": item.parsed_count,
                "unique_count": item.unique_count,
                "duplicate_count": item.duplicate_count,
                "phrase_count": item.phrase_count,
            }
            for item in sources
        ],
        "totals": {
            "source_rows": total_rows,
            "source_unique_sum": source_unique_total,
            "within_source_duplicates": total_rows - source_unique_total,
            "cross_source_duplicates": source_unique_total - len(words),
            "final_unique_terms": len(words),
            "translation_conflicts": sum(
                len(item.translation_variants) > 1 for item in words.values()
            ),
            "phonetic_conflicts": sum(
                len(item.phonetic_variants) > 1 for item in words.values()
            ),
            "unique_phrases": sum(" " in item.term for item in words.values()),
        },
        "source_membership_distribution": {
            str(key): membership_counts[key] for key in sorted(membership_counts)
        },
        "first_terms": list(words)[:10],
        "last_terms": list(words)[-10:],
    }
    return WordlistBuild(manifest=manifest, words=words, sources=sources, report=report)


def resolve_bundle_path(manifest_path: Path, manifest: dict[str, Any]) -> Path:
    return (manifest_path.parent.parent / manifest["bundle_file"]).resolve()


def serialize_wordlist_bundle(build: WordlistBuild) -> bytes:
    quality = {key: value for key, value in build.report.items() if key != "generated_at"}
    metadata = {
        "record_type": "metadata",
        "schema_version": 1,
        "wordbook_slug": build.manifest["slug"],
        "source_commit": build.manifest["source_commit"],
        "transform_version": build.manifest["transform_version"],
        "quality": quality,
    }
    lines = [json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))]
    source_order = [item["source_key"] for item in build.manifest["sources"]]
    for item in build.words.values():
        record = {
            "record_type": "word",
            "term": item.term,
            "phonetic": item.phonetic,
            "part_of_speech": item.part_of_speech,
            "translation": item.translation,
            "definitions": item.definitions,
            "sources": [
                {"source_key": key, "position": item.source_positions[key]}
                for key in source_order
                if key in item.source_positions
            ],
        }
        lines.append(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
    return ("\n".join(lines) + "\n").encode("utf-8")


def write_wordlist_bundle(build: WordlistBuild, path: Path) -> str:
    content = serialize_wordlist_bundle(build)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_bytes(content)
    temporary_path.replace(path)
    return hashlib.sha256(content).hexdigest()


def _bundle_definition(payload: Any, term: str) -> dict[str, str]:
    if not isinstance(payload, dict):
        raise WordlistValidationError(f"{term} 的 definitions 包含非对象")
    part_of_speech = payload.get("part_of_speech", "")
    meaning = payload.get("meaning")
    if not isinstance(part_of_speech, str) or not isinstance(meaning, str) or not meaning:
        raise WordlistValidationError(f"{term} 的 definition 无效")
    if len(part_of_speech) > 30 or len(meaning) > 500:
        raise WordlistValidationError(f"{term} 的 definition 过长")
    if CONTROL_CHARACTERS.search(part_of_speech + meaning) or "<" in meaning or ">" in meaning:
        raise WordlistValidationError(f"{term} 的 definition 包含非法字符")
    return {"part_of_speech": part_of_speech, "meaning": meaning}


def load_wordlist_bundle(
    manifest: dict[str, Any], bundle_path: Path
) -> WordlistBuild:
    try:
        content = bundle_path.read_bytes()
    except OSError as exc:
        raise WordlistValidationError(f"无法读取词库数据包: {bundle_path}") from exc
    actual_sha256 = hashlib.sha256(content).hexdigest()
    if actual_sha256 != manifest["bundle_sha256"]:
        raise WordlistValidationError(
            f"词库数据包 SHA-256 不一致: {actual_sha256}"
        )
    lines = content.splitlines()
    if len(lines) < 2:
        raise WordlistValidationError("词库数据包没有词条")
    try:
        metadata = json.loads(lines[0])
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise WordlistValidationError("词库数据包元数据不是有效 JSON") from exc
    if not isinstance(metadata, dict) or metadata.get("record_type") != "metadata":
        raise WordlistValidationError("词库数据包缺少 metadata 首行")
    if metadata.get("wordbook_slug") != manifest["slug"]:
        raise WordlistValidationError("词库数据包 slug 与 manifest 不一致")
    if metadata.get("source_commit") != manifest["source_commit"]:
        raise WordlistValidationError("词库数据包 source_commit 与 manifest 不一致")
    if metadata.get("transform_version") != manifest["transform_version"]:
        raise WordlistValidationError("词库数据包转换版本与 manifest 不一致")

    known_sources = {item["source_key"] for item in manifest["sources"]}
    words: OrderedDict[str, MergedWord] = OrderedDict()
    for line_number, line in enumerate(lines[1:], 2):
        try:
            record = json.loads(line)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise WordlistValidationError(
                f"词库数据包第 {line_number} 行不是有效 JSON"
            ) from exc
        if not isinstance(record, dict) or record.get("record_type") != "word":
            raise WordlistValidationError(f"词库数据包第 {line_number} 行不是 word")
        term = record.get("term")
        if not isinstance(term, str) or normalize_term(term) != term:
            raise WordlistValidationError(f"词库数据包第 {line_number} 行 term 未规范化")
        if term in words:
            raise WordlistValidationError(f"词库数据包存在重复词条: {term}")
        phonetic = record.get("phonetic", "")
        part_of_speech = record.get("part_of_speech", "")
        translation = record.get("translation")
        definitions = record.get("definitions")
        memberships = record.get("sources")
        if not isinstance(phonetic, str) or len(phonetic) > 120:
            raise WordlistValidationError(f"{term} 的 phonetic 无效")
        if not isinstance(part_of_speech, str) or len(part_of_speech) > 30:
            raise WordlistValidationError(f"{term} 的 part_of_speech 无效")
        if not isinstance(translation, str) or not translation or len(translation) > 500:
            raise WordlistValidationError(f"{term} 的 translation 无效")
        if CONTROL_CHARACTERS.search(translation) or "<" in translation or ">" in translation:
            raise WordlistValidationError(f"{term} 的 translation 包含非法字符")
        if not isinstance(definitions, list) or not definitions:
            raise WordlistValidationError(f"{term} 的 definitions 无效")
        clean_definitions = [_bundle_definition(item, term) for item in definitions]
        if not isinstance(memberships, list) or not memberships:
            raise WordlistValidationError(f"{term} 缺少来源")
        source_positions: dict[str, int] = {}
        for membership in memberships:
            if not isinstance(membership, dict):
                raise WordlistValidationError(f"{term} 的来源关联无效")
            source_key = membership.get("source_key")
            position = membership.get("position")
            if source_key not in known_sources or source_key in source_positions:
                raise WordlistValidationError(f"{term} 的来源键无效或重复")
            if not isinstance(position, int) or position <= 0:
                raise WordlistValidationError(f"{term} 的来源位置无效")
            source_positions[source_key] = position
        words[term] = MergedWord(
            term=term,
            phonetic=phonetic,
            translation=translation,
            part_of_speech=part_of_speech,
            definitions=clean_definitions,
            source_positions=source_positions,
        )

    if len(words) != manifest["bundle_count"]:
        raise WordlistValidationError(
            f"词库数据包数量不一致: {len(words)} != {manifest['bundle_count']}"
        )
    quality = metadata.get("quality")
    if not isinstance(quality, dict):
        raise WordlistValidationError("词库数据包缺少质量报告")
    if quality.get("totals", {}).get("final_unique_terms") != len(words):
        raise WordlistValidationError("词库数据包质量报告数量不一致")
    source_reports = {
        item.get("source_key"): item for item in quality.get("sources", [])
    }
    sources: list[SourceBuild] = []
    for source in manifest["sources"]:
        report = source_reports.get(source["source_key"])
        if not isinstance(report, dict):
            raise WordlistValidationError(
                f"词库数据包缺少来源报告: {source['source_key']}"
            )
        sources.append(
            SourceBuild(
                manifest=source,
                parsed_count=report["parsed_count"],
                unique_count=report["unique_count"],
                duplicate_count=report["duplicate_count"],
                phrase_count=report["phrase_count"],
            )
        )
    return WordlistBuild(manifest=manifest, words=words, sources=sources, report=quality)


def verify_wordlist_bundle(build: WordlistBuild, bundle_path: Path) -> None:
    try:
        actual = bundle_path.read_bytes()
    except OSError as exc:
        raise WordlistValidationError(f"无法读取词库数据包: {bundle_path}") from exc
    expected = serialize_wordlist_bundle(build)
    if actual != expected:
        raise WordlistValidationError(
            "已提交数据包与固定上游源重新生成的内容不一致"
        )


def validate_import_permission(
    manifest: dict[str, Any], *, environment: str, allow_internal_evaluation: bool
) -> None:
    statuses = {source["license_status"] for source in manifest["sources"]}
    if statuses == {"approved"}:
        return
    if environment == "production":
        raise WordlistValidationError(
            "生产环境只允许导入 license_status=approved 的词库"
        )
    if not allow_internal_evaluation or not statuses <= {
        "approved",
        "internal-evaluation-only",
    }:
        raise WordlistValidationError(
            "当前来源仅允许本地评估；"
            "写入开发数据库需要 --allow-internal-evaluation"
        )


def _normalized_existing_words(db: Session) -> dict[str, Word]:
    normalized: dict[str, Word] = {}
    for word in db.scalars(select(Word)).all():
        key = normalize_term(word.term)
        if key in normalized and normalized[key].id != word.id:
            raise WordlistValidationError(f"数据库已有规范化重复词条: {word.term}")
        normalized[key] = word
    return normalized


def _upsert_words(db: Session, build: WordlistBuild) -> tuple[dict[str, Word], dict[str, int]]:
    existing = _normalized_existing_words(db)
    selected: dict[str, Word] = {}
    created = 0
    updated = 0
    for term, item in build.words.items():
        word = existing.get(term)
        if word is None:
            word = Word(
                term=term,
                phonetic=item.phonetic,
                part_of_speech=item.part_of_speech,
                translation=item.translation,
                definitions=item.definitions,
                example="",
                example_translation="",
                dictionary_source="system",
            )
            db.add(word)
            existing[term] = word
            created += 1
        else:
            changed = False
            if word.dictionary_source != "system":
                word.dictionary_source = "system"
                changed = True
            if word.term != term:
                word.term = term
                changed = True
            for field_name in ("phonetic", "part_of_speech", "translation", "definitions"):
                incoming = getattr(item, field_name)
                if not getattr(word, field_name) and incoming:
                    setattr(word, field_name, incoming)
                    changed = True
            updated += int(changed)
        selected[term] = word
    db.flush()
    return selected, {"created": created, "updated": updated, "reused": len(selected) - created}


def _upsert_wordbook(
    db: Session, build: WordlistBuild, words: dict[str, Word]
) -> tuple[Wordbook, dict[str, int]]:
    manifest = build.manifest
    by_slug = db.scalar(select(Wordbook).where(Wordbook.slug == manifest["slug"]))
    by_name = db.scalar(select(Wordbook).where(Wordbook.name == manifest["display_name"]))
    if by_slug and by_name and by_slug.id != by_name.id:
        raise WordlistValidationError("词书 slug 和名称分别指向不同记录")
    wordbook = by_slug or by_name
    created = 0
    if wordbook is None:
        wordbook = Wordbook(
            slug=manifest["slug"],
            name=manifest["display_name"],
            description=manifest["description"],
            level=manifest["level"],
            cover_color=manifest.get("cover_color", "#345C4B"),
            is_published=True,
        )
        db.add(wordbook)
        db.flush()
        created = 1
    else:
        wordbook.slug = manifest["slug"]
        wordbook.name = manifest["display_name"]
        wordbook.description = manifest["description"]
        wordbook.level = manifest["level"]
        wordbook.cover_color = manifest.get("cover_color", "#345C4B")
        wordbook.is_published = True

    existing = {
        item.word_id: item
        for item in db.scalars(
            select(WordbookWord).where(WordbookWord.wordbook_id == wordbook.id)
        ).all()
    }
    desired = {words[term].id: position for position, term in enumerate(build.words, 1)}
    added = removed = repositioned = 0
    for word_id, relation in existing.items():
        if word_id not in desired:
            db.delete(relation)
            removed += 1
        elif relation.position != desired[word_id]:
            relation.position = desired[word_id]
            repositioned += 1
    for word_id, position in desired.items():
        if word_id not in existing:
            db.add(
                WordbookWord(
                    wordbook_id=wordbook.id, word_id=word_id, position=position
                )
            )
            added += 1

    # A dictionary refresh must never replace a learner's chosen book.
    reassigned_users = 0
    for user in db.scalars(select(User).where(User.selected_wordbook_id.is_(None), User.selected_collection_id.is_(None))).all():
        user.selected_wordbook_id = wordbook.id
        reassigned_users += 1

    return wordbook, {
        "created": created,
        "members_added": added,
        "members_removed": removed,
        "members_repositioned": repositioned,
        "other_wordbooks_unpublished": 0,
        "users_reassigned": reassigned_users,
    }


def _upsert_sources(
    db: Session, build: WordlistBuild, words: dict[str, Word]
) -> dict[str, int]:
    source_created = entries_added = entries_removed = entries_repositioned = 0
    for source_build in build.sources:
        item = source_build.manifest
        source = db.scalar(
            select(WordlistSource).where(WordlistSource.source_key == item["source_key"])
        )
        metadata = {
            "display_name": item["display_name"],
            "repository_url": build.manifest["source_repository"],
            "repository_commit": build.manifest["source_commit"],
            "source_file": item["source_file"],
            "source_sha256": item["source_sha256"],
            "declared_count": item["declared_count"],
            "parsed_count": source_build.parsed_count,
            "license_status": item["license_status"],
            "transform_version": build.manifest["transform_version"],
        }
        if source is None:
            source = WordlistSource(source_key=item["source_key"], **metadata)
            db.add(source)
            db.flush()
            source_created += 1
        else:
            changed = False
            for field_name, value in metadata.items():
                if getattr(source, field_name) != value:
                    setattr(source, field_name, value)
                    changed = True
            if changed:
                source.imported_at = datetime.now(UTC).replace(tzinfo=None)

        existing = {
            relation.word_id: relation
            for relation in db.scalars(
                select(WordlistSourceEntry).where(
                    WordlistSourceEntry.source_id == source.id
                )
            ).all()
        }
        desired = {
            words[term].id: merged.source_positions[item["source_key"]]
            for term, merged in build.words.items()
            if item["source_key"] in merged.source_positions
        }
        for word_id, relation in existing.items():
            if word_id not in desired:
                db.delete(relation)
                entries_removed += 1
            elif relation.source_position != desired[word_id]:
                relation.source_position = desired[word_id]
                entries_repositioned += 1
        for word_id, position in desired.items():
            if word_id not in existing:
                db.add(
                    WordlistSourceEntry(
                        source_id=source.id,
                        word_id=word_id,
                        source_position=position,
                    )
                )
                entries_added += 1
    return {
        "sources_created": source_created,
        "entries_added": entries_added,
        "entries_removed": entries_removed,
        "entries_repositioned": entries_repositioned,
    }


def import_wordlist(db: Session, build: WordlistBuild) -> dict[str, Any]:
    words, word_stats = _upsert_words(db, build)
    wordbook, wordbook_stats = _upsert_wordbook(db, build, words)
    source_stats = _upsert_sources(db, build, words)
    presets = []
    preset_books = []
    if build.manifest.get("publish_source_books"):
        for source in build.sources:
            key = source.manifest["source_key"]
            ordered = sorted(
                (item for item in build.words.values() if key in item.source_positions),
                key=lambda item: item.source_positions[key],
            )
            source_manifest = {
                **build.manifest,
                "slug": "zhixian-" + source.manifest["slug"] + "-v1",
                "display_name": source.manifest["display_name"],
                "description": "系统预设 · 当前导入版本；与其他词书共享单词掌握进度。",
                "level": source.manifest["display_name"],
            }
            source_build = WordlistBuild(source_manifest, OrderedDict((item.term, item) for item in ordered), [], {})
            preset, stats = _upsert_wordbook(db, source_build, words)
            preset_books.append(preset)
            presets.append({"slug": preset.slug, "word_count": len(ordered), **stats})
    users_reassigned_from_merged = 0
    if preset_books and build.manifest.get("publish_merged_book") is False:
        replacement = preset_books[0]
        for user in db.scalars(select(User).where(User.selected_wordbook_id == wordbook.id)).all():
            user.selected_wordbook_id = replacement.id
            users_reassigned_from_merged += 1
        wordbook.is_published = False
    db.commit()
    return {
        "presets": presets,
        "merged_wordbook_published": wordbook.is_published,
        "users_reassigned_from_merged": users_reassigned_from_merged,
        "wordbook_id": wordbook.id,
        "wordbook_slug": wordbook.slug,
        "final_unique_terms": len(build.words),
        "words": word_stats,
        "wordbook": wordbook_stats,
        "sources": source_stats,
    }
