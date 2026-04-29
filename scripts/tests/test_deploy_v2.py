import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "deploy_v2.py"
SPEC = importlib.util.spec_from_file_location("deploy_v2", SCRIPT_PATH)
assert SPEC is not None
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ResolveVercelDeployContextTest(unittest.TestCase):
    def test_uses_repo_root_and_project_ids_when_link_file_exists(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            project_dir = repo_root / "apps" / "hospital"
            project_dir.mkdir(parents=True)
            vercel_dir = project_dir / ".vercel"
            vercel_dir.mkdir()
            (vercel_dir / "project.json").write_text(
                '{"projectId":"prj_123","orgId":"team_456","projectName":"hospital"}',
                encoding="utf-8",
            )

            context = MODULE.resolve_vercel_deploy_context(repo_root, project_dir)

            self.assertEqual(context.cwd, repo_root)
            self.assertEqual(
                context.env,
                {
                    "VERCEL_PROJECT_ID": "prj_123",
                    "VERCEL_ORG_ID": "team_456",
                },
            )

    def test_defaults_to_project_dir_without_link_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            project_dir = repo_root / "apps" / "hospital"
            project_dir.mkdir(parents=True)

            context = MODULE.resolve_vercel_deploy_context(repo_root, project_dir)

            self.assertEqual(context.cwd, project_dir)
            self.assertEqual(context.env, {})


class RemoteApiEnvValidationTest(unittest.TestCase):
    def test_rejects_localhost_production_origins(self) -> None:
        env = {
            "ADMIN_ORIGIN": "http://localhost:3002",
            "HOSPITAL_ORIGIN": "https://hospital.medicaltourismchina.health",
            "NODE_ENV": "production",
        }

        with self.assertRaises(MODULE.CommandError) as context:
            MODULE.validate_remote_api_env_values(env)

        self.assertIn("ADMIN_ORIGIN must not point to localhost in production", str(context.exception))

    def test_accepts_public_production_origins(self) -> None:
        env = {
            "ADMIN_ORIGIN": "https://admin.medicaltourismchina.health",
            "HOSPITAL_ORIGIN": "https://hospital.medicaltourismchina.health",
            "NODE_ENV": "production",
        }

        MODULE.validate_remote_api_env_values(env)


if __name__ == "__main__":
    unittest.main()
