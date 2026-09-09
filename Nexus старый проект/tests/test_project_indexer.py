import json

from nexus.project.analyzer import ProjectAnalyzer
from nexus.project.indexer import ProjectIndexer


def test_indexer_finds_files_code_and_components(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    (source / "Header.tsx").write_text(
        "export function Header() { return <header>Nexus</header> }\n",
        encoding="utf-8",
    )
    (source / "App.tsx").write_text("import { Header } from './Header'\n", encoding="utf-8")

    index = ProjectIndexer(tmp_path).build()

    assert index.find_file("header") == ["src\\Header.tsx"]
    assert {item["path"] for item in index.search_code("Header")} == {
        "src\\App.tsx",
        "src\\Header.tsx",
    }
    assert index.find_component("Header") == ["src\\Header.tsx"]


def test_analyzer_exposes_project_queries(tmp_path):
    (tmp_path / "main.py").write_text("def launch():\n    return True\n", encoding="utf-8")
    (tmp_path / "package.json").write_text(
        json.dumps({"dependencies": {"react": "1"}}), encoding="utf-8"
    )
    analyzer = ProjectAnalyzer(tmp_path)
    analyzer.analyze()

    assert analyzer.find_file("main.py") == ["main.py"]
    assert analyzer.search_code("launch")[0]["line"] == 1
    assert analyzer.get_dependencies() == ["react"]
