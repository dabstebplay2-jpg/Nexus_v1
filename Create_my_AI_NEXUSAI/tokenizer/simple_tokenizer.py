class SimpleTokenizer:
    def __init__(self, text):
        chars = sorted(list(set(text)))

        self.char_to_id = {
            ch: i for i, ch in enumerate(chars)
        }

        self.id_to_char = {
            i: ch for ch, i in self.char_to_id.items()
        }


    def encode(self, text):
        return [
            self.char_to_id[ch]
            for ch in text
        ]


    def decode(self, tokens):
        return "".join(
            self.id_to_char[i]
            for i in tokens
        )