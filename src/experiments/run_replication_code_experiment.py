import os
import json
import asyncio
import aiohttp
import argparse
import base64
from pathlib import Path
from dotenv import load_dotenv
from .base_runner import BaseExperiment, ExperimentConfig, parse_common_args
from .enums import ExperimentVariant
from config import load_experiment_config

load_dotenv()

class CodeReplicationExperiment(BaseExperiment):
    def __init__(self, config: ExperimentConfig):
        super().__init__(config)
        # Code agent doesn't need Figma timeout since it uses Puppeteer
        self.timeout = 120  # Increased timeout for HTML rendering (Puppeteer can take time)
        
    def setup_environment(self):
        """Override to skip Figma-specific setup for code agent"""
        self.experiment_config = load_experiment_config(self.config.config_name)
        
        # For code agent, we only need the API URL, not Figma channel
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
        
        # Only need API URL for code agent
        self.api_base_url = self.channel_config["api_base_url"]
        
        # Skip Figma-specific setup
        # self.figma_api_token = os.getenv("FIGMA_API_TOKEN")
        # self.figma_base_url = "https://api.figma.com/v1"
        # self.headers = {"X-Figma-Token": self.figma_api_token}
        
        self.allowed_ids = self._load_batch_ids() if self.config.batch_name else None

    async def run(self):
        self.logger.info(f"Starting code replication experiment with model: {self.config.model.value}")
        self.logger.info(f"Variants: {[v.value for v in self.config.variants]}")
        if self.config.batch_name:
            self.logger.info(f"Batch: {self.config.batch_name}")
        
        # No timeout for code agent since Puppeteer rendering can take time
        timeout = aiohttp.ClientTimeout(total=None)
        async with aiohttp.ClientSession(timeout=timeout) as session:

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

                    # --------------------------------------------------
                    # AUTO MODE: skip prompts and handle automatically (with lock)
                    # --------------------------------------------------
                    if getattr(self.config, "auto", False):
                        # Acquire lock to prevent concurrent processing of the same sample
                        lock_path = self._acquire_lock(result_name)
                        if lock_path is None:
                            self.logger.info(f"[AUTO] Another process already working on {result_name}. Skipping.")
                            continue
                        try:
                            # If results already exist, no need to regenerate
                            if result_dir.exists():
                                self.logger.info(f"[AUTO] Result already exists. Skipping: {result_name}")
                                continue  # finally clause will release lock

                            # Single attempt in auto mode
                            result = await self.run_variant(
                                session, image_path, meta_json, result_name, variant
                            )
                            if result is None:
                                # Skip this sample silently in auto mode
                                continue  # lock released in finally

                            await self.save_results(result, result_name)
                        finally:
                            # Always release lock regardless of outcome
                            self._release_lock(lock_path)
                        continue  # move to next meta

                    # --------------------------------------------------
                    # INTERACTIVE MODE (default)
                    # --------------------------------------------------
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
                        result = await self.run_variant(
                            session, image_path, meta_json, result_name, variant
                        )

                        if result is None:
                            user_choice = input(
                                "[ERROR] Generation failed. Retry? [y] retry / [s] skip / [q] quit > "
                            ).strip().lower()
                            if user_choice == 'y':
                                continue  # retry same sample
                            elif user_choice == 's':
                                self.logger.info(f"[SKIP] Skipping failed sample: {result_name}")
                                break  # move to next sample
                            elif user_choice == 'q':
                                self.logger.warning("[ABORT] Stopping experiment early.")
                                return
                            else:
                                print("Invalid input. Please enter y / s / q.")
                                continue

                        user_input = input(
                            f"[REVIEW] Save this result?[y] yes proceed or [n] retry same sample or[q] quit > "
                        ).strip().lower()

                        if user_input == 'y':
                            await self.save_results(result, result_name)
                            break
                        elif user_input == 'n':
                            self.logger.info(f"[RETRY] Retrying {result_name}")
                        elif user_input == 'q':
                            self.logger.warning("[ABORT] Stopping experiment early.")
                            return
                        else:
                            print("Invalid input. Please enter y / n / q.")

    async def run_variant(self, session, image_path, meta_json, result_name, variant):
        variant_value = variant.value

        if variant_value == ExperimentVariant.IMAGE_ONLY.value:
            endpoint = "generate/image"
            message_text = None
        elif variant_value == ExperimentVariant.TEXT_LEVEL_1.value:
            endpoint = "generate/text-image"
            message_text = meta_json.get("description_one", "")
        elif variant_value == ExperimentVariant.TEXT_LEVEL_2.value:
            endpoint = "generate/text-image"
            message_text = meta_json.get("description_two", "")
        else:
            raise ValueError(f"Unknown variant: {variant_value}")
        
        # ------------------------------------------------------------------
        #  Helper: Build metadata (base config from YAML + dynamic fields)
        # ------------------------------------------------------------------

        base_meta = self.experiment_config["models"][self.config.model.value]
        # Code agent always uses code_replication agent type
        agent_type = "code_replication"
        repo_frame_name = self.experiment_config.get("repo_frame_name", "ResultsRepo")
        repo_frame_id = self.experiment_config.get("repo_frame_id")

        def build_metadata():
            metadata = {
                "case_id": result_name,
                "model_provider": base_meta["provider"],
                "model_name": base_meta["name"],
                "agent_type": agent_type,
                "temperature": base_meta.get("temperature", 0.7),
                "input_cost": base_meta.get("input_cost", 0.0),
                "output_cost": base_meta.get("output_cost", 0.0),
                "max_tokens": base_meta.get("max_tokens", 2048),
                "max_turns": base_meta.get("max_turns", 1),  # Code agent always single turn
                "repo_frame_name": repo_frame_name,
                **({"repo_frame_id": repo_frame_id} if repo_frame_id else {}),
            }
            return json.dumps(metadata)

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

            form.add_field("metadata", build_metadata())
            return form

        for attempt in range(3):
            try:
                self.logger.info(f"Calling {endpoint} (attempt {attempt + 1}/3)")
                form_data = build_form_data()
                self.logger.info(f"API URL: {self.api_base_url}/{endpoint}")
                self.logger.info(f"Metadata: {build_metadata()}")
                
                async with session.post(f"{self.api_base_url}/{endpoint}", data=form_data) as res:
                    if res.status != 200:
                        error_text = await res.text()
                        self.logger.error(f"HTTP {res.status}: {error_text}")
                        return None
                    
                    response_json = await res.json()
                    self.logger.info(f"Response received: {response_json.get('status', 'unknown')}")
                    if 'payload' in response_json:
                        payload = response_json['payload']
                        self.logger.info(f"Payload keys: {list(payload.keys())}")
                        
                        # Check json_structure for code agent
                        if 'json_structure' in payload:
                            json_structure = payload['json_structure']
                            self.logger.info(f"JSON structure type: {type(json_structure)}")
                            if isinstance(json_structure, dict) and 'html' in json_structure:
                                html_code = json_structure['html']
                                self.logger.info(f"HTML code length: {len(html_code)}")
                                if len(html_code) == 0:
                                    self.logger.warning("HTML code is empty - code extraction may have failed")
                        
                        # Check image_uri for code agent
                        if 'image_uri' in payload:
                            image_uri = payload['image_uri']
                            self.logger.info(f"Image URI length: {len(image_uri)}")
                            if len(image_uri) == 0:
                                self.logger.warning("Image URI is empty - Puppeteer rendering may have failed")
                    
                    return response_json
            except Exception as e:
                self.logger.warning(f"Request failed: {e}")
                self.logger.warning(f"Exception type: {type(e).__name__}")
                await asyncio.sleep(2)

        # All attempts failed – log and return None so caller can skip this sample
        self.logger.error(f"[SKIP] Failed to get response after 3 retries for {result_name}")
        return None

def parse_args():
    parser = argparse.ArgumentParser(description="Run code replication experiments")
    parser = parse_common_args(parser)
    parser.add_argument("--auto", action="store_true", help="Run in non-interactive auto-save mode")
    return parser.parse_args()

async def main():
    args = parse_args()
    config = ExperimentConfig.from_args(args)
    setattr(config, "auto", getattr(args, "auto", False))
    experiment = CodeReplicationExperiment(config)
    await experiment.run()

if __name__ == "__main__":
    asyncio.run(main())