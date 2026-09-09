
import re



def estimate_parameters(name):

    name=name.lower()


    # 0.5b, 1b, 7b, 14b
    match=re.search(
        r'(\d+(?:\.\d+)?)b',
        name
    )


    if match:

        return float(
            match.group(1)
        )


    return None





def analyze(model, hardware):


    result=dict(model)


    params=estimate_parameters(
        model.get(
            "name",
            ""
        )
    )


    result["parameters_b"]=params


    vram=0


    for gpu in hardware.get(
        "gpu",
        []
    ):

        if "12288" in gpu:

            vram=12



    if params:

        result["vram_required"]=round(
            params*0.6,
            2
        )

    else:

        result["vram_required"]="unknown"



    if isinstance(
        result["vram_required"],
        float
    ):


        if result["vram_required"] <= vram:

            result["compatible"]="GOOD"

        else:

            result["compatible"]="LIMITED"

    else:

        result["compatible"]="UNKNOWN"



    return result
