import os
import re
import json
import asyncio
import aiohttp
import io
from pathlib import Path
from dotenv import load_dotenv
import argparse
from .base_runner import BaseExperiment, ExperimentConfig, parse_common_args
from .enums import ExperimentVariant

load_dotenv()

class ModificationExperiment(BaseExperiment):
    def __init__(self, config: ExperimentConfig):
        super().__init__(config)
        self.figma_timeout = 30
        
    async def run(self):
        self.logger.info(f"Starting modification experiment with model: {self.config.model.value}")
        self.logger.info(f"Variants: {[v.value for v in self.config.variants]}")
        self.logger.info(f"Task: {self.config.task.value if self.config.task else None}")
        
        async with aiohttp.ClientSession() as session:
            await self.ensure_canvas_empty()
            await self.create_root_frame(session)
            
            for variant in self.config.variants:
                self.logger.info(f"Running variant: {variant.value}")
                await self.run_variant(session, variant)
    
    async def run_variant(self, session: aiohttp.ClientSession, variant: ExperimentVariant):
        try:
            meta_files = list(self.benchmark_dir.glob("*-base-meta.json"))
            if not meta_files:
                raise FileNotFoundError(f"No metadata files found in {self.benchmark_dir}")
            
            for meta_file in meta_files:
                base_id = meta_file.stem.replace("-base-meta", "")
                
                if self.allowed_ids is not None and base_id not in self.allowed_ids:
                    continue
                
                image_path = self.benchmark_dir / f"{base_id}-base.png"
                if not image_path.exists():
                    self.logger.warning(f"Image file not found: {image_path}")
                    continue
                
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta_json = json.load(f)
                
                result_name = f"{base_id}-{self.config.model.value}-{variant.value}"
                self.logger.info(f"Processing result: {result_name}")
                
                if variant == ExperimentVariant.WITHOUT_ORACLE:
                    await self.run_without_oracle(session, image_path, meta_json, result_name)
                elif variant == ExperimentVariant.PERFECT_HIERARCHY:
                    await self.run_perfect_hierarchy(session, image_path, meta_json, result_name)
                elif variant == ExperimentVariant.PERFECT_CANVAS:
                    await self.run_perfect_canvas(session, image_path, meta_json, result_name)
                else:
                    raise ValueError(f"Unknown variant: {variant.value}")
                
        except Exception as e:
            await self.handle_error(e, f"Running variant {variant.value}")
    
    async def run_without_oracle(self, session: aiohttp.ClientSession, image_path: Path, meta_json: dict, result_name: str):
        self.logger.info("Running without oracle")
        endpoint = "modify/without-oracle"
        data = aiohttp.FormData()
        data.add_field("message", meta_json.get("instruction", ""))
        data.add_field("image", image_path.open("rb"), filename=image_path.name, content_type="image/png")
        data.add_field("metadata", result_name)
        
        await self._make_request(session, endpoint, data, result_name)
    
    async def run_perfect_hierarchy(self, session: aiohttp.ClientSession, image_path: Path, meta_json: dict, result_name: str):
        self.logger.info("Running with perfect hierarchy")
        endpoint = "modify/with-oracle/perfect-hierachy"
        data = aiohttp.FormData()
        data.add_field("image", image_path.open("rb"), filename=image_path.name, content_type="image/png")
        data.add_field("metadata", result_name)
        
        await self._make_request(session, endpoint, data, result_name)
    
    async def run_perfect_canvas(self, session: aiohttp.ClientSession, image_path: Path, meta_json: dict, result_name: str):
        self.logger.info("Running with perfect canvas")
        endpoint = "modify/with-oracle/perfect-canvas"
        data = aiohttp.FormData()
        data.add_field("message", meta_json.get("instruction", ""))
        data.add_field("metadata", result_name)
        
        await self._make_request(session, endpoint, data, result_name)
    
    async def _make_request(self, session: aiohttp.ClientSession, endpoint: str, data: aiohttp.FormData, result_name: str):
        max_retries = 3
        for attempt in range(max_retries):
            try:
                self.logger.info(f"Making request to {endpoint} (attempt {attempt + 1}/{max_retries})")
                timeout = aiohttp.ClientTimeout(total=self.figma_timeout)
                async with session.post(f"{self.api_base_url}/{endpoint}", data=data, timeout=timeout) as res:
                    result = await res.json()
                    await self.save_results(result, result_name)
                    self.logger.info(f"Successfully saved results for {result_name}")
                    return result
            except Exception as e:
                if attempt < max_retries - 1:
                    self.logger.warning(f"Request failed, retrying in 2 seconds: {str(e)}")
                    await asyncio.sleep(2)
                else:
                    raise

def parse_args():
    parser = argparse.ArgumentParser(description="Run UI modification experiments")
    parser = parse_common_args(parser)
    parser.add_argument("--task", type=str, required=True, help="Task identifier (e.g., task-1, task-2, task-3)")
    return parser.parse_args()

async def main():
    args = parse_args()
    config = ExperimentConfig.from_args(args)
    experiment = ModificationExperiment(config)
    await experiment.run()

if __name__ == "__main__":
    asyncio.run(main())