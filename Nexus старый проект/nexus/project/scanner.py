"""Fast workspace scanner with language/framework/build detection."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
import tomllib

from nexus.project.context import ProjectContext


IGNORED_DIRECTORIES = frozenset(
    {".git", ".venv", "venv", "node_modules", "dist", "build", "__pycache__", ".pytest_cache"}
)

LANGUAGES = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".kt": "Kotlin",
    ".cs": "C#",
    ".php": "PHP",
    ".rb": "Ruby",
}


class ProjectScanner:
    def __init__(self, root: str | Path = "."):
        self.root = Path(root).resolve()

    def files(self) -> list[Path]:
        result: list[Path] = []
        for path in self.root.rglob("*"):
            if any(part in IGNORED_DIRECTORIES for part in path.relative_to(self.root).parts):
                continue
            if path.is_file():
                result.append(path)
        return result

    def scan(self) -> ProjectContext:
        files = self.files()
        extensions = Counter(path.suffix.lower() for path in files)
        language_scores = Counter()
        for extension, count in extensions.items():
            language = LANGUAGES.get(extension)
            if language:
                language_scores[language] += count
        language = language_scores.most_common(1)[0][0] if language_scores else "Unknown"
        dependencies = self._dependencies()
        framework = self._framework(dependencies, files)
        build = self._build_system(files)
        structure = Counter(
            path.relative_to(self.root).parts[0]
            for path in files
            if path.relative_to(self.root).parts
        )
        return ProjectContext(
            root=str(self.root),
            language=language,
            framework=framework,
            build=build,
            files=len(files),
            dependencies=dependencies,
            structure=dict(structure),
            metadata={"extensions": dict(extensions)},
        )

    def _dependencies(self) -> list[str]:
        package_json = self.root / "package.json"
        if package_json.exists():
            try:
                data = json.loads(package_json.read_text(encoding="utf-8"))
                names = [*data.get("dependencies", {}), *data.get("devDependencies", {})]
                return sorted(set(names))
            except (OSError, UnicodeError, json.JSONDecodeError):
                pass
        pyproject = self.root / "pyproject.toml"
        if pyproject.exists():
            try:
                data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
                project = data.get("project", {})
                return [str(item) for item in project.get("dependencies", [])]
            except (OSError, UnicodeError, tomllib.TOMLDecodeError):
                pass
        requirements = self.root / "requirements.txt"
        if requirements.exists():
            return [
                line.strip()
                for line in requirements.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.lstrip().startswith("#")
            ]
        return []

    @staticmethod
    def _framework(dependencies: list[str], files: list[Path]) -> str:
        normalized = {item.lower().split("[")[0].split("=")[0].strip() for item in dependencies}
        checks = (
            ("next", "Next.js"),
            ("react", "React"),
            ("vue", "Vue"),
            ("svelte", "Svelte"),
            ("@angular/core", "Angular"),
            ("django", "Django"),
            ("fastapi", "FastAPI"),
            ("flask", "Flask"),
        )
        for dependency, label in checks:
            if dependency in normalized:
                return label
        names = {path.name.lower() for path in files}
        if "vite.config.ts" in names or "vite.config.js" in names:
            return "Vite"
        return "Unknown"

    def _build_system(self, files: list[Path]) -> str:
        names = {path.name.lower() for path in files}
        if any(name.startswith("vite.config.") for name in names):
            return "Vite"
        if "next.config.js" in names or "next.config.mjs" in names:
            return "Next.js"
        if "package.json" in names:
            return "npm"
        if "pyproject.toml" in names:
            return "PyProject"
        if "cargo.toml" in names:
            return "Cargo"
        if "go.mod" in names:
            return "Go Modules"
        if "pom.xml" in names:
            return "Maven"
        if "build.gradle" in names or "build.gradle.kts" in names:
            return "Gradle"
        return "Unknown"


__all__ = ["IGNORED_DIRECTORIES", "ProjectScanner"]
