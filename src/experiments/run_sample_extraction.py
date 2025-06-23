import os
import json
import asyncio
import aiohttp
import argparse
from pathlib import Path
from dotenv import load_dotenv
from .base_runner import BaseExperiment, ExperimentConfig, parse_common_args
from .enums import ExperimentVariant

load_dotenv()

class SampleExtractionExperiment(BaseExperiment):
    def __init__(self, config: ExperimentConfig):
        super().__init__(config)
        self.figma_timeout = 30

    async def run(self):
        self.logger.info(f"Starting sample extraction with model: {self.config.model.value}")
        self.logger.info(f"Variants: {[v.value for v in self.config.variants]}")
        if self.config.batch_name:
            self.logger.info(f"Batch: {self.config.batch_name}")
        
        async with aiohttp.ClientSession() as session:
            await self.ensure_canvas_empty()
            await self.create_root_frame(session)

            for variant in self.config.variants:
                meta_files = list(self.benchmark_dir.glob("*-meta.json"))
                if not meta_files:
                    raise FileNotFoundError(f"No metadata files found in {self.benchmark_dir}")
                
                for meta_file in meta_files:
                    base_id = meta_file.stem.replace("-meta", "")
                    if self.allowed_ids and base_id not in self.allowed_ids:
                        continue

                    image_path = self.benchmark_dir / f"{base_id}.png"
                    if not image_path.exists():
                        self.logger.warning(f"Image file not found: {image_path}")
                        continue
                    
                    with open(meta_file, "r", encoding="utf-8") as f:
                        meta_json = json.load(f)

                    result_name = f"{base_id}-{self.config.model.value}-{variant.value}"
                    self.logger.info(f"[START] Generating result for: {result_name}")
                    result_dir = self.results_dir / result_name
                    if result_dir.exists():
                        user_input = input(
                            f"[SKIP?] Result directory for '{result_name}' already exists. "
                            "Do you want to skip? [y] skip / [n] overwrite / [q] quit > "
                        ).strip().lower()
                        if user_input == 'y':
                            self.logger.info(f"[SKIP] Skipping already existing result: {result_name}")
                            continue
                        elif user_input == 'q':
                            self.logger.warning("[ABORT] Stopping experiment early.")
                            return
                        elif user_input != 'n':
                            print("Invalid input. Please enter y / n / q.")
                            continue

                    while True:
                        result = await self.run_variant(session, image_path, meta_json, result_name, variant)
                        user_input = input(
                            f"[REVIEW] Save this result?[y] yes proceed or [n] retry same sample or[q] quit > "
                        ).strip().lower()

                        if user_input == 'y':
                            await self.save_results(result, result_name)
                            await self.ensure_canvas_empty()
                            break
                        elif user_input == 'n':
                            self.logger.info(f"[RETRY] Retrying {result_name}")
                            await self.ensure_canvas_empty()
                        elif user_input == 'q':
                            self.logger.warning("[ABORT] Stopping experiment early.")
                            return
                        else:
                            print("Invalid input. Please enter y / n / q.")

    async def run_variant(self, session, image_path, meta_json, result_name, variant):
        if variant == "image_only":
            endpoint = "generate/image"
            message_text = None
        elif variant == "text_level_1":
            endpoint = "generate/text-image"
            message_text = meta_json.get("description_one", "")
        elif variant == "text_level_2":
            endpoint = "generate/text-image"
            message_text = meta_json.get("description_two", "")
        else:
            raise ValueError(f"Unknown variant: {variant}")
        
        def build_form_data():
            form = aiohttp.FormData()
            form.add_field(
                "image",
                image_path.open("rb"),
                filename=image_path.name,
                content_type="image/png",
            )
            if message_text is not None:
                form.add_field("message", message_text)

            form.add_field("metadata", result_name)
            return form

        for attempt in range(3):
            try:
                self.logger.info(f"Calling {endpoint} (attempt {attempt + 1}/3)")
                form_data = build_form_data()
                async with session.post(f"{self.api_base_url}/{endpoint}", data=form_data) as res:
                    return await res.json()
            except Exception as e:
                self.logger.warning(f"Request failed: {e}")
                await asyncio.sleep(2)
        raise RuntimeError("Failed to get response after retries")

def parse_args():
    parser = argparse.ArgumentParser(description="Run sample extraction experiments")
    parser = parse_common_args(parser)
    return parser.parse_args()

async def main():
    args = parse_args()
    config = ExperimentConfig.from_args(args)
    experiment = SampleExtractionExperiment(config)
    await experiment.run()

if __name__ == "__main__":
    asyncio.run(main())
