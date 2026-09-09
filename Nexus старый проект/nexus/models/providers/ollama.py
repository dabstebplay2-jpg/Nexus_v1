from __future__ import annotations

import httpx

from nexus.models.base import ModelProvider
from nexus.models.types import DiscoveredModel


async def http_get(url, **kwargs):
    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        return await client.get(url, **kwargs)


async def http_post(url, **kwargs):
    async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
        return await client.post(url, **kwargs)



class OllamaProvider(ModelProvider):

    provider_name = "ollama"


    def __init__(self, provider, secrets=None):
        super().__init__(provider, secrets)
        self.base_url = (
            getattr(provider, "base_url", None)
            or "http://localhost:11434"
        )


    async def check_connection(self):

        try:

            response = await http_get(
                self.base_url + "/api/tags"
            )

            return response.status_code == 200


        except Exception:

            return False



    async def list_models(self):

        response = await http_get(
            self.base_url + "/api/tags"
        )

        response.raise_for_status()

        data = response.json()


        return [
            DiscoveredModel(
                id=m.get("name"),
                name=m.get("name"),
                provider_id=self.provider.id,
                type=self.provider.model_type,
            )
            for m in data.get("models", [])
        ]



    async def generate(self, prompt: str):

        model = self.entry.model

        if not model:
            raise RuntimeError(
                "No Ollama model available"
            )


        response = await http_post(
            self.base_url + "/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
            }
        )


        response.raise_for_status()


        data = response.json()


        return (
            data.get("response")
            or data.get("message", {}).get("content")
            or ""
        )



    async def diagnose(self):

        try:

            response = await http_get(
                self.base_url + "/api/tags"
            )

            response.raise_for_status()

            data = response.json()

            return {
                "ok": True,
                "provider": "ollama",
                "models": [
                    m.get("name")
                    for m in data.get("models", [])
                ]
            }


        except Exception as e:

            return {
                "ok": False,
                "provider": "ollama",
                "error": str(e),
                "exception": type(e).__name__
            }



    async def stream_generate(
        self,
        model,
        prompt
    ):

        import httpx
        import json


        async with httpx.AsyncClient(trust_env=False) as client:

            async with client.stream(
                "POST",
                self.base_url + "/api/generate",
                json={
                    "model":model,
                    "prompt":prompt,
                    "stream":True
                }
            ) as response:


                async for line in response.aiter_lines():

                    if not line:
                        continue


                    data=json.loads(line)


                    token=data.get(
                        "response",
                        ""
                    )


                    if token:
                        yield token

