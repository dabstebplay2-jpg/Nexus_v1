
from pathlib import Path
import subprocess



def get_roots():

    return [

        Path.home(),

        Path("C:/AI"),
        Path("D:/AI"),

        Path("C:/Models"),
        Path("D:/Models"),

    ]




def scan_ollama():

    result=[]

    try:

        out=subprocess.check_output(
            [
                "ollama",
                "list"
            ],
            text=True
        )


        for line in out.splitlines()[1:]:

            parts=line.split()

            if parts:

                result.append(
                    {
                        "name":parts[0],
                        "type":"ollama",
                        "provider":"ollama"
                    }
                )

    except:
        pass


    return result





def is_lora(path):


    name=path.name.lower()


    return (
        "adapter_model" in name
        or
        "adapter_config" in name
    )





def detect_hf_model(folder):


    files=list(folder.glob("*"))


    has_config = any(
        x.name=="config.json"
        for x in files
    )


    has_weights = any(
        x.suffix in [
            ".safetensors",
            ".bin"
        ]
        for x in files
    )


    if has_config and has_weights:

        return True


    return False






def scan_files():

    models=[]

    adapters=0



    checked=set()



    for root in get_roots():


        if not root.exists():
            continue



        try:


            for file in root.rglob("*"):


                if not file.is_file():
                    continue



                if is_lora(file):

                    adapters+=1

                    continue




                if file.suffix.lower()==".gguf":


                    size=file.stat().st_size/1024**3


                    if size>0.5:


                        models.append(
                            {
                                "name":file.stem,
                                "path":str(file),
                                "size_gb":round(size,2),
                                "type":"GGUF",
                                "provider":"llama.cpp"
                            }
                        )



        except:

            pass




    # HuggingFace folders

    for root in get_roots():

        try:

            for folder in root.rglob("*"):


                if not folder.is_dir():
                    continue


                if detect_hf_model(folder):


                    total=sum(
                        x.stat().st_size
                        for x in folder.glob("*")
                        if x.is_file()
                    )/1024**3



                    models.append(
                        {
                            "name":folder.name,
                            "path":str(folder),
                            "size_gb":round(total,2),
                            "type":"HuggingFace",
                            "provider":"transformers"
                        }
                    )


        except:

            pass



    return models, adapters






def scan_all():


    models=scan_ollama()


    files, adapters=scan_files()


    models.extend(files)


    return models
