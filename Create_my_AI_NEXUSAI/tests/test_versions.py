from nexusai import NexusAI



print("Загрузка v0.009")


ai1 = NexusAI.load(
    "models/NexusAI_v0.009"
)


print(
    "Тип:",
    ai1.config["type"]
)


print()


print("Загрузка v0.010")


ai2 = NexusAI.load(
    "models/NexusAI_v0.010"
)


print(
    "Тип:",
    ai2.config["type"]
)