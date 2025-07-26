import os
import subprocess
import argparse
from pathlib import Path

def zip_task_results(task_number: int):
    # Base directory path
    task_dir = Path(f'/home/seoyeon/samsung-cxi-mcp-server/dataset/results/modification_gen/task-{task_number}')
    
    if not task_dir.is_dir():
        print(f"Error: Directory {task_dir} not found.")
        return
    
    # Output zip file path
    output_zip = task_dir.parent / f'task{task_number}_results.zip'
    
    # Remove existing zip file if it exists
    if output_zip.exists():
        os.remove(output_zip)
        print(f"Removed existing zip file: {output_zip}")
    
    # Change to the parent directory of task-N
    os.chdir(task_dir.parent)
    
    try:
        # Use zip command with -r (recursive) option to include all files and subdirectories
        # -y to store symbolic links
        # -q for quiet operation (remove this if you want to see all files being added)
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
        total_files = len(result.stdout.strip().split('\n')) - 4  # Subtract header and footer lines
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
    
    args = parser.parse_args()
    
    if args.tasks:
        # If multiple tasks are specified, process them all
        for task_num in args.tasks:
            print(f"\nProcessing task-{task_num}...")
            zip_task_results(task_num)
    else:
        # Process single task
        zip_task_results(args.task_number)

if __name__ == '__main__':
    main() 