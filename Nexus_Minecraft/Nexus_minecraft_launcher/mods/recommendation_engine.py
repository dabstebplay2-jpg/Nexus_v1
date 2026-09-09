from mods.smart_presets import SMART_PRESETS


class RecommendationEngine:
    def get_presets(self):
        return SMART_PRESETS

    def get_preset(self, preset_id: str):
        for preset in SMART_PRESETS:
            if preset["id"] == preset_id:
                return preset

        return None

    def get_recommended_mods(self, preset_id: str):
        preset = self.get_preset(preset_id)

        if not preset:
            return []

        return preset.get("mods", [])

    def get_recommended_ram(self, preset_id: str):
        preset = self.get_preset(preset_id)

        if not preset:
            return 4096

        return preset.get("recommended_ram", 4096)