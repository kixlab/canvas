import subprocess
import sys
from itertools import product

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None

# ==============================================================================
# Configuration
# ==============================================================================
# Define all combinations for the evaluation runs.
# Each tuple in the list is (task, variant, model)
EVALUATION_MATRIX = {
    "replication_gen": {
        "variants": ["image_only"],
        "models": ["gpt-4o", "gpt-4.1", "claude-3-5-sonnet", "gemini-2.5-pro", "gemini-2.5-flash"]
    },
    # "modification_gen": {
    #     "variants": ["task-1", "task-2", "task-3"],
    #     "models": ["gpt-4o", "gpt-4.1", "claude-3-5-sonnet", "gemini-2.5-pro", "gemini-2.5-flash"]
    # }
}

# Base command arguments that are common to all runs
BASE_ARGS = [
    "--eval_snapshots",
    "--vis",
    # "--skip_all"  # Skip already completed evaluations
]

# ==============================================================================
# Execution Logic
# ==============================================================================

def run_command(command: list, run_info: str):
    """Executes a command and streams its output."""
    if tqdm:
        tqdm.write(f"\n{'='*80}")
        tqdm.write(f"🚀 {run_info}")
        tqdm.write(f"📋 Command: {' '.join(command)}")
        tqdm.write(f"{'='*80}")
    else:
        tqdm.write(f"\n{'='*80}")
        tqdm.write(f"🚀 {run_info}")
        tqdm.write(f"📋 Command: {' '.join(command)}")
        tqdm.write(f"{'='*80}")
    
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        bufsize=1
    )

    for line in iter(process.stdout.readline, ''):
        if tqdm:
            tqdm.write(line.rstrip())
        else:
            sys.stdout.write(line)
            sys.stdout.flush()

    process.wait()
    if tqdm:
        tqdm.write(f"{'='*80}")
        if process.returncode == 0:
            tqdm.write(f"✅ {run_info} - Completed successfully")
        else:
            tqdm.write(f"❌ {run_info} - Failed with return code {process.returncode}")
        tqdm.write(f"{'='*80}\n")
    else:
        tqdm.write(f"{'='*80}")
        if process.returncode == 0:
            tqdm.write(f"✅ {run_info} - Completed successfully")
        else:
            tqdm.write(f"❌ {run_info} - Failed with return code {process.returncode}")
        tqdm.write(f"{'='*80}\n")
    
    return process.returncode == 0


def main():
    """Main function to orchestrate all evaluation runs."""
    commands_to_run = []
    run_descriptions = []
    
    for task, config in EVALUATION_MATRIX.items():
        for variant, model in product(config["variants"], config["models"]):
            command = [
                sys.executable,  # Use the same python interpreter that runs this script
                "-m", "evaluation.eval_pipeline",
                "--task", task,
                "--variant", variant,
                "--model", model,
                *BASE_ARGS
            ]
            commands_to_run.append(command)
            run_descriptions.append(f"{task} | {variant} | {model}")

    total_runs = len(commands_to_run)
    tqdm.write(f"🎯 Found {total_runs} evaluation combinations to run.")
    tqdm.write(f"📊 Breakdown:")
    for task, config in EVALUATION_MATRIX.items():
        task_runs = len(config["variants"]) * len(config["models"])
        tqdm.write(f"   - {task}: {task_runs} runs")
    tqdm.write("")
    
    successful_runs = 0
    failed_runs = 0
    
    if tqdm:
        # Use tqdm for overall progress
        for i, (command, description) in enumerate(tqdm(
            zip(commands_to_run, run_descriptions), 
            total=total_runs,
            desc="Overall Progress",
            unit="eval",
            position=0,
            leave=True,
            ncols=100,
            dynamic_ncols=True,
            file=sys.stderr
        )):
            success = run_command(command, f"Run {i+1}/{total_runs}: {description}")
            if success:
                successful_runs += 1
            else:
                failed_runs += 1
    else:
        # Fallback without tqdm
        for i, (command, description) in enumerate(zip(commands_to_run, run_descriptions)):
            success = run_command(command, f"Run {i+1}/{total_runs}: {description}")
            if success:
                successful_runs += 1
            else:
                failed_runs += 1
        
    if tqdm:
        tqdm.write(f"🎉 All evaluation runs are complete!")
        tqdm.write(f"📈 Summary: {successful_runs} successful, {failed_runs} failed out of {total_runs} total runs")
    else:
        tqdm.write(f"🎉 All evaluation runs are complete!")
        tqdm.write(f"📈 Summary: {successful_runs} successful, {failed_runs} failed out of {total_runs} total runs")


if __name__ == "__main__":
    main() 