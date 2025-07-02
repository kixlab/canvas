import json
import csv
import os

json_path = os.path.join(os.path.dirname(__file__), '../evaluation/evaluation_results.json')
csv_path = os.path.join(os.path.dirname(__file__), '../evaluation/evaluation_results.csv')

def main():
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    all_keys = set()
    for row in data:
        all_keys.update(row.keys())
    all_keys = list(all_keys)
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=all_keys)
        writer.writeheader()
        for row in data:
            row = {k: (str(v) if isinstance(v, list) else v) for k, v in row.items()}
            writer.writerow(row)
    print(f"Saved: {csv_path}")

if __name__ == '__main__':
    main() 