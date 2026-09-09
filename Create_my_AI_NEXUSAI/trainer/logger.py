import time


class Progress:

    def __init__(self,total):

        self.total=total
        self.start=time.time()



    def show(
        self,
        step,
        loss
    ):

        elapsed=time.time()-self.start

        speed=step/elapsed if elapsed else 0

        remain=(self.total-step)/speed if speed else 0


        print(
            f"\r"
            f"Batch {step}/{self.total} "
            f"Loss:{loss:.4f} "
            f"Speed:{speed:.1f}/s "
            f"ETA:{remain:.1f}s",
            end=""
        )
