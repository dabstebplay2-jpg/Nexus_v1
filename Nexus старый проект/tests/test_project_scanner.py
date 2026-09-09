import json

from nexus.project.scanner import ProjectScanner


def test_scanner_detects_react_typescript_and_vite(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "App.tsx").write_text("export const App = () => null", encoding="utf-8")
    (tmp_path / "vite.config.ts").write_text("export default {}", encoding="utf-8")
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "dependencies": {"react": "latest"},
                "devDependencies": {"vite": "latest", "typescript": "latest"},
            }
        ),
        encoding="utf-8",
    )
    ignored = tmp_path / "node_modules" / "package"
    ignored.mkdir(parents=True)
    (ignored / "noise.py").write_text("", encoding="utf-8")

    context = ProjectScanner(tmp_path).scan()

    assert context.language == "TypeScript"
    assert context.framework == "React"
    assert context.build == "Vite"
    assert context.files == 3
    assert set(context.dependencies) == {"react", "typescript", "vite"}
    assert context.structure["src"] == 1


def test_scanner_detects_python_project(tmp_path):
    (tmp_path / "app.py").write_text("from fastapi import FastAPI", encoding="utf-8")
    (tmp_path / "requirements.txt").write_text("fastapi==1.0\nuvicorn>=1\n", encoding="utf-8")

    context = ProjectScanner(tmp_path).scan()

    assert context.language == "Python"
    assert context.framework == "FastAPI"
    assert context.build == "Unknown"
