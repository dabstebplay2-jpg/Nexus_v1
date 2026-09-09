import json


class GPTTokenizer:


    def __init__(self, text):

        words = text.lower().split()


        vocab = [
            "<PAD>",
            "<EOS>",
            "<UNK>"
        ]


        vocab += sorted(
            list(set(words))
        )


        self.word_to_id = {
            word:i
            for i,word in enumerate(vocab)
        }


        self.id_to_word = {
            i:word
            for word,i in self.word_to_id.items()
        }



    def encode(self,text):

        result=[]


        for word in text.lower().split():

            result.append(
                self.word_to_id.get(
                    word,
                    self.word_to_id["<UNK>"]
                )
            )


        result.append(
            self.word_to_id["<EOS>"]
        )


        return result



    def decode(self,tokens):

        result=[]


        for token in tokens:

            word=self.id_to_word[token]


            if word=="<EOS>":
                break


            if word not in [
                "<PAD>",
                "<UNK>"
            ]:

                result.append(word)


        return " ".join(result)



    def save(self,path):

        with open(
            path,
            "w",
            encoding="utf-8"
        ) as f:

            json.dump(
                {
                    "word_to_id":self.word_to_id,
                    "id_to_word":self.id_to_word
                },
                f,
                ensure_ascii=False,
                indent=4
            )
