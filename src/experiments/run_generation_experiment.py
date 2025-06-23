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

load_dotenv()

class GenerationExperiment(BaseExperiment):
    def __init__(self, config: ExperimentConfig):
        super().__init__(config)
        self.figma_timeout = 30

    async def run(self):
        self.logger.info(f"Starting generation experiment with model: {self.config.model.value}")
        self.logger.info(f"Variants: {[v.value for v in self.config.variants]}")
        if self.config.batch_name:
            self.logger.info(f"Batch: {self.config.batch_name}")
        
        async with aiohttp.ClientSession() as session:
            try:
                await self.ensure_canvas_empty()
                await self.create_root_frame(session)
                
                for variant in self.config.variants:
                    self.logger.info(f"Running variant: {variant.value}")
                    await self.run_variant(session, variant)
            finally:
                await self.ensure_canvas_empty()
    
    async def run_variant(self, session: aiohttp.ClientSession, variant: str):
        try:
            meta_files = list(self.benchmark_dir.glob("*-meta.json"))
            if not meta_files:
                raise FileNotFoundError(f"No metadata files found in {self.benchmark_dir}")
            
            for meta_file in meta_files:
                try:
                    base_id = meta_file.stem.replace("-meta", "")
                    
                    if self.allowed_ids is not None and base_id not in self.allowed_ids:
                        continue
                    
                    image_path = self.benchmark_dir / f"{base_id}.png"
                    if not image_path.exists():
                        self.logger.warning(f"Image file not found: {image_path}")
                        continue
                    
                    with open(meta_file, "r", encoding="utf-8") as f:
                        meta_json = json.load(f)
                    
                    result_name = f"{base_id}-{self.config.model}-{variant}"
                    self.logger.info(f"Processing result: {result_name}")
                    
                    if variant == "image_only":
                        await self.run_image_only(session, image_path, meta_json, result_name)
                    elif variant == "text_level_1":
                        await self.run_text_level_1(session, image_path, meta_json, result_name)
                    elif variant == "text_level_2":
                        await self.run_text_level_2(session, image_path, meta_json, result_name)
                    else:
                        raise ValueError(f"Unknown variant: {variant}")
                except Exception as e:
                    self.logger.error(f"Error processing {meta_file}: {str(e)}")
                    await self.ensure_canvas_empty()
                    continue
                
        except Exception as e:
            await self.handle_error(e, f"Running variant {variant}")
            await self.ensure_canvas_empty()
    
    async def run_image_only(self, session: aiohttp.ClientSession, image_path: Path, meta_json: dict, result_name: str):
        try:
            self.logger.info("Running image only generation")
            endpoint = "generate/image"
            data = aiohttp.FormData()
            data.add_field("image", image_path.open("rb"), filename=image_path.name, content_type="image/png")
            data.add_field("metadata", result_name)
            
            await self._make_request(session, endpoint, data, result_name)
        finally:
            await self.ensure_canvas_empty()
    
    async def run_text_level_1(self, session: aiohttp.ClientSession, image_path: Path, meta_json: dict, result_name: str):
        try:
            self.logger.info("Running text level 1 generation")
            endpoint = "generate/text-image"
            data = aiohttp.FormData()
            data.add_field("image", image_path.open("rb"), filename=image_path.name, content_type="image/png")
            data.add_field("message", meta_json.get("description_one", ""))
            data.add_field("metadata", result_name)
            
            await self._make_request(session, endpoint, data, result_name)
        finally:
            await self.ensure_canvas_empty()
    
    async def run_text_level_2(self, session: aiohttp.ClientSession, image_path: Path, meta_json: dict, result_name: str):
        try:
            self.logger.info("Running text level 2 generation")
            endpoint = "generate/text-image"
            data = aiohttp.FormData()
            data.add_field("image", image_path.open("rb"), filename=image_path.name, content_type="image/png")
            data.add_field("message", meta_json.get("description_two", ""))
            data.add_field("metadata", result_name)
            
            await self._make_request(session, endpoint, data, result_name)
        finally:
            await self.ensure_canvas_empty()
    
    async def _make_request(self, session: aiohttp.ClientSession, endpoint: str, data: aiohttp.FormData, result_name: str):
        max_retries = 3
        for attempt in range(max_retries):
            try:
                self.logger.info(f"Making request to {endpoint} (attempt {attempt + 1}/{max_retries})")
                async with session.post(f"{self.api_base_url}/{endpoint}", data=data) as res:
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
            finally:
                await self.ensure_canvas_empty()

def parse_args():
    parser = argparse.ArgumentParser(description="Run UI generation experiments")
    parser = parse_common_args(parser)
    return parser.parse_args()

async def main():
    args = parse_args()
    config = ExperimentConfig.from_args(args)
    experiment = GenerationExperiment(config)
    await experiment.run()

if __name__ == "__main__":
    asyncio.run(main())