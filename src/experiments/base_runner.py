import os
import json
import yaml
import asyncio
import aiohttp
import requests
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
import logging
from config import load_experiment_config
from .enums import ModelType, Channel, ExperimentVariant, TaskType, GuidanceType
from .logger import ExperimentLogger
import base64

def parse_common_args(parser: argparse.ArgumentParser) -> argparse.ArgumentParser:
    """Add common arguments to the parser."""
    parser.add_argument("--model", type=str, required=True, choices=[m.value for m in ModelType],
                      help="Model to use (e.g. gpt-4, qwen)")
    parser.add_argument("--variants", type=str, required=True,
                      help="Comma-separated list of variants")
    parser.add_argument("--channel", type=str, required=True, choices=[c.value for c in Channel],
                      help="Channel name from config.yaml")
    parser.add_argument("--config-name", type=str, required=True,
                      help="Name of the experiment configuration")
    parser.add_argument("--batch-name", type=str,
                      help="Optional: batch name to run (e.g., batch_1)")
    parser.add_argument("--batches-config-path", type=str,
                      help="Optional: path to batches.yaml")
    parser.add_argument("--multi-agent", action="store_true",
                      help="Use multi-agent (supervisor-worker) mode")
    parser.add_argument("--guidance", type=str, choices=[g.value for g in GuidanceType],
                      help="Guidance type to use")
    return parser

@dataclass
class ExperimentConfig:
    model: ModelType
    variants: List[ExperimentVariant]
    channel: Channel
    config_name: str
    batch_name: Optional[str] = None
    task: Optional[TaskType] = None
    batches_config_path: Optional[str] = None
    multi_agent: bool = False
    guidance: Optional[GuidanceType] = None

    @classmethod
    def from_args(cls, args):
        return cls(
            model=ModelType(args.model),
            variants=[ExperimentVariant(v) for v in args.variants.split(",")],
            channel=Channel(args.channel),
            config_name=args.config_name,
            batch_name=getattr(args, 'batch_name', None),
            task=TaskType(getattr(args, 'task', None)) if getattr(args, 'task', None) else None,
            batches_config_path=getattr(args, 'batches_config_path', None),
            multi_agent=getattr(args, 'multi_agent', False),
            guidance=GuidanceType(getattr(args, 'guidance', None)) if getattr(args, 'guidance', None) else None
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "model": self.model.value,
            "variants": [v.value for v in self.variants],
            "channel": self.channel.value,
            "config_name": self.config_name,
            "batch_name": self.batch_name,
            "task": self.task.value if self.task else None,
            "batches_config_path": self.batches_config_path,
            "multi_agent": self.multi_agent,
            "guidance": self.guidance.value if self.guidance else None,
        }

class BaseExperiment:
    def __init__(self, config: ExperimentConfig):
        self.config = config
        self.setup_environment()
        self.logger = ExperimentLogger(
            experiment_id=f"{config.config_name}-{config.model.value}-{config.variants[0].value}",
            log_dir=self.results_dir
        )
        self.logger.log_config(config.to_dict())
        
    def setup_environment(self):        
        self.experiment_config = load_experiment_config(self.config.config_name)
        
        self.channel_config = self.experiment_config["channels"].get(self.config.channel.value)
        if self.channel_config is None:
            raise ValueError(f"[ERROR] Channel '{self.config.channel.value}' not found in config.yaml")
        
        self.benchmark_dir = Path(self.experiment_config["benchmark_dir"])
        self.results_dir = Path(self.experiment_config["results_dir"])
        if self.config.task:
            self.results_dir = self.results_dir / self.config.task.value
        if self.config.variants:
            self.results_dir = self.results_dir / self.config.variants[0].value
        self.results_dir.mkdir(parents=True, exist_ok=True)
        
        self.api_base_url = self.channel_config["api_base_url"]
        self.figma_api_token = os.getenv("FIGMA_API_TOKEN")
        self.figma_base_url = "https://api.figma.com/v1"
        self.headers = {"X-Figma-Token": self.figma_api_token}
        
        self.allowed_ids = self._load_batch_ids() if self.config.batch_name else None

    def set_langsmith_metadata(self):
        project = f"{self.config.config_name}-{self.config.model.value}"
        tags = []
        
        if self.config.variants:
            tags.append(f"input_condition={','.join(v.value for v in self.config.variants)}")
        if self.config.guidance:
            tags.append(f"guidance={self.config.guidance.value}")
        if self.config.channel:
            tags.append(f"channel={self.config.channel.value}")
        
        machine = os.getenv("MACHINE_ID", "0")
        if machine:
            tags.append(f"machine={machine}")

    def _load_batch_ids(self) -> Optional[set]:
        """Batch ID Load"""
        if not self.config.batches_config_path:
            print(f"nothing in {self.config.batches_config_path}")
            return None
            
        try:
            with open(self.config.batches_config_path, "r") as f:
                batch_yaml = yaml.safe_load(f)
            batch_file_path = batch_yaml["batches"].get(self.config.batch_name)
            if batch_file_path is None:
                raise ValueError(f"[ERROR] batch_name '{self.config.batch_name}' not found in {self.config.batches_config_path}")
            with open(batch_file_path, "r") as f:
                return set(line.strip() for line in f)
        except Exception as e:
            raise RuntimeError(f"[ERROR] Failed to load batch from YAML: {e}")

    async def ensure_canvas_empty(self):
        for _ in range(3):
            try:
                del_res = requests.post(f"{self.api_base_url}/tool/delete_all_top_level_nodes")

                if del_res.status_code == 200:
                    try:
                        status = del_res.json().get("status", "")
                    except Exception:
                        status = ""

                    if status == "success":
                        self.logger.info("[CLEANUP] Canvas is now empty (or already empty)")
                        return
                    else:
                        self.logger.info(f"[CLEANUP-RETRY] Unexpected response status: {status}")
                else:
                    self.logger.info(f"[CLEANUP-RETRY] HTTP {del_res.status_code}")

            except Exception as e:
                self.logger.error(f"[CLEANUP-ERROR] Exception during cleanup: {e}")

            await asyncio.sleep(1)

        raise RuntimeError("Canvas cleanup failed after retries")

    async def create_root_frame(self, session: aiohttp.ClientSession) -> Dict[str, Any]:
        params = {"x": 0, "y": 0, "width": 320, "height": 720, "name": "Frame"}
        async with session.post(f"{self.api_base_url}/tool/create_root_frame", params=params) as res:
            return await res.json()

    async def get_document_info(self) -> Dict[str, Any]:
        """Fetch page hierarchy info via updated `get_page_structure` tool."""
        try:
            response = requests.post(f"{self.api_base_url}/tool/get_page_structure")
            if response.status_code != 200:
                return {}

            payload = response.json()
            if isinstance(payload, dict) and "structuredContent" in payload:
                return payload["structuredContent"]

            if "message" in payload:
                try:
                    return json.loads(payload["message"])
                except Exception:
                    return {}
            return {}
        except Exception:
            return {}

    async def run(self):
        # TODO: Implement run_*_experiment.py to inherit this
        raise NotImplementedError

    async def _save_snapshots(self, payload: Dict[str, Any], result_dir: Path, result_name: str):
        """Save each snapshot contained in the server payload.

        For every snapshot object we create:
          * Full snapshot JSON file
          * PNG decoded from the `image_uri` if it is a base64 data URI
          * Structure JSON for quick inspection
        The files will be placed under `<result_dir>/snapshots/`.
        """
        snapshots = payload.get("snapshots") if isinstance(payload, dict) else None
        if not snapshots:
            return  # Nothing to do

        snapshots_dir = result_dir / "snapshots"
        snapshots_dir.mkdir(parents=True, exist_ok=True)

        for snap in snapshots:
            try:
                turn = snap.get("turn", 0)
                # ------------------------------------------------------------------
                # 1) Save raw snapshot JSON
                # ------------------------------------------------------------------
                snapshot_json_path = snapshots_dir / f"{result_name}-snapshot-{turn}.json"
                with open(snapshot_json_path, "w", encoding="utf-8") as f:
                    json.dump(snap, f, indent=2, ensure_ascii=False)

                # ------------------------------------------------------------------
                # 2) Optionally save structure separately for convenience
                # ------------------------------------------------------------------
                structure = snap.get("structure")
                if structure is not None:
                    structure_path = snapshots_dir / f"{result_name}-snapshot-{turn}-structure.json"
                    with open(structure_path, "w", encoding="utf-8") as f:
                        json.dump(structure, f, indent=2, ensure_ascii=False)

                # ------------------------------------------------------------------
                # 3) Decode image from data URI if available
                # ------------------------------------------------------------------
                image_uri = snap.get("image_uri")
                if image_uri and "," in image_uri:  # likely a data URI
                    try:
                        b64_data = image_uri.split(",", 1)[1]
                        image_bytes = base64.b64decode(b64_data)
                        img_path = snapshots_dir / f"{result_name}-snapshot-{turn}.png"
                        with open(img_path, "wb") as img_f:
                            img_f.write(image_bytes)
                    except Exception as e:
                        self.logger.warning(f"[SNAPSHOT] Failed to decode image for turn {turn}: {e}")
            except Exception as e:
                self.logger.warning(f"[SNAPSHOT] Error processing snapshot: {e}")

    async def save_results(self, result, result_name):
        """
        Utilises the payload returned by the MCP client instead of re-querying
        the Figma REST API. Saves:
          1. Full raw response from the server
          2. json_structure as independent JSON file
          3. Decoded PNG of the returned image_uri
          4. history and raw model responses for further debugging
        """

        self.logger.info(f"[SAVE] Processing result for {result_name}")

        result_dir = self.results_dir / result_name
        result_dir.mkdir(parents=True, exist_ok=True)

        # 1) Save full raw response
        raw_response_file = result_dir / f"{result_name}-raw-response.json"
        with open(raw_response_file, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        self.logger.info(f"[SAVE] Raw response saved to {raw_response_file}")

        # Guard – make sure payload exists
        if not isinstance(result, dict) or result.get("status") != "success":
            self.logger.warning("[SAVE] Result status is not 'success'. Skipping payload extraction.")
            return

        payload = result.get("payload", {})

        # 2) Save json_structure
        json_structure = payload.get("json_structure")
        if json_structure is not None:
            json_structure_file = result_dir / f"{result_name}-json-structure.json"
            with open(json_structure_file, "w", encoding="utf-8") as f:
                json.dump(json_structure, f, indent=2, ensure_ascii=False)
            self.logger.info(f"[SAVE] json_structure saved to {json_structure_file}")
        else:
            self.logger.warning("[SAVE] No json_structure found in payload.")

        # 3) Save base64 image as PNG
        image_uri = payload.get("image_uri")
        if image_uri:
            try:
                # Extract base64 portion
                if "," in image_uri:
                    b64_data = image_uri.split(",", 1)[1]
                else:
                    b64_data = image_uri
                image_bytes = base64.b64decode(b64_data)
                image_path = result_dir / f"{result_name}-canvas.png"
                with open(image_path, "wb") as f:
                    f.write(image_bytes)
                self.logger.info(f"[SAVE] Canvas image saved to {image_path}")
            except Exception as e:
                self.logger.warning(f"[SAVE] Failed to decode image_uri: {e}")
        else:
            self.logger.warning("[SAVE] No image_uri found in payload.")

        # 4) Save history & model responses if present
        for key in ("history", "responses"):
            if key in payload:
                file_path = result_dir / f"{result_name}-{key}.json"
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(payload[key], f, indent=2, ensure_ascii=False)
                self.logger.info(f"[SAVE] {key} saved to {file_path}")

        # 5) Save snapshots if present
        await self._save_snapshots(payload, result_dir, result_name)

    async def handle_error(self, error: Exception, context: str):
        self.logger.error(f"Error in {context}: {str(error)}")

    # ----------------------------------------------------------------------
    #  Lock helpers for safe parallel execution
    # ----------------------------------------------------------------------
    def _acquire_lock(self, lock_name: str):
        """Attempt to create a .lock file atomically.

        Returns the Path of the lock file if acquired successfully, otherwise
        returns None to indicate the lock is already held by another process.
        """
        lock_path = self.results_dir / f"{lock_name}.lock"
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            return lock_path
        except FileExistsError:
            # Another process already created the lock.
            return None
        except Exception as e:
            # Any unexpected error is treated as lock acquisition failure.
            if hasattr(self, "logger"):
                self.logger.warning(f"[LOCK] Unexpected error acquiring lock {lock_path}: {e}")
            return None

    def _release_lock(self, lock_path):
        """Safely remove a previously acquired lock file."""
        try:
            lock_path.unlink(missing_ok=True)
        except Exception as e:
            if hasattr(self, "logger"):
                self.logger.warning(f"[LOCK] Failed to release lock {lock_path}: {e}")