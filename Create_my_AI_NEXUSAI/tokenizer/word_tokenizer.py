class WordTokenizer:

    def __init__(self, text):

        words = text.lower().split()


        # добавляем специальный токен конца

        words.append("<EOS>")


        vocabulary = sorted(
            list(set(words))
        )


        self.word_to_id = {
            word: i
            for i, word in enumerate(vocabulary)
        }


        self.id_to_word = {
            i: word
            for word, i in self.word_to_id.items()
        }



    def encode(self, text):

        words = text.lower().split()


        return [
            self.word_to_id[word]
            for word in words
        ]



    def decode(self, tokens):

        result = []


        for token in tokens:

            word = self.id_to_word[token]


            if word == "<EOS>":
                break


            result.append(word)


        return " ".join(result)