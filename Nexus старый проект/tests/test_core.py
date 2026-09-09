from nexus.core.engine import NexusCore

def test_core():
    core=NexusCore()
    assert core.tasks is not None
