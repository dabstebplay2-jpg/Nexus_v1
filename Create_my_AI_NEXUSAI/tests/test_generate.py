from nexusai import NexusAI


ai = NexusAI.load(
    "models/NexusAI_v0.009"
)


print(
    ai.generate(
        "кот",
        10
    )
)