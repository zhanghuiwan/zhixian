import hashlib
import json

import pytest
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import Wordbook, WordbookWord, WordlistSource, WordlistSourceEntry
from app.services.wordlist_import import (
    WordlistValidationError,
    build_wordlist,
    import_wordlist,
    load_wordlist_bundle,
    normalize_term,
    serialize_wordlist_bundle,
    validate_import_permission,
)


def make_build():
    payloads = {
        "source-a": [
            {
                "name": "  Apple ",
                "trans": ["n. 苹果", "<俚>宝贝", ""],
                "usphone": "ˈæpl",
                "ukphone": "ˈæpl",
            },
            {
                "name": "apple",
                "trans": ["n. 苹果"],
                "usphone": "ˈæpl",
                "ukphone": "ˈæpl",
            },
        ],
        "source-b": [
            {
                "name": "APPLE",
                "trans": ["苹果树的果实 (n.)"],
                "usphone": "ˈæpəl",
                "ukphone": "ˈæpəl",
            },
            {
                "name": "pear",
                "trans": ["梨 (n.)"],
                "usphone": "per",
                "ukphone": "peə",
            },
        ],
    }
    documents = {
        key: json.dumps(value, ensure_ascii=False).encode() for key, value in payloads.items()
    }
    manifest = {
        "schema_version": 1,
        "slug": "test-core-en-v1",
        "display_name": "测试核心词库",
        "description": "用于测试",
        "level": "A1–C1",
        "language": "en",
        "cover_color": "#123456",
        "transform_version": 1,
        "merge_strategy": "first-source-wins",
        "source_repository": "https://example.test/source.git",
        "source_commit": "a" * 40,
        "sources": [
            {
                "source_key": key,
                "slug": key,
                "display_name": key,
                "source_file": f"public/dicts/{key}.json",
                "declared_count": len(payloads[key]),
                "source_sha256": hashlib.sha256(documents[key]).hexdigest(),
                "license_status": "internal-evaluation-only",
                "license_evidence": [],
            }
            for key in payloads
        ],
    }
    return manifest, build_wordlist(manifest, documents)


def test_build_wordlist_normalizes_and_deduplicates():
    _, build = make_build()

    assert normalize_term("  APPLE  ") == "apple"
    assert list(build.words) == ["apple", "pear"]
    assert build.words["apple"].translation == "苹果；（俚）宝贝"
    assert build.words["apple"].part_of_speech == "n."
    assert build.words["apple"].source_positions == {"source-a": 1, "source-b": 1}
    assert build.report["totals"]["source_rows"] == 4
    assert build.report["totals"]["within_source_duplicates"] == 1
    assert build.report["totals"]["cross_source_duplicates"] == 1
    assert build.report["totals"]["final_unique_terms"] == 2


def test_internal_evaluation_cannot_be_imported_to_production():
    manifest, _ = make_build()

    with pytest.raises(WordlistValidationError):
        validate_import_permission(
            manifest, environment="production", allow_internal_evaluation=True
        )
    with pytest.raises(WordlistValidationError):
        validate_import_permission(
            manifest, environment="development", allow_internal_evaluation=False
        )
    validate_import_permission(
        manifest, environment="development", allow_internal_evaluation=True
    )


def test_committed_bundle_round_trip_and_hash_validation(tmp_path):
    manifest, build = make_build()
    content = serialize_wordlist_bundle(build)
    manifest["bundle_count"] = 2
    manifest["bundle_sha256"] = hashlib.sha256(content).hexdigest()
    bundle_path = tmp_path / "core.jsonl"
    bundle_path.write_bytes(content)

    loaded = load_wordlist_bundle(manifest, bundle_path)

    assert list(loaded.words) == ["apple", "pear"]
    assert loaded.words["apple"].source_positions == {
        "source-a": 1,
        "source-b": 1,
    }
    bundle_path.write_bytes(content + b"\n")
    with pytest.raises(WordlistValidationError, match="SHA-256"):
        load_wordlist_bundle(manifest, bundle_path)


def test_import_is_idempotent_and_publishes_one_wordbook():
    _, build = make_build()

    with SessionLocal() as db:
        first = import_wordlist(db, build)
        second = import_wordlist(db, build)

        assert first["final_unique_terms"] == 2
        assert first["words"]["created"] == 2
        assert first["wordbook"]["members_added"] == 2
        assert first["sources"]["sources_created"] == 2
        assert first["sources"]["entries_added"] == 3

        assert second["words"]["created"] == 0
        assert second["words"]["updated"] == 0
        assert second["wordbook"]["members_added"] == 0
        assert second["wordbook"]["members_removed"] == 0
        assert second["wordbook"]["members_repositioned"] == 0
        assert second["sources"]["sources_created"] == 0
        assert second["sources"]["entries_added"] == 0
        assert second["sources"]["entries_removed"] == 0
        assert second["sources"]["entries_repositioned"] == 0

        published = db.scalars(
            select(Wordbook).where(Wordbook.is_published.is_(True))
        ).all()
        assert [item.slug for item in published] == ["test-core-en-v1"]
        assert db.scalar(select(func.count()).select_from(WordbookWord)) == 4
        assert (
            db.scalar(
                select(func.count())
                .select_from(WordbookWord)
                .where(WordbookWord.wordbook_id == published[0].id)
            )
            == 2
        )
        assert db.scalar(select(func.count()).select_from(WordlistSource)) == 2
        assert db.scalar(select(func.count()).select_from(WordlistSourceEntry)) == 3
