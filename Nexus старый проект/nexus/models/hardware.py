
import platform
import subprocess



def detect_hardware():

    import platform
    import subprocess


    result = {
        "cpu": platform.processor(),
        "ram": "unknown",
        "gpu": [],
        "vram": []
    }



    # RAM
    try:

        out = subprocess.check_output(
            [
                "powershell",
                "-Command",
                "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"
            ],
            text=True
        )


        value = int(
            out.strip()
        )


        result["ram"] = round(
            value / 1024**3,
            1
        )


    except Exception as e:


        try:

            import psutil

            result["ram"] = round(
                psutil.virtual_memory().total / 1024**3,
                1
            )


        except:

            result["ram"] = "unknown"



    # NVIDIA GPU

    try:

        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total",
                "--format=csv,noheader"
            ],
            text=True
        )


        for line in out.splitlines():

            result["gpu"].append(
                line.strip()
            )


    except:

        pass



    return result
