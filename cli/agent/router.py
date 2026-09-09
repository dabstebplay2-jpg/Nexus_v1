class Router:

    def route(self, text):
        if any(x in text.lower() for x in ["код","ошибка","файл","проект"]):
            return "AGENT"
        return "CHAT"
