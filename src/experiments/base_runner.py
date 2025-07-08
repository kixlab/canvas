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
    parser.add_argument("--use-langsmith", action="store_true",
                      help="Enable LangSmith logging")
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
    use_langsmith: bool = False

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
            guidance=GuidanceType(getattr(args, 'guidance', None)) if getattr(args, 'guidance', None) else None,
            use_langsmith=getattr(args, 'use_langsmith', False)
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
            "use_langsmith": self.use_langsmith
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
        # LangSmith Setting (Optional)
        if self.config.use_langsmith:
            self.set_langsmith_metadata()
        
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
        self.figma_file_key = self.channel_config["figma_file_key"]
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
        
        os.environ["LANGCHAIN_PROJECT"] = project
        os.environ["LANGSMITH_EXPERIMENT_TAGS"] = ",".join(tags)

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

    async def fetch_figma_hierarchy(self) -> dict:
        url = f"{self.figma_base_url}/files/{self.figma_file_key}"
        async with aiohttp.ClientSession(headers=self.headers) as session:
            async with session.get(url) as resp:
                data = await resp.json()
                self.logger.info("[Figma] Retrieved hierarchy.")
                return data

    async def export_figma_images(self, node_ids: list[str], format: str = "png", scale: int = 1) -> dict:
        url = f"{self.figma_base_url}/images/{self.figma_file_key}"
        params = {"ids": ",".join(node_ids), "format": format, "scale": scale}
        async with aiohttp.ClientSession(headers=self.headers) as session:
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                self.logger.info(f"[Figma] Exported images for {len(node_ids)} nodes.")
                return data.get("images", {})

    async def save_figma_export(self, hierarchy: dict, image_urls: dict, file_prefix: str = "figma_export") -> None:
        result = {"hierarchy": hierarchy, "image_urls": image_urls}
        out_path = self.results_dir / f"{file_prefix}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        self.logger.info(f"[Save] Figma export saved to {out_path}")

    async def run(self):
        # TODO: Implement run_*_experiment.py to inherit this
        raise NotImplementedError

    async def save_results(self, results: Dict[str, Any], result_name: str):
        result_dir = self.results_dir / result_name
        result_dir.mkdir(parents=True, exist_ok=True)

        json_response_file = result_dir / f"{result_name}-json-response.json"
        with open(json_response_file, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        self.logger.info(f"Saved results to {json_response_file}")

        hierarchy = await self.fetch_figma_hierarchy()
        hierarchy_file = result_dir / f"{result_name}-figma-hierarchy.json"
        with open(hierarchy_file, "w", encoding="utf-8") as f:
            json.dump(hierarchy, f, indent=2, ensure_ascii=False)
        self.logger.info(f"Saved Figma hierarchy to {hierarchy_file}")

        try:
            top_level_nodes = [
                node["id"]
                for node in hierarchy.get("document", {}).get("children", [])
                if node.get("type") == "FRAME"
            ]
        except Exception as e:
            self.logger.warning(f"[Figma] Failed to extract frame node IDs: {e}")
            top_level_nodes = []

        if top_level_nodes:
            image_urls = await self.export_figma_images(top_level_nodes)
            image_url_file = result_dir / f"{result_name}-figma-images.json"
            with open(image_url_file, "w", encoding="utf-8") as f:
                json.dump(image_urls, f, indent=2, ensure_ascii=False)
            self.logger.info(f"Saved Figma image URLs to {image_url_file}")

    async def handle_error(self, error: Exception, context: str):
        self.logger.error(f"Error in {context}: {str(error)}")