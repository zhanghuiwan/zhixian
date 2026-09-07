from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.wordlist_import import (
    WordlistValidationError,
    build_wordlist,
    import_wordlist,
    load_documents_from_git,
    load_manifest,
    load_wordlist_bundle,
    resolve_bundle_path,
    verify_wordlist_bundle,
    validate_import_permission,
    write_wordlist_bundle,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="构建并导入知闲英文核心词库")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--source-repo", type=Path, help="按固定提交重新读取上游源")
    parser.add_argument("--bundle", type=Path, help="覆盖 manifest 中的数据包路径")
    parser.add_argument(
        "--write-bundle",
        action="store_true",
        help="从 --source-repo 重新生成 Git 数据包",
    )
    parser.add_argument("--apply", action="store_true", help="写入数据库；默认只检查")
    parser.add_argument(
        "--allow-internal-evaluation",
        action="store_true",
        help="允许仅在非生产环境写入 internal-evaluation-only 来源",
    )
    parser.add_argument("--report", type=Path, help="将机器可读报告写到指定路径")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        manifest = load_manifest(args.manifest.resolve())
        bundle_path = (
            args.bundle.resolve()
            if args.bundle
            else resolve_bundle_path(args.manifest.resolve(), manifest)
        )
        if args.source_repo:
            documents = load_documents_from_git(manifest, args.source_repo.resolve())
            build = build_wordlist(manifest, documents)
            if args.write_bundle:
                output_sha256 = write_wordlist_bundle(build, bundle_path)
                output = {
                    "mode": "bundle-written",
                    "bundle": str(bundle_path),
                    "bundle_sha256": output_sha256,
                    "quality": build.report,
                }
            else:
                verify_wordlist_bundle(build, bundle_path)
                output = {"mode": "source-and-bundle-verified", "quality": build.report}
        else:
            if args.write_bundle:
                raise WordlistValidationError("--write-bundle 必须同时提供 --source-repo")
            build = load_wordlist_bundle(manifest, bundle_path)
            output = {"mode": "bundle-verified", "quality": build.report}
        if args.apply:
            settings = get_settings()
            validate_import_permission(
                manifest,
                environment=settings.environment,
                allow_internal_evaluation=args.allow_internal_evaluation,
            )
            with SessionLocal() as db:
                output["mode"] = "applied"
                output["database"] = import_wordlist(db, build)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(
                json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0
    except WordlistValidationError as exc:
        print(json.dumps({"status": "error", "detail": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
