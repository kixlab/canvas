import os
import subprocess
import argparse
from pathlib import Path

def zip_task_results(task_number: int, model_filter: str = None):
    # Base directory path
    task_dir = Path(f'/home/seoyeon/samsung-cxi-mcp-server/dataset/results/modification_gen/task-{task_number}')
    
    if not task_dir.is_dir():
        print(f"Error: Directory {task_dir} not found.")
        return
    
    # If model filter is specified, create a temporary directory with filtered contents
    if model_filter:
        # Find all subdirectories that match the model filter
        matching_dirs = [d for d in task_dir.iterdir() 
                        if d.is_dir() and model_filter in d.name]
        
        if not matching_dirs:
            print(f"No directories found with '{model_filter}' in task-{task_number}")
            return
        
        print(f"Found {len(matching_dirs)} directories with '{model_filter}' in task-{task_number}")
        
        # Create a temporary directory to store the filtered files
        temp_dir = task_dir.parent / f'task{task_number}_{model_filter.replace("-", "_")}_temp'
        temp_dir.mkdir(exist_ok=True)
        
        try:
            # Copy matching directories to the temporary directory
            for dir_path in matching_dirs:
                dest_path = temp_dir / dir_path.name
                print(f"Copying {dir_path.name}...")
                import shutil
                shutil.copytree(dir_path, dest_path, dirs_exist_ok=True)
            
            # Create zip file from temporary directory
            output_zip = task_dir.parent / f'task{task_number}_{model_filter.replace("-", "_")}_results.zip'
            
            # Remove existing zip file if it exists
            if output_zip.exists():
                os.remove(output_zip)
                print(f"Removed existing zip file: {output_zip}")
            
            # Change to the parent directory
            os.chdir(task_dir.parent)
            
            # Create zip file
            cmd = ['zip', '-ry', output_zip.name, temp_dir.name]
            print(f"Creating zip file for task-{task_number} with {model_filter}...")
            subprocess.run(cmd, check=True)
            print(f"\nZip file created successfully at: {output_zip}")
            
            # Verify the zip file
            print("\nVerifying zip file contents...")
            verify_cmd = ['unzip', '-l', output_zip.name]
            result = subprocess.run(verify_cmd, capture_output=True, text=True, check=True)
            
            # Get total number of files and size
            last_line = result.stdout.strip().split('\n')[-2]
            total_files = len(result.stdout.strip().split('\n')) - 4
            total_size = last_line.split()[0]
            
            print(f"Verification complete:")
            print(f"Total files: {total_files}")
            print(f"Total size: {total_size} bytes")
            
        finally:
            # Clean up: remove temporary directory
            if temp_dir.exists():
                import shutil
                shutil.rmtree(temp_dir)
                print("Cleaned up temporary directory.")
    
    else:
        # Original logic for zipping entire task directory
        output_zip = task_dir.parent / f'task{task_number}_results.zip'
        
        # Remove existing zip file if it exists
        if output_zip.exists():
            os.remove(output_zip)
            print(f"Removed existing zip file: {output_zip}")
        
        # Change to the parent directory of task-N
        os.chdir(task_dir.parent)
        
        try:
            cmd = ['zip', '-ry', f'task{task_number}_results.zip', f'task-{task_number}']
            print(f"Creating zip file for task-{task_number}... This might take a while...")
            subprocess.run(cmd, check=True)
            print(f"\nZip file created successfully at: {output_zip}")
            
            # Verify the zip file
            print("\nVerifying zip file contents...")
            verify_cmd = ['unzip', '-l', f'task{task_number}_results.zip']
            result = subprocess.run(verify_cmd, capture_output=True, text=True, check=True)
            
            # Get total number of files and size
            last_line = result.stdout.strip().split('\n')[-2]
            total_files = len(result.stdout.strip().split('\n')) - 4
            total_size = last_line.split()[0]
            
            print(f"Verification complete:")
            print(f"Total files: {total_files}")
            print(f"Total size: {total_size} bytes")
            
        except subprocess.CalledProcessError as e:
            print(f"Error during zip operation: {e}")
        except Exception as e:
            print(f"Unexpected error: {e}")

def main():
    parser = argparse.ArgumentParser(description='Zip task results directory.')
    parser.add_argument('task_number', type=int, help='Task number to zip (e.g., 1 for task-1)')
    parser.add_argument('--tasks', type=int, nargs='+', help='Multiple task numbers to zip (e.g., 1 2 3)')
    parser.add_argument('--model', type=str, help='Filter by model name (e.g., claude-3-5-sonnet)')
    
    args = parser.parse_args()
    
    if args.tasks:
        # If multiple tasks are specified, process them all
        for task_num in args.tasks:
            print(f"\nProcessing task-{task_num}...")
            zip_task_results(task_num, args.model)
    else:
        # Process single task
        zip_task_results(args.task_number, args.model)

if __name__ == '__main__':
    main() 