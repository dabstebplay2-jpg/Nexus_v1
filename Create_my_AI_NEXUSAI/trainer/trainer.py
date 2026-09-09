import torch


class NexusTrainer:


    def __init__(
        self,
        model,
        optimizer,
        device,
        use_amp=True
    ):

        self.model = model
        self.optimizer = optimizer
        self.device = device

        self.use_amp = use_amp and device == "cuda"


        # ускорение для RTX 30xx
        if device == "cuda":

            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True


        self.scaler = torch.amp.GradScaler(
            "cuda",
            enabled=self.use_amp
        )



    def train_step(
        self,
        x,
        y,
        loss_fn
    ):


        self.optimizer.zero_grad(
            set_to_none=True
        )


        with torch.amp.autocast(
            device_type="cuda",
            enabled=self.use_amp
        ):

            output = self.model(
                x
            )


            loss = loss_fn(
                output.reshape(
                    -1,
                    output.size(-1)
                ),
                y.reshape(-1)
            )



        # проверка ошибки
        if torch.isnan(loss):

            print(
                "WARNING: Loss is NaN"
            )

            return None



        self.scaler.scale(
            loss
        ).backward()



        # защита от взрыва градиентов
        self.scaler.unscale_(
            self.optimizer
        )


        torch.nn.utils.clip_grad_norm_(
            self.model.parameters(),
            max_norm=1.0
        )



        self.scaler.step(
            self.optimizer
        )


        self.scaler.update()



        return loss.item()