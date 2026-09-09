"""Nexus Orchestra Runtime V1."""

from nexus.orchestra.artifacts import Artifact, ArtifactStore
from nexus.orchestra.graph import TaskGraph, WorkStatus, WorkUnit
from nexus.orchestra.planner import OrchestraPlanner
from nexus.orchestra.roles import RoleDefinition, RoleRegistry, default_role_registry
from nexus.orchestra.state import OrchestraState
from nexus.orchestra.verifier import PASS, REPAIR_REQUIRED, Verifier, VerifierAgent
from nexus.orchestra.worker import WorkerAgent


def __getattr__(name):
    # Director and runtime are lazy to avoid a package cycle while the legacy
    # nexus.agents namespace imports Orchestra graph primitives.
    if name in {"DirectorAgent", "OrchestraDirector"}:
        from nexus.orchestra.director import DirectorAgent, OrchestraDirector

        return {"DirectorAgent": DirectorAgent, "OrchestraDirector": OrchestraDirector}[name]
    if name == "OrchestraRuntime":
        from nexus.orchestra.runtime import OrchestraRuntime

        return OrchestraRuntime
    raise AttributeError(name)

__all__ = [
    "Artifact",
    "ArtifactStore",
    "DirectorAgent",
    "OrchestraDirector",
    "OrchestraPlanner",
    "OrchestraRuntime",
    "OrchestraState",
    "PASS",
    "REPAIR_REQUIRED",
    "RoleDefinition",
    "RoleRegistry",
    "TaskGraph",
    "Verifier",
    "VerifierAgent",
    "WorkerAgent",
    "WorkStatus",
    "WorkUnit",
    "default_role_registry",
]
