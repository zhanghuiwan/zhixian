"""Minimal credential-safe MiniMax smoke test.

Usage from apps/api:
    MINIMAX_API_KEY=... python ../../scripts/verify_minimax.py

The script never prints the credential or model response content.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1] / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from app.services.ai.providers import build_provider


async def main() -> int:
    api_key = os.environ.get("MINIMAX_API_KEY", "").strip()
    model = os.environ.get("MINIMAX_MODEL", "MiniMax-M3").strip()
    if len(api_key) < 8:
        print(json.dumps({"ok": False, "step": "input", "error": "missing_key"}))
        return 2

    provider = build_provider("minimax", api_key=api_key, model=model)
    result = await provider.test_connection()
    basic = await provider.chat(
        messages=[
            {
                "role": "user",
                "content": "仅回复 OK，不要添加其他文字。",
            }
        ]
    )
    if not basic.content.strip():
        raise RuntimeError("empty_basic_response")

    streamed_characters = 0
    async for event in provider.stream_chat(
        messages=[{"role": "user", "content": "仅回复 STREAM_OK。"}]
    ):
        if event.kind == "text":
            streamed_characters += len(event.content)
    if streamed_characters == 0:
        raise RuntimeError("empty_stream_response")

    tool = await provider.chat(
        messages=[
            {
                "role": "user",
                "content": "必须调用 lookup_word 工具查询 wander，不要直接回答。",
            }
        ],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "lookup_word",
                    "description": "查询单词。",
                    "parameters": {
                        "type": "object",
                        "properties": {"term": {"type": "string"}},
                        "required": ["term"],
                        "additionalProperties": False,
                    },
                },
            }
        ],
    )
    if not tool.tool_calls or tool.tool_calls[0].name != "lookup_word":
        raise RuntimeError("tool_call_not_returned")
    json.loads(tool.tool_calls[0].arguments)
    print(
        json.dumps(
            {
                "ok": True,
                "model": result.model,
                "model_list_latency_ms": result.latency_ms,
                "basic_chat": True,
                "streaming": True,
                "tool_call": True,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error_type": type(exc).__name__,
                    "message": str(exc),
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(1)
