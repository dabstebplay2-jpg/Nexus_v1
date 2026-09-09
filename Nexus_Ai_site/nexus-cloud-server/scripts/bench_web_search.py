import asyncio
import time

from app.services.web_search_agent import run_web_search_session


async def main() -> None:
    t0 = time.monotonic()
    all_src, prompt, engine, meta = await run_web_search_session(
        "кастория honkai star rail castorice",
        api_key="",
        subscription_tier="STANDARD",
    )
    print(
        "elapsed_s",
        round(time.monotonic() - t0, 1),
        "sources",
        len(all_src),
        "prompt",
        len(prompt),
        "engine",
        engine,
        "rounds",
        len(meta.get("rounds") or []),
    )


if __name__ == "__main__":
    asyncio.run(main())
