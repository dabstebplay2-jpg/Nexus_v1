import os
import tempfile
import unittest

from app.agent import execute_tool, resolve_workspace_path


class WorkspacePathTests(unittest.IsolatedAsyncioTestCase):
    def test_resolves_regular_child(self):
        with tempfile.TemporaryDirectory() as workspace:
            expected = os.path.join(os.path.realpath(workspace), "nested", "file.txt")
            self.assertEqual(resolve_workspace_path(workspace, "nested/file.txt"), expected)

    def test_rejects_parent_traversal(self):
        with tempfile.TemporaryDirectory() as workspace:
            with self.assertRaisesRegex(ValueError, "inside the workspace"):
                resolve_workspace_path(workspace, "../outside.txt")

    async def test_agent_cannot_write_outside_workspace(self):
        with tempfile.TemporaryDirectory() as parent:
            workspace = os.path.join(parent, "workspace")
            os.mkdir(workspace)
            outside = os.path.join(parent, "outside.txt")

            result = await execute_tool(
                "write_file",
                {"path": "../outside.txt", "content": "should not be written"},
                workspace,
            )

            self.assertIn("inside the workspace", result)
            self.assertFalse(os.path.exists(outside))


if __name__ == "__main__":
    unittest.main()
