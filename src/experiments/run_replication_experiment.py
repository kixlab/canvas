import os
import json
import asyncio
import aiohttp
import argparse
import base64
from pathlib import Path
from dotenv import load_dotenv
from .base_runner import BaseExperiment, ExperimentConfig, parse_common_args

# ---------------------------------------------------------------------------
# NOTE
# We intentionally keep the auto-mode implementation local to this script so
# that core BaseExperiment / ExperimentConfig are untouched. The flag is parsed
# here and stored dynamically in the `config` object created below.
# ---------------------------------------------------------------------------
from .enums import ExperimentVariant

load_dotenv()

# NOTE: Name aligned with script filename
class ReplicationExperiment(BaseExperiment):
    def __init__(self, config: ExperimentConfig):
        super().__init__(config)
        self.figma_timeout = 30

    async def run(self):
        self.logger.info(f"Starting replication experiment with model: {self.config.model.value}")
        self.logger.info(f"Variants: {[v.value for v in self.config.variants]}")
        if self.config.batch_name:
            self.logger.info(f"Batch: {self.config.batch_name}")
        
        timeout = aiohttp.ClientTimeout(total=None)
        async with aiohttp.ClientSession(timeout=timeout) as session:

            # ----------------------------------------------------------
            #  (1) Switch to desired Figma channel if specified
            # ----------------------------------------------------------
            desired_channel = self.channel_config.get("channel_code")
            if desired_channel:
                try:
                    self.logger.info(f"[CHANNEL] Switching to channel {desired_channel}")
                    async with session.post(f"{self.api_base_url}/tool/select_channel", params={"channel": desired_channel}) as resp:
                        if resp.status != 200:
                            self.logger.warning(f"Failed to switch channel (HTTP {resp.status})")
                except Exception as e:
                    self.logger.warning(f"Exception while switching channel: {e}")

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
                    # AUTO MODE: skip prompts and handle automatically
                    # --------------------------------------------------
                    if getattr(self.config, "auto", False):
                        if result_dir.exists():
                            self.logger.info(f"[AUTO] Result already exists. Skipping: {result_name}")
                            continue

                        # Single attempt in auto mode
                        result = await self.run_variant(
                            session, image_path, meta_json, result_name, variant
                        )
                        if result is None:
                            # Skip this sample silently in auto mode
                            continue
                        await self.save_results(result, result_name)
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
        agent_type = self.experiment_config.get("agent_type", "react")
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
                "max_turns": base_meta.get("max_turns", 6),
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
                async with session.post(f"{self.api_base_url}/{endpoint}", data=form_data) as res:
                    return await res.json()
            except Exception as e:
                self.logger.warning(f"Request failed: {e}")
                await asyncio.sleep(2)

        # All attempts failed – log and return None so caller can skip this sample
        self.logger.error(f"[SKIP] Failed to get response after 3 retries for {result_name}")
        return None

    async def save_results(self, result, result_name):
        """Override BaseExperiment.save_results.

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

def parse_args():
    parser = argparse.ArgumentParser(description="Run sample extraction experiments")
    parser = parse_common_args(parser)
    parser.add_argument("--auto", action="store_true", help="Run in non-interactive auto-save mode")
    return parser.parse_args()

async def main():
    args = parse_args()
    config = ExperimentConfig.from_args(args)
    setattr(config, "auto", getattr(args, "auto", False))
    experiment = ReplicationExperiment(config)
    await experiment.run()

if __name__ == "__main__":
    asyncio.run(main())
