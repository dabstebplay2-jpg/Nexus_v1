
def recommend(models):


    result=[]


    for m in models:


        score=50


        name=m.get(
            "name",
            ""
        ).lower()


        if "coder" in name:

            score+=30


        if "qwen" in name:

            score+=10


        if "deepseek" in name:

            score+=10



        result.append(
            (
                score,
                m
            )
        )


    result.sort(
        reverse=True,
        key=lambda x:x[0]
    )


    return result
