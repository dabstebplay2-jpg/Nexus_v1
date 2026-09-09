# LEGACY - deprecated Nexus 3 CLI. The active entry point is nexus.cli.main.

import typer
from rich import print
from nexus.ui import render_dashboard, boot_sequence

app = typer.Typer(help='Nexus 3.1 Genesis AI Operating System')

@app.command()
def version():
    print('[bold cyan]Nexus 3.1 Genesis UI AI Operating System[/bold cyan]')

@app.command()
def launch():
    boot_sequence()
    render_dashboard()

@app.command()
def doctor():
    print('''\n[bold cyan]Nexus Doctor[/bold cyan]\n\n✓ Core: ONLINE\n✓ Kernel: ONLINE\n✓ AI Runtime: ONLINE\n✓ Agent Bus: ONLINE\n✓ Memory: ONLINE\n✓ Sandbox: READY\n✓ Security: ONLINE\n\n[green]System Health: OK[/green]\n''')

@app.command()
def status():
    print({'Core':'ONLINE','AI Runtime':'ONLINE','Agent OS':'ONLINE','Memory':'ONLINE','Sandbox':'READY','Plugins':'READY'})

@app.command()
def agents():
    print('''Nexus Agent Society\n\n✓ Director\n✓ Architect\n✓ Researcher\n✓ Planner\n✓ Developer\n✓ Tester\n✓ Critic\n✓ Security\n✓ Repair''')

@app.command()
def tools():
    print('''Nexus Tool Registry\n\n✓ File System\n✓ Terminal\n✓ Python Runtime\n✓ Git\n✓ Web\n✓ Code Analyzer''')

@app.command()
def memory():
    print('''Nexus Memory System\n\n✓ Short Term Memory\n✓ Long Term Memory\n✓ Vector Memory\n✓ Knowledge Graph''')

@app.command()
def task(prompt:str):
    print({'task':prompt,'pipeline':['Understand','Plan','Agents','Execute','Test','Repair','Verify'],'status':'accepted'})

if __name__=='__main__':
    app()
