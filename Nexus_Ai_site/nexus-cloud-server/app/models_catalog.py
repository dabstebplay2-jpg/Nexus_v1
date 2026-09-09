from app.services import models_registry as reg

TIER_RANK = reg.TIER_RANK


def tier_rank(tier: str | None) -> int:
    return reg.tier_rank(tier)


def get_model(model_id: str) -> dict | None:
    return reg.get_model(model_id)


def model_allowed(subscription_tier: str, model_id: str) -> bool:
    return reg.model_allowed(subscription_tier, model_id)


def model_access_detail(subscription_tier: str, model_id: str) -> dict:
    return reg.model_access_detail(subscription_tier, model_id)


async def model_access_detail_cached(subscription_tier: str, model_id: str) -> dict:
    return await reg.model_access_detail_cached(subscription_tier, model_id)


async def list_models_for_user(subscription_tier: str) -> list[dict]:
    return await reg.list_models_for_user(subscription_tier)


async def list_usable_models_for_user(subscription_tier: str) -> list[dict]:
    return await reg.list_usable_models_for_user(subscription_tier)


async def list_research_models_for_user(subscription_tier: str) -> list[dict]:
    return await reg.list_research_models_for_user(subscription_tier)


async def list_media_models_for_user(subscription_tier: str) -> list[dict]:
    return await reg.list_media_models_for_user(subscription_tier)


async def get_default_model(subscription_tier: str, **kwargs) -> str:
    return await reg.get_default_model(subscription_tier, **kwargs)


async def catalog_meta() -> dict:
    return await reg.catalog_meta()


async def vision_guide_for_user(subscription_tier: str) -> dict:
    return await reg.vision_guide_for_user(subscription_tier)
