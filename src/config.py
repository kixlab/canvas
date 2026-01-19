import os
import yaml
from pathlib import Path

CONFIG_DIR = Path(__file__).parent / "config"


def load_config(file: str = "base.yaml") -> dict:
    path = CONFIG_DIR / file
    if not path.exists():
        raise FileNotFoundError(f"[Config] Not found: {path.resolve()}")
    with open(path, "r") as f:
        return yaml.safe_load(f)


def load_server_config(agent_type: str = "single") -> dict:
    if agent_type not in ("single", "multi"):
        raise ValueError(f"Unsupported agent_type: {agent_type}")
    fname = f"server_{agent_type}.yaml"
    return load_config(fname)


def load_single_config() -> dict:
    return load_config("single.yaml")


def load_multi_config() -> dict:
    return load_config("multi.yaml")


def load_experiment_config(name: str) -> dict:
    return load_config(Path("expr") / f"{name}.yaml")
