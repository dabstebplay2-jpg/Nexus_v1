from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
import time

console = Console()

def boot_sequence():
    console.print('[bold cyan]NEXUS 3.1 GENESIS UI[/bold cyan]')
    with Progress(SpinnerColumn(), TextColumn('{task.description}')) as progress:
        for item in [
            'Loading Kernel',
            'Connecting Event Bus',
            'Awakening Agents',
            'Loading Memory Core',
            'Preparing Tools'
        ]:
            task = progress.add_task(item, total=None)
            time.sleep(0.05)
            progress.remove_task(task)
    console.print('[green]System Ready[/green]')
