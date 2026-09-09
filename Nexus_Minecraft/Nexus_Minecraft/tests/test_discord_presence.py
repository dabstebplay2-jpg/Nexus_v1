from __future__ import annotations

import unittest

from core.discord_presence import DiscordPresenceManager


class FakeRpc:
    def __init__(self):
        self.updates = []

    def update(self, **payload):
        self.updates.append(payload)


class DiscordPresenceTests(unittest.TestCase):
    def test_game_status_is_kept_until_minecraft_closes(self) -> None:
        manager = DiscordPresenceManager()
        fake_rpc = FakeRpc()
        manager._rpc = fake_rpc
        manager.connect = lambda: True

        instance = {
            "name": "Survival Pack",
            "minecraft_version": "1.20.1",
            "loader": "fabric",
        }

        self.assertTrue(manager.set_playing(instance))
        self.assertEqual(len(fake_rpc.updates), 1)
        self.assertEqual(fake_rpc.updates[-1]["details"], "Играет: Survival Pack")
        self.assertEqual(fake_rpc.updates[-1]["state"], "Minecraft 1.20.1 • fabric")

        self.assertTrue(manager.set_launcher_idle("Каталог"))
        self.assertEqual(len(fake_rpc.updates), 1)

        self.assertTrue(manager.set_browsing_mods())
        self.assertEqual(len(fake_rpc.updates), 1)

        self.assertTrue(manager.set_minecraft_closed("Minecraft закрыт"))
        self.assertEqual(len(fake_rpc.updates), 2)
        self.assertEqual(fake_rpc.updates[-1]["details"], "В Nexus Launcher")
        self.assertEqual(fake_rpc.updates[-1]["state"], "Minecraft закрыт")

    def test_launching_status_contains_instance_context(self) -> None:
        manager = DiscordPresenceManager()
        fake_rpc = FakeRpc()
        manager._rpc = fake_rpc
        manager.connect = lambda: True

        self.assertTrue(manager.set_launching({
            "name": "Tech",
            "minecraft_version": "1.21.1",
            "loader": "neoforge",
        }))

        self.assertEqual(fake_rpc.updates[-1]["details"], "Запускает: Tech")
        self.assertEqual(fake_rpc.updates[-1]["state"], "Minecraft 1.21.1 • neoforge")


if __name__ == "__main__":
    unittest.main()
