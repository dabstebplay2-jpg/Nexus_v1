AGENTS = [
    {"id": "quick", "name": "Быстрый чат", "emoji": "💬", "mode": "chat", "description": "Прямой диалог без поиска.", "model_preference": "cheap", "min_tier": "FREE", "suggested_prompts": ["Объясни async/await простыми словами"]},
    {"id": "research", "name": "Research", "emoji": "🔍", "mode": "research", "description": "Поиск в сети + источники.", "model_preference": "premium", "min_tier": "STANDARD", "suggested_prompts": ["Новости ИИ 2026"]},
    {"id": "coder", "name": "Code Architect", "emoji": "⚡", "mode": "chat", "description": "Код и архитектура.", "model_preference": "premium", "min_tier": "PRO", "suggested_prompts": ["Спроектируй REST API"]},
    {"id": "writer", "name": "Creative Writer", "emoji": "✍️", "mode": "chat", "description": "Тексты и редактура.", "model_preference": "balanced", "min_tier": "STANDARD", "suggested_prompts": ["Пост о запуске стартапа"]},
    {"id": "analyze", "name": "Deep Analyze", "emoji": "📊", "mode": "research", "description": "Глубокий разбор темы.", "model_preference": "premium", "min_tier": "PRO", "suggested_prompts": ["SWOT SaaS IDE"]},
    {"id": "ultra", "name": "Ultra Reasoning", "emoji": "🧠", "mode": "chat", "description": "Топ-модели.", "model_preference": "premium", "min_tier": "ULTRA", "suggested_prompts": ["Система на 1M пользователей"]},
]

_AGENT_BY_ID = {a["id"]: a for a in AGENTS}


def get_agent(agent_id: str) -> dict | None:
    return _AGENT_BY_ID.get(agent_id)


async def list_agents_for_user(subscription_tier: str) -> list[dict]:
    from app.config import is_testing_mode
    from app.models_catalog import get_default_model
    from app.services.models_registry import tier_rank
    from app.tiers import normalize_tier

    user_rank = tier_rank(normalize_tier(subscription_tier))
    out = []
    for a in AGENTS:
        locked = False if is_testing_mode() else user_rank < tier_rank(a["min_tier"])
        item = {
            **a,
            "locked": locked,
            "required_tier": a["min_tier"],
            "lock_message": None if not locked else f"Нужен тариф {a['min_tier'].title()}",
        }
        if not item["locked"]:
            item["default_model"] = await get_default_model(subscription_tier, prefer=a.get("model_preference", "balanced"))
        else:
            item["default_model"] = None
        out.append(item)
    return out
